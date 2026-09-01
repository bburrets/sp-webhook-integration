/**
 * Document Content Extractor
 * Downloads a SharePoint file and pulls its text layer out.
 *
 * This is the scanned-PDF gate. pdf-parse reads a PDF's embedded text layer; a
 * document produced by a scanner has none, so the text comes back empty or
 * near-empty. Rather than let that flow onward as "no fields could be
 * extracted", hasTextLayer is reported explicitly so the worker can record the
 * accurate reason (NoTextLayer) and a human knows OCR is what's needed.
 *
 * Downloads use the pre-signed @microsoft.graph.downloadUrl when available.
 * That URL is already authenticated and must NOT carry an Authorization header,
 * which is why graphRequest takes accessToken as optional.
 */

const pdfParse = require('pdf-parse');
const { createLogger } = require('./logger');
const { graphRequest } = require('./graph-request');
const { getExtension } = require('./document-naming-engine');

// A PDF whose extracted text is shorter than this is treated as having no
// usable text layer. Scanners often embed a few stray characters (a device
// banner, a page label), so zero is too strict a threshold.
const MIN_TEXT_LAYER_CHARS = 50;

// Guard against pulling a huge file into a Consumption-plan function's memory.
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

const DOWNLOAD_URL_FIELD = '@microsoft.graph.downloadUrl';

/**
 * Download a file's bytes.
 * @param {Object} params
 * @param {Object} params.driveItem - Graph driveItem
 * @param {string} params.accessToken
 * @param {Object} [params.context]
 * @returns {Promise<Buffer>}
 */
async function downloadFile({ driveItem, accessToken, context }) {
    const preSignedUrl = driveItem?.[DOWNLOAD_URL_FIELD];

    if (driveItem?.size && driveItem.size > MAX_DOWNLOAD_BYTES) {
        const error = new Error(
            `File is ${driveItem.size} bytes, over the ${MAX_DOWNLOAD_BYTES} byte processing limit`
        );
        error.code = 'FILE_TOO_LARGE';
        throw error;
    }

    // Prefer the pre-signed URL: it avoids a second authenticated round trip and
    // is what the rest of this codebase already uses for document downloads.
    const url = preSignedUrl
        || `https://graph.microsoft.com/v1.0/drives/${driveItem.parentReference?.driveId}/items/${driveItem.id}/content`;

    const response = await graphRequest({
        url,
        method: 'get',
        // A pre-signed URL rejects or ignores an Authorization header.
        accessToken: preSignedUrl ? null : accessToken,
        responseType: 'arraybuffer',
        context
    });

    const buffer = Buffer.from(response.data);

    if (buffer.length > MAX_DOWNLOAD_BYTES) {
        const error = new Error(
            `Downloaded ${buffer.length} bytes, over the ${MAX_DOWNLOAD_BYTES} byte processing limit`
        );
        error.code = 'FILE_TOO_LARGE';
        throw error;
    }

    return buffer;
}

/**
 * Extract text from a PDF buffer.
 * @param {Buffer} buffer
 * @returns {Promise<{text: string, pageCount: number}>}
 */
async function extractPdfText(buffer) {
    const parsed = await pdfParse(buffer);
    return {
        // Normalise line endings so rule patterns can rely on \n.
        text: (parsed.text || '').replace(/\r\n/g, '\n'),
        pageCount: parsed.numpages || 0
    };
}

/**
 * Download a file and extract its text.
 *
 * Never throws for "this file has no text" — that is a result, not an error.
 * It does throw for download failures and oversized files, so the queue can
 * retry a transient Graph problem.
 *
 * @param {Object} params
 * @param {Object} params.driveItem
 * @param {string} params.accessToken
 * @param {Object} [params.context]
 * @returns {Promise<{text: string, hasTextLayer: boolean, charCount: number, pageCount: number, byteLength: number, unsupported: boolean}>}
 */
async function extractDocumentText({ driveItem, accessToken, context }) {
    const logger = createLogger(context);
    const fileName = driveItem?.name || '';
    const extension = getExtension(fileName);

    if (extension !== '.pdf') {
        // Only PDFs are in scope. Returning rather than throwing lets the worker
        // record a precise status instead of a generic failure.
        return {
            text: '',
            hasTextLayer: false,
            charCount: 0,
            pageCount: 0,
            byteLength: 0,
            unsupported: true
        };
    }

    const buffer = await downloadFile({ driveItem, accessToken, context });

    let text = '';
    let pageCount = 0;
    try {
        const parsed = await extractPdfText(buffer);
        text = parsed.text;
        pageCount = parsed.pageCount;
    } catch (error) {
        // A corrupt or encrypted PDF is a document problem, not an infrastructure
        // one. Treat it as "no text layer" so it lands on the exception path
        // instead of being retried eight times and poisoned.
        logger.warn('PDF text extraction failed, treating as no text layer', {
            service: 'content-extractor',
            fileName,
            error: error.message
        });
        text = '';
    }

    const charCount = text.trim().length;
    const hasTextLayer = charCount >= MIN_TEXT_LAYER_CHARS;

    logger.debug('Document text extracted', {
        service: 'content-extractor',
        fileName,
        charCount,
        pageCount,
        hasTextLayer,
        byteLength: buffer.length
    });

    return {
        text,
        hasTextLayer,
        charCount,
        pageCount,
        byteLength: buffer.length,
        unsupported: false
    };
}

module.exports = {
    extractDocumentText,
    extractPdfText,
    downloadFile,
    MIN_TEXT_LAYER_CHARS,
    MAX_DOWNLOAD_BYTES,
    DOWNLOAD_URL_FIELD
};
