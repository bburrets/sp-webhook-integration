jest.mock('@azure/functions', () => ({
    app: { timer: jest.fn(), storageQueue: jest.fn() },
    output: { storageQueue: jest.fn(() => ({ type: 'queue' })) }
}));

jest.mock('../../shared/auth', () => ({
    getAccessToken: jest.fn(() => Promise.resolve('mock-token'))
}));

jest.mock('../../shared/sharepoint-folder-scanner', () => ({
    getFileById: jest.fn(),
    listFolderFiles: jest.fn(() => Promise.resolve({ files: [], folderCount: 0, truncated: false }))
}));

jest.mock('../../shared/document-content-extractor', () => ({
    extractDocumentText: jest.fn()
}));

jest.mock('../../shared/sharepoint-file-renamer', () => ({
    checkCollision: jest.fn(() => ({ collides: false, conflictingFile: null })),
    renameFile: jest.fn(() => Promise.resolve({
        renamed: true, dryRun: false, collision: false, newName: 'x.pdf', error: null
    }))
}));

jest.mock('../../shared/document-rename-status', () => {
    const actual = jest.requireActual('../../shared/document-rename-status');
    return { ...actual, writeStatus: jest.fn(() => Promise.resolve(true)) };
});

jest.mock('../../shared/document-rename-config', () => ({
    getRenameConfig: jest.fn(() => ({
        enabled: true, dryRun: false, sitePath: 'host:/sites/X:', listId: 'list-1',
        folderPath: 'Inbox', driveId: null, maxPerSweep: 500
    })),
    resolveDryRun: jest.fn(() => ({ dryRun: false, reason: null }))
}));

jest.mock('../../shared/logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()
    }))
}));

const { getFileById, listFolderFiles } = require('../../shared/sharepoint-folder-scanner');
const { extractDocumentText } = require('../../shared/document-content-extractor');
const { checkCollision, renameFile } = require('../../shared/sharepoint-file-renamer');
const { writeStatus, RENAME_STATUS, MAX_ATTEMPTS } = require('../../shared/document-rename-status');
const { resolveDryRun } = require('../../shared/document-rename-config');
const {
    handleRenameMessage,
    handleQueueMessage,
    nextAttempts,
    resetFolderCache,
    DETERMINISTIC_STATUSES,
    MAX_REGENERATION_ATTEMPTS
} = require('../document-rename-worker');

// Mirrors a real OCR'd check remittance. CHECK is used for the happy path
// because it is the one type that extracts end to end today: GLJE's trailing
// 6-digit id has no confirmed source, so it deliberately fails to render.
const CHECK_TEXT = 'Date Invoice No Comment Amount Discount Net Amount\n'
    + '1/1/2026 MR 010126 FAM MR 010126 5,000.00 0.00 5,000.00\n'
    + 'Check: 0000038490\n'
    + '1/5/2026 MICHAEL RADOCHAY Check Total 5,000.00\n';
const EXPECTED_NAME = 'Check_38490_MICHAEL RADOCHAY_1_5_2026.pdf';

function job(overrides = {}) {
    return {
        driveItemId: 'item-1',
        driveId: 'drive-1',
        listItemId: '42',
        name: 'scan_0417.pdf',
        sha1Hash: 'HASH1',
        sitePath: 'host:/sites/X:',
        listId: 'list-1',
        folderPath: 'Inbox',
        attempts: 0,
        enqueuedAt: '2026-09-01T00:00:00Z',
        ...overrides
    };
}

function scannedFile(overrides = {}) {
    return {
        driveItemId: 'item-1',
        driveId: 'drive-1',
        listItemId: '42',
        name: 'scan_0417.pdf',
        sha1Hash: 'HASH1',
        fields: {},
        driveItem: { id: 'item-1', name: 'scan_0417.pdf' },
        ...overrides
    };
}

function mockContext() {
    return { triggerMetadata: { dequeueCount: 1 }, log: jest.fn(), error: jest.fn() };
}

/** The status recorded by the last writeStatus call. */
function recorded() {
    return writeStatus.mock.calls[writeStatus.mock.calls.length - 1][0];
}

