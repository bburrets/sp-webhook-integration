jest.mock('pdf-parse', () => jest.fn());
jest.mock('../graph-request', () => ({ graphRequest: jest.fn() }));
jest.mock('../logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()
    }))
}));

const pdfParse = require('pdf-parse');
const { graphRequest } = require('../graph-request');
const {
    extractDocumentText,
    extractPdfText,
    downloadFile,
    MIN_TEXT_LAYER_CHARS,
    MAX_DOWNLOAD_BYTES,
    DOWNLOAD_URL_FIELD
} = require('../document-content-extractor');

function driveItem(overrides = {}) {
    return {
        id: 'item-1',
        name: 'scan_0417.pdf',
        size: 2048,
        parentReference: { driveId: 'drive-1' },
        [DOWNLOAD_URL_FIELD]: 'https://presigned/scan.pdf',
        ...overrides
    };
}

describe('document-content-extractor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        graphRequest.mockResolvedValue({ data: Buffer.from('%PDF-1.4 fake') });
        pdfParse.mockResolvedValue({ text: 'x'.repeat(MIN_TEXT_LAYER_CHARS + 10), numpages: 2 });
    });

    describe('extractPdfText', () => {
        it('normalises CRLF to LF so rule patterns can rely on \\n', () => {
            pdfParse.mockResolvedValue({ text: 'Entity: FAM\r\nPeriod: 202608', numpages: 1 });
            return expect(extractPdfText(Buffer.from('x')))
                .resolves.toMatchObject({ text: 'Entity: FAM\nPeriod: 202608', pageCount: 1 });
        });

        it('tolerates a parser returning no text or page count', async () => {
            pdfParse.mockResolvedValue({});
            await expect(extractPdfText(Buffer.from('x'))).resolves.toEqual({ text: '', pageCount: 0 });
        });
    });

    describe('downloadFile', () => {
        it('uses the pre-signed URL with no Authorization header', async () => {
            await downloadFile({ driveItem: driveItem(), accessToken: 'tok' });
            const call = graphRequest.mock.calls[0][0];
            expect(call.url).toBe('https://presigned/scan.pdf');
            expect(call.accessToken).toBeNull();
            expect(call.responseType).toBe('arraybuffer');
        });

        it('falls back to the authenticated content endpoint', async () => {
            await downloadFile({
                driveItem: driveItem({ [DOWNLOAD_URL_FIELD]: undefined }),
                accessToken: 'tok'
            });
            const call = graphRequest.mock.calls[0][0];
            expect(call.url).toContain('/drives/drive-1/items/item-1/content');
            expect(call.accessToken).toBe('tok');
        });

        it('refuses an oversized file before downloading it', async () => {
            await expect(downloadFile({
                driveItem: driveItem({ size: MAX_DOWNLOAD_BYTES + 1 }),
                accessToken: 't'
            })).rejects.toThrow(/over the .* byte processing limit/);
            expect(graphRequest).not.toHaveBeenCalled();
        });

        it('refuses a response larger than the limit even if size was understated', async () => {
            graphRequest.mockResolvedValue({ data: Buffer.alloc(MAX_DOWNLOAD_BYTES + 1) });
            await expect(downloadFile({ driveItem: driveItem({ size: 10 }), accessToken: 't' }))
                .rejects.toThrow(/over the .* byte processing limit/);
        });

        it('tags the oversize error with a code', async () => {
            const error = await downloadFile({
                driveItem: driveItem({ size: MAX_DOWNLOAD_BYTES + 1 }),
                accessToken: 't'
            }).catch((e) => e);
            expect(error.code).toBe('FILE_TOO_LARGE');
        });
    });

    describe('extractDocumentText', () => {
        it('returns text and flags a usable text layer', async () => {
            pdfParse.mockResolvedValue({ text: 'General Journal Entry\n'.repeat(5), numpages: 1 });
            const result = await extractDocumentText({ driveItem: driveItem(), accessToken: 't' });

            expect(result.hasTextLayer).toBe(true);
            expect(result.unsupported).toBe(false);
            expect(result.text).toContain('General Journal Entry');
            expect(result.charCount).toBeGreaterThan(MIN_TEXT_LAYER_CHARS);
        });

        it('flags no text layer for an empty extraction', async () => {
            // The scanned-PDF gate.
            pdfParse.mockResolvedValue({ text: '', numpages: 4 });
            const result = await extractDocumentText({ driveItem: driveItem(), accessToken: 't' });

            expect(result.hasTextLayer).toBe(false);
            expect(result.charCount).toBe(0);
            expect(result.pageCount).toBe(4);
        });

        it('flags no text layer for a near-empty extraction', async () => {
            // Scanners often embed a stray device banner, so zero is too strict.
            pdfParse.mockResolvedValue({ text: 'Scanned by MFP', numpages: 3 });
            expect((await extractDocumentText({ driveItem: driveItem(), accessToken: 't' })).hasTextLayer).toBe(false);
        });

        it('treats exactly the threshold as usable', async () => {
            pdfParse.mockResolvedValue({ text: 'a'.repeat(MIN_TEXT_LAYER_CHARS), numpages: 1 });
            expect((await extractDocumentText({ driveItem: driveItem(), accessToken: 't' })).hasTextLayer).toBe(true);
        });

        it('marks a non-PDF unsupported without downloading it', async () => {
            const result = await extractDocumentText({
                driveItem: driveItem({ name: 'costing.xlsx' }),
                accessToken: 't'
            });
            expect(result.unsupported).toBe(true);
            expect(graphRequest).not.toHaveBeenCalled();
        });

        it('marks a file with no extension unsupported', async () => {
            const result = await extractDocumentText({ driveItem: driveItem({ name: 'noext' }), accessToken: 't' });
            expect(result.unsupported).toBe(true);
        });

        it('treats a corrupt PDF as no text layer rather than an error', async () => {
            // A document problem, not an infrastructure one: retrying eight
            // times and poisoning the message would tell nobody anything.
            pdfParse.mockRejectedValue(new Error('bad XRef entry'));
            const result = await extractDocumentText({ driveItem: driveItem(), accessToken: 't' });
            expect(result.hasTextLayer).toBe(false);
            expect(result.text).toBe('');
        });

        it('propagates a download failure so the queue can retry', async () => {
            graphRequest.mockRejectedValue(new Error('Graph down'));
            await expect(extractDocumentText({ driveItem: driveItem(), accessToken: 't' }))
                .rejects.toThrow('Graph down');
        });

        it('reports the downloaded byte length', async () => {
            graphRequest.mockResolvedValue({ data: Buffer.alloc(1234) });
            expect((await extractDocumentText({ driveItem: driveItem(), accessToken: 't' })).byteLength).toBe(1234);
        });
    });
});
