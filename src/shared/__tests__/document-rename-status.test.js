jest.mock('../graph-request', () => ({ graphRequest: jest.fn() }));
jest.mock('../logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()
    }))
}));

const { graphRequest } = require('../graph-request');
const {
    RENAME_STATUS,
    STATUS_FIELDS,
    MAX_ATTEMPTS,
    MAX_DETAIL_LENGTH,
    readState,
    isExhausted,
    isTerminal,
    writeStatus
} = require('../document-rename-status');

describe('document-rename-status', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('readState', () => {
        it('reads state off listItem fields', () => {
            expect(readState({
                [STATUS_FIELDS.status]: 'MissingFields',
                [STATUS_FIELDS.attempts]: 2,
                [STATUS_FIELDS.contentHash]: 'HASH',
                [STATUS_FIELDS.docType]: 'GLJE'
            })).toMatchObject({ status: 'MissingFields', attempts: 2, contentHash: 'HASH', docType: 'GLJE' });
        });

        it('defaults a file that has never been processed', () => {
            expect(readState({})).toEqual({
                status: null, attempts: 0, contentHash: null, processedAt: null, docType: null
            });
            expect(readState()).toMatchObject({ attempts: 0 });
        });

        it('coerces a string attempt count', () => {
            expect(readState({ [STATUS_FIELDS.attempts]: '3' }).attempts).toBe(3);
        });

        it('falls back to zero for an unparseable attempt count', () => {
            expect(readState({ [STATUS_FIELDS.attempts]: 'many' }).attempts).toBe(0);
        });
    });

    describe('isExhausted', () => {
        it('is false below the attempt ceiling', () => {
            expect(isExhausted({ state: { attempts: MAX_ATTEMPTS - 1, contentHash: 'A' }, contentHash: 'A' })).toBe(false);
        });

        it('is true at the ceiling on unchanged content', () => {
            expect(isExhausted({ state: { attempts: MAX_ATTEMPTS, contentHash: 'A' }, contentHash: 'A' })).toBe(true);
        });

        it('re-arms when the content hash changes', () => {
            // A corrected re-upload deserves a fresh set of attempts.
            expect(isExhausted({ state: { attempts: MAX_ATTEMPTS, contentHash: 'A' }, contentHash: 'B' })).toBe(false);
        });

        it('falls back to the counter alone when a hash is unavailable', () => {
            expect(isExhausted({ state: { attempts: MAX_ATTEMPTS, contentHash: null }, contentHash: 'A' })).toBe(true);
            expect(isExhausted({ state: { attempts: MAX_ATTEMPTS, contentHash: 'A' }, contentHash: null })).toBe(true);
        });

        it('handles a missing state object', () => {
            expect(isExhausted({ state: null, contentHash: 'A' })).toBe(false);
        });
    });

    describe('isTerminal', () => {
        it('treats finished outcomes as terminal', () => {
            expect(isTerminal(RENAME_STATUS.RENAMED)).toBe(true);
            expect(isTerminal(RENAME_STATUS.ALREADY_COMPLIANT)).toBe(true);
            expect(isTerminal(RENAME_STATUS.PERMANENTLY_FAILED)).toBe(true);
        });

        it('leaves recoverable outcomes open', () => {
            expect(isTerminal(RENAME_STATUS.NAME_COLLISION)).toBe(false);
            expect(isTerminal(RENAME_STATUS.ERROR)).toBe(false);
            expect(isTerminal(RENAME_STATUS.DRY_RUN)).toBe(false);
            expect(isTerminal(null)).toBe(false);
        });
    });

    describe('writeStatus', () => {
        const base = {
            accessToken: 't',
            driveId: 'drive-1',
            driveItemId: 'item-1',
            status: RENAME_STATUS.RENAMED
        };

        it('PATCHes the list item through the drive item', async () => {
            // Addressing via the drive means no site path or list id has to be
            // configured; the scan already knows the drive.
            graphRequest.mockResolvedValue({ data: {} });
            expect(await writeStatus(base)).toBe(true);

            const call = graphRequest.mock.calls[0][0];
            expect(call.method).toBe('patch');
            expect(call.url).toContain('/drives/drive-1/items/item-1/listItem/fields');
            expect(call.data[STATUS_FIELDS.status]).toBe('Renamed');
            expect(call.data[STATUS_FIELDS.processedAt]).toBeTruthy();
        });

        it('writes only the optional fields it was given', async () => {
            graphRequest.mockResolvedValue({ data: {} });
            await writeStatus(base);
            const fields = graphRequest.mock.calls[0][0].data;
            expect(fields).not.toHaveProperty(STATUS_FIELDS.docType);
            expect(fields).not.toHaveProperty(STATUS_FIELDS.previousName);
        });

        it('includes every optional field when supplied', async () => {
            graphRequest.mockResolvedValue({ data: {} });
            await writeStatus({
                ...base,
                docType: 'GLJE',
                detail: 'why',
                attempts: 2,
                previousName: 'old.pdf',
                contentHash: 'HASH'
            });
            const fields = graphRequest.mock.calls[0][0].data;
            expect(fields[STATUS_FIELDS.docType]).toBe('GLJE');
            expect(fields[STATUS_FIELDS.detail]).toBe('why');
            expect(fields[STATUS_FIELDS.attempts]).toBe(2);
            expect(fields[STATUS_FIELDS.previousName]).toBe('old.pdf');
            expect(fields[STATUS_FIELDS.contentHash]).toBe('HASH');
        });

        it('truncates an over-long detail', async () => {
            graphRequest.mockResolvedValue({ data: {} });
            await writeStatus({ ...base, detail: 'x'.repeat(MAX_DETAIL_LENGTH + 500) });
            expect(graphRequest.mock.calls[0][0].data[STATUS_FIELDS.detail])
                .toHaveLength(MAX_DETAIL_LENGTH);
        });

        it('records attempts of zero rather than dropping the field', async () => {
            graphRequest.mockResolvedValue({ data: {} });
            await writeStatus({ ...base, attempts: 0 });
            expect(graphRequest.mock.calls[0][0].data[STATUS_FIELDS.attempts]).toBe(0);
        });

        it('returns false without calling Graph when identifiers are missing', async () => {
            expect(await writeStatus({ ...base, driveItemId: null })).toBe(false);
            expect(await writeStatus({ ...base, driveId: null })).toBe(false);
            expect(graphRequest).not.toHaveBeenCalled();
        });

        it('swallows a write failure so bookkeeping cannot mask the real result', async () => {
            graphRequest.mockRejectedValue(new Error('Graph down'));
            await expect(writeStatus(base)).resolves.toBe(false);
        });
    });
});