describe('document-rename-worker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetFolderCache();
        getFileById.mockResolvedValue(scannedFile());
        extractDocumentText.mockResolvedValue({
            text: CHECK_TEXT, hasTextLayer: true, charCount: CHECK_TEXT.length,
            pageCount: 1, byteLength: 2048, unsupported: false
        });
        checkCollision.mockReturnValue({ collides: false, conflictingFile: null });
        renameFile.mockResolvedValue({
            renamed: true, dryRun: false, collision: false,
            newName: EXPECTED_NAME, error: null
        });
        resolveDryRun.mockReturnValue({ dryRun: false, reason: null });
        writeStatus.mockResolvedValue(true);
    });

    describe('nextAttempts', () => {
        it('jumps deterministic outcomes straight to the ceiling', () => {
            // Nothing is gained by re-parsing identical content.
            for (const status of DETERMINISTIC_STATUSES) {
                expect(nextAttempts(status, 0)).toBe(MAX_ATTEMPTS);
            }
        });

        it('increments recoverable outcomes one at a time', () => {
            expect(nextAttempts(RENAME_STATUS.NAME_COLLISION, 0)).toBe(1);
            expect(nextAttempts(RENAME_STATUS.NAME_COLLISION, 2)).toBe(3);
        });
    });

    describe('the happy path', () => {
        it('renames a non-compliant file and records it', async () => {
            const result = await handleRenameMessage(JSON.stringify(job()), mockContext());

            expect(result.status).toBe(RENAME_STATUS.RENAMED);
            expect(renameFile).toHaveBeenCalledWith(expect.objectContaining({
                driveId: 'drive-1', driveItemId: 'item-1',
                newName: EXPECTED_NAME, dryRun: false
            }));
            expect(recorded()).toMatchObject({
                status: RENAME_STATUS.RENAMED,
                docType: 'CHECK',
                previousName: 'scan_0417.pdf',
                contentHash: 'HASH1'
            });
        });

        it('does not count a successful rename as a failed attempt', async () => {
            await handleRenameMessage(JSON.stringify(job({ attempts: 1 })), mockContext());
            expect(recorded().attempts).toBe(1);
        });

        it('accepts an already-parsed message object', async () => {
            const result = await handleRenameMessage(job(), mockContext());
            expect(result.status).toBe(RENAME_STATUS.RENAMED);
        });

        it('re-reads the file rather than trusting the sweep snapshot', async () => {
            await handleRenameMessage(job(), mockContext());
            expect(getFileById).toHaveBeenCalledWith(expect.objectContaining({
                driveId: 'drive-1', driveItemId: 'item-1'
            }));
        });
    });

    describe('short circuits', () => {
        it('stops when the file no longer exists', async () => {
            getFileById.mockResolvedValue(null);
            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe('Gone');
            expect(extractDocumentText).not.toHaveBeenCalled();
            expect(writeStatus).not.toHaveBeenCalled();
        });

        it('stops when the name became compliant since the sweep', async () => {
            getFileById.mockResolvedValue(scannedFile({ name: EXPECTED_NAME }));
            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.ALREADY_COMPLIANT);
            expect(extractDocumentText).not.toHaveBeenCalled();
            // No write: the previous run already recorded the rename.
            expect(writeStatus).not.toHaveBeenCalled();
        });
    });

    describe('exception paths', () => {
        it('records UnsupportedType for a non-PDF', async () => {
            extractDocumentText.mockResolvedValue({
                text: '', hasTextLayer: false, charCount: 0, pageCount: 0, byteLength: 0, unsupported: true
            });
            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.UNSUPPORTED_TYPE);
            expect(renameFile).not.toHaveBeenCalled();
            expect(recorded().attempts).toBe(MAX_ATTEMPTS);
        });

        it('records NoTextLayer for a scanned PDF, with page and char counts', async () => {
            extractDocumentText.mockResolvedValue({
                text: '', hasTextLayer: false, charCount: 0, pageCount: 3, byteLength: 500000, unsupported: false
            });
            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.NO_TEXT_LAYER);
            expect(recorded().detail).toMatch(/No usable text layer \(0 chars over 3 page\(s\)\)/);
            expect(recorded().detail).toMatch(/needs OCR/);
            expect(recorded().attempts).toBe(MAX_ATTEMPTS);
            expect(renameFile).not.toHaveBeenCalled();
        });

        it('records Unclassified with the classifier reason', async () => {
            extractDocumentText.mockResolvedValue({
                text: 'Meeting notes about nothing financial at all whatsoever here',
                hasTextLayer: true, charCount: 60, pageCount: 1, byteLength: 1000, unsupported: false
            });
            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.UNCLASSIFIED);
            expect(recorded().detail).toMatch(/did not match|No document type matched/i);
            expect(recorded().attempts).toBe(MAX_ATTEMPTS);
        });

        it('records MissingFields naming the fields, and the detected type', async () => {
            extractDocumentText.mockResolvedValue({
                text: 'General Journal FAM, LLC\nJE-000001 posted to the ledger\n',
                hasTextLayer: true, charCount: 60, pageCount: 1, byteLength: 1000, unsupported: false
            });
            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.MISSING_FIELDS);
            expect(recorded().docType).toBe('GLJE');
            expect(recorded().detail).toMatch(/Could not extract required field\(s\).*glDate/);
            expect(renameFile).not.toHaveBeenCalled();
        });

        it('records NameCollision when Graph rejects the rename', async () => {
            renameFile.mockResolvedValue({
                renamed: false, dryRun: false, collision: true,
                newName: EXPECTED_NAME,
                error: `A file named "${EXPECTED_NAME}" already exists in the folder`
            });
            const result = await handleRenameMessage(job({ attempts: 1 }), mockContext());

            expect(result.status).toBe(RENAME_STATUS.NAME_COLLISION);
            // Recoverable, so it increments rather than jumping to the ceiling.
            expect(recorded().attempts).toBe(2);
        });

        it('always records the content hash so a re-upload re-arms the file', async () => {
            extractDocumentText.mockResolvedValue({
                text: '', hasTextLayer: false, charCount: 0, pageCount: 2, byteLength: 1, unsupported: false
            });
            await handleRenameMessage(job(), mockContext());
            expect(recorded().contentHash).toBe('HASH1');
        });
    });

    describe('dry run', () => {
        beforeEach(() => {
            resolveDryRun.mockReturnValue({ dryRun: true, reason: 'RENAME_DRY_RUN is enabled' });
        });

        it('records the proposed name without renaming', async () => {
            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.DRY_RUN);
            expect(renameFile).not.toHaveBeenCalled();
            expect(recorded().detail).toContain(`Would rename to "${EXPECTED_NAME}"`);
            expect(recorded().docType).toBe('CHECK');
        });

        it('leaves the attempt counter alone so dry sweeps cannot exhaust files', async () => {
            await handleRenameMessage(job({ attempts: 2 }), mockContext());
            expect(recorded().attempts).toBe(2);
        });

        it('predicts a collision from the folder listing', async () => {
            checkCollision.mockReturnValue({
                collides: true, conflictingFile: { driveItemId: 'other', name: 'GLJE_FAM_202608_12345.pdf' }
            });
            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.NAME_COLLISION);
            expect(recorded().detail).toMatch(/Would rename to .* but that name is already taken/);
        });

        it('lists the folder to make that prediction', async () => {
            await handleRenameMessage(job(), mockContext());
            expect(listFolderFiles).toHaveBeenCalledWith(expect.objectContaining({ folderPath: 'Inbox' }));
        });

        it('caches the listing across messages in the same sweep', async () => {
            await handleRenameMessage(job({ driveItemId: 'a' }), mockContext());
            await handleRenameMessage(job({ driveItemId: 'b' }), mockContext());
            await handleRenameMessage(job({ driveItemId: 'c' }), mockContext());
            expect(listFolderFiles).toHaveBeenCalledTimes(1);
        });

        it('re-lists after the cache is cleared', async () => {
            await handleRenameMessage(job(), mockContext());
            resetFolderCache();
            await handleRenameMessage(job(), mockContext());
            expect(listFolderFiles).toHaveBeenCalledTimes(2);
        });
    });

    describe('regenerating a colliding generated value', () => {
        // GLJE's trailing 6 digits are random, so a collision is bad luck rather
        // than a duplicate document. CHECK has no generated field, so a collision
        // there stays an exception.
        const GLJE_TEXT = 'General Journal FAM, LLC (FAM)\nJE-000001\n'
            + 'Run Date: 7/1/2026 G/L Date: 6/30/2026\n';

        function useGlje() {
            extractDocumentText.mockResolvedValue({
                text: GLJE_TEXT, hasTextLayer: true, charCount: GLJE_TEXT.length,
                pageCount: 1, byteLength: 2048, unsupported: false
            });
        }

        it('retries with a fresh id when Graph reports a collision', async () => {
            useGlje();
            renameFile
                .mockResolvedValueOnce({ renamed: false, collision: true, newName: 'x', error: 'taken' })
                .mockResolvedValueOnce({ renamed: true, collision: false, newName: 'y', error: null });

            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.RENAMED);
            expect(renameFile).toHaveBeenCalledTimes(2);
            // A fresh id means a different name on the retry.
            expect(renameFile.mock.calls[0][0].newName).not.toBe(renameFile.mock.calls[1][0].newName);
        });

        it('gives up after the regeneration limit', async () => {
            useGlje();
            renameFile.mockResolvedValue({
                renamed: false, collision: true, newName: 'x', error: 'taken'
            });

            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.NAME_COLLISION);
            expect(renameFile).toHaveBeenCalledTimes(MAX_REGENERATION_ATTEMPTS + 1);
        });

        it('does not retry a collision on an extracted value', async () => {
            // CHECK mints nothing, so a collision is real information.
            renameFile.mockResolvedValue({
                renamed: false, collision: true, newName: EXPECTED_NAME, error: 'taken'
            });

            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.NAME_COLLISION);
            expect(renameFile).toHaveBeenCalledTimes(1);
        });

        it('regenerates in dry run too, where there is no Graph 409 to catch it', async () => {
            useGlje();
            resolveDryRun.mockReturnValue({ dryRun: true, reason: 'RENAME_DRY_RUN is enabled' });
            checkCollision
                .mockReturnValueOnce({ collides: true, conflictingFile: { driveItemId: 'other' } })
                .mockReturnValue({ collides: false, conflictingFile: null });

            const result = await handleRenameMessage(job(), mockContext());

            expect(result.status).toBe(RENAME_STATUS.DRY_RUN);
            expect(checkCollision).toHaveBeenCalledTimes(2);
        });
    });

    describe('live mode', () => {
        it('does not pre-check collisions, relying on Graph 409 instead', async () => {
            // A stale cached listing could wrongly block a legitimate rename.
            await handleRenameMessage(job(), mockContext());
            expect(listFolderFiles).not.toHaveBeenCalled();
            expect(checkCollision).not.toHaveBeenCalled();
        });
    });

    describe('handleQueueMessage error handling', () => {
        it('records Error and rethrows so the queue retries', async () => {
            extractDocumentText.mockRejectedValue(new Error('Graph down'));

            await expect(handleQueueMessage(JSON.stringify(job()), mockContext()))
                .rejects.toThrow('Graph down');

            expect(recorded()).toMatchObject({
                status: RENAME_STATUS.ERROR,
                detail: 'Graph down',
                attempts: 1
            });
        });

        it('rethrows even when the status write also fails', async () => {
            extractDocumentText.mockRejectedValue(new Error('Graph down'));
            writeStatus.mockResolvedValue(false);
            await expect(handleQueueMessage(job(), mockContext())).rejects.toThrow('Graph down');
        });

        it('still rethrows when the message cannot be parsed', async () => {
            await expect(handleQueueMessage('{ not json', mockContext())).rejects.toThrow();
            expect(writeStatus).not.toHaveBeenCalled();
        });

        it('returns the outcome unchanged on success', async () => {
            const result = await handleQueueMessage(JSON.stringify(job()), mockContext());
            expect(result.status).toBe(RENAME_STATUS.RENAMED);
        });
    });
});
