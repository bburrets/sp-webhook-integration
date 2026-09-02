jest.mock('@azure/functions', () => ({
    app: { timer: jest.fn(), storageQueue: jest.fn() },
    output: { storageQueue: jest.fn(() => ({ type: 'queue' })) }
}));

jest.mock('../../shared/auth', () => ({
    getAccessToken: jest.fn(() => Promise.resolve('mock-token'))
}));

jest.mock('../../shared/sharepoint-folder-scanner', () => ({
    listFolderFiles: jest.fn(() => Promise.resolve({ files: [], folderCount: 0, truncated: false }))
}));

jest.mock('../../shared/logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()
    }))
}));

const { listFolderFiles } = require('../../shared/sharepoint-folder-scanner');
const { validateRuleSet } = require('../../shared/document-type-rules');
const { STATUS_FIELDS, RENAME_STATUS, MAX_ATTEMPTS } = require('../../shared/document-rename-status');
const {
    runSweep,
    selectCandidates,
    evaluateFile,
    buildRenameMessage
} = require('../document-rename-timer');

const GLJE = validateRuleSet({
    type: 'GLJE',
    classify: { filenameHints: ['glje'] },
    fields: { entity: { pattern: 'Entity:\\s*(\\S+)' } },
    template: 'GLJE_{entity}',
    validate: '^GLJE_[A-Z]+\\.pdf$'
}, 'test');

const RULE_SETS = [GLJE];

/** A normalised file as the scanner returns it. */
function file(overrides = {}) {
    return {
        driveItemId: 'item-1',
        driveId: 'drive-1',
        listItemId: '42',
        name: 'scan_0417.pdf',
        sha1Hash: 'HASH1',
        lastModifiedDateTime: '2026-08-30T10:00:00Z',
        fields: {},
        ...overrides
    };
}

function mockContext() {
    return { extraOutputs: { set: jest.fn() }, log: jest.fn(), error: jest.fn() };
}

const RENAME_VARS = [
    'RENAME_ENABLED', 'RENAME_DRY_RUN', 'RENAME_SITE_PATH',
    'RENAME_LIST_ID', 'RENAME_FOLDER_PATH', 'RENAME_MAX_PER_SWEEP'
];

describe('document-rename-timer', () => {
    let saved;

    beforeEach(() => {
        jest.clearAllMocks();
        saved = {};
        RENAME_VARS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
        listFolderFiles.mockResolvedValue({ files: [], folderCount: 0, truncated: false });
    });

    afterEach(() => {
        RENAME_VARS.forEach((k) => {
            if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
        });
    });

    /** Set a complete, enabled configuration. */
    function configureEnabled() {
        process.env.RENAME_ENABLED = 'true';
        process.env.RENAME_SITE_PATH = 'host:/sites/X:';
        process.env.RENAME_LIST_ID = 'list-1';
        process.env.RENAME_FOLDER_PATH = 'Inbox';
    }

    describe('evaluateFile', () => {
        it('selects a non-compliant PDF that has never been processed', () => {
            expect(evaluateFile({ file: file(), ruleSets: RULE_SETS }))
                .toMatchObject({ candidate: true, reason: 'needs-processing' });
        });

        it('skips a file whose name already matches a convention', () => {
            // Also what stops a renamed file being reprocessed next sweep.
            expect(evaluateFile({ file: file({ name: 'GLJE_FAM.pdf' }), ruleSets: RULE_SETS }))
                .toMatchObject({ candidate: false, reason: 'already-compliant:GLJE' });
        });

        it('skips a file whose extension no rule set accepts', () => {
            expect(evaluateFile({ file: file({ name: 'costing.xlsx' }), ruleSets: RULE_SETS }))
                .toMatchObject({ candidate: false, reason: 'unsupported-extension' });
        });

        it('skips a file that has exhausted its attempts on unchanged content', () => {
            const verdict = evaluateFile({
                file: file({
                    fields: {
                        [STATUS_FIELDS.attempts]: MAX_ATTEMPTS,
                        [STATUS_FIELDS.contentHash]: 'HASH1',
                        [STATUS_FIELDS.status]: RENAME_STATUS.NO_TEXT_LAYER
                    }
                }),
                ruleSets: RULE_SETS
            });
            expect(verdict).toMatchObject({ candidate: false, reason: 'attempts-exhausted' });
        });

        it('re-selects an exhausted file once its content changes', () => {
            const verdict = evaluateFile({
                file: file({
                    sha1Hash: 'HASH2',
                    fields: {
                        [STATUS_FIELDS.attempts]: MAX_ATTEMPTS,
                        [STATUS_FIELDS.contentHash]: 'HASH1',
                        [STATUS_FIELDS.status]: RENAME_STATUS.NO_TEXT_LAYER
                    }
                }),
                ruleSets: RULE_SETS
            });
            expect(verdict.candidate).toBe(true);
        });

        it('skips a file in a terminal state', () => {
            const verdict = evaluateFile({
                file: file({
                    fields: {
                        [STATUS_FIELDS.status]: RENAME_STATUS.PERMANENTLY_FAILED,
                        [STATUS_FIELDS.contentHash]: 'HASH1'
                    }
                }),
                ruleSets: RULE_SETS
            });
            expect(verdict).toMatchObject({ candidate: false, reason: 'terminal:PermanentlyFailed' });
        });

        it('re-selects a terminal file once its content changes', () => {
            const verdict = evaluateFile({
                file: file({
                    sha1Hash: 'HASH2',
                    fields: {
                        [STATUS_FIELDS.status]: RENAME_STATUS.RENAMED,
                        [STATUS_FIELDS.contentHash]: 'HASH1'
                    }
                }),
                ruleSets: RULE_SETS
            });
            expect(verdict.candidate).toBe(true);
        });

        it('re-selects a file whose last outcome was recoverable', () => {
            const verdict = evaluateFile({
                file: file({
                    fields: {
                        [STATUS_FIELDS.status]: RENAME_STATUS.NAME_COLLISION,
                        [STATUS_FIELDS.attempts]: 1,
                        [STATUS_FIELDS.contentHash]: 'HASH1'
                    }
                }),
                ruleSets: RULE_SETS
            });
            expect(verdict.candidate).toBe(true);
        });
    });

    describe('selectCandidates', () => {
        it('tallies skip reasons', () => {
            const result = selectCandidates({
                files: [
                    file({ driveItemId: 'a' }),
                    file({ driveItemId: 'b', name: 'GLJE_FAM.pdf' }),
                    file({ driveItemId: 'c', name: 'x.xlsx' })
                ],
                ruleSets: RULE_SETS
            });
            expect(result.candidates).toHaveLength(1);
            expect(result.skipped).toEqual({ 'already-compliant:GLJE': 1, 'unsupported-extension': 1 });
        });

        it('orders candidates oldest first so a backlog drains predictably', () => {
            const result = selectCandidates({
                files: [
                    file({ driveItemId: 'new', lastModifiedDateTime: '2026-08-30T10:00:00Z' }),
                    file({ driveItemId: 'old', lastModifiedDateTime: '2026-01-01T10:00:00Z' }),
                    file({ driveItemId: 'mid', lastModifiedDateTime: '2026-05-01T10:00:00Z' })
                ],
                ruleSets: RULE_SETS
            });
            expect(result.candidates.map((c) => c.file.driveItemId)).toEqual(['old', 'mid', 'new']);
        });

        it('caps the batch and reports how many were deferred', () => {
            const files = Array.from({ length: 10 }, (_v, i) =>
                file({ driveItemId: `i${i}`, lastModifiedDateTime: `2026-01-0${i % 9 + 1}T00:00:00Z` }));
            const result = selectCandidates({ files, ruleSets: RULE_SETS, maxPerSweep: 4 });
            expect(result.candidates).toHaveLength(4);
            expect(result.deferred).toBe(6);
        });

        it('reports no deferrals when everything fits', () => {
            const result = selectCandidates({ files: [file()], ruleSets: RULE_SETS, maxPerSweep: 10 });
            expect(result.deferred).toBe(0);
        });

        it('handles an empty folder', () => {
            expect(selectCandidates({ files: [], ruleSets: RULE_SETS }))
                .toMatchObject({ candidates: [], deferred: 0 });
        });
    });

    describe('buildRenameMessage', () => {
        it('carries what the worker needs', () => {
            const message = JSON.parse(buildRenameMessage({
                file: file(),
                state: { attempts: 2 },
                renameConfig: { sitePath: 'host:/sites/X:', listId: 'list-1', folderPath: 'Inbox' },
                enqueuedAt: '2026-09-01T00:00:00Z'
            }));
            expect(message).toMatchObject({
                driveItemId: 'item-1',
                driveId: 'drive-1',
                listItemId: '42',
                name: 'scan_0417.pdf',
                sha1Hash: 'HASH1',
                sitePath: 'host:/sites/X:',
                listId: 'list-1',
                folderPath: 'Inbox',
                attempts: 2
            });
        });

        it('omits the pre-signed download URL, which would expire in the queue', () => {
            const message = JSON.parse(buildRenameMessage({
                file: { ...file(), downloadUrl: 'https://presigned/x' },
                state: { attempts: 0 },
                renameConfig: {},
                enqueuedAt: 'now'
            }));
            expect(message).not.toHaveProperty('downloadUrl');
        });
    });

    describe('runSweep', () => {
        it('does nothing while the feature is disabled', async () => {
            const context = mockContext();
            const result = await runSweep(context);
            expect(result).toMatchObject({ enqueued: 0, disabled: true });
            expect(listFolderFiles).not.toHaveBeenCalled();
        });

        it('does nothing and reports problems when misconfigured', async () => {
            process.env.RENAME_ENABLED = 'true';
            const result = await runSweep(mockContext());
            expect(result.misconfigured).toHaveLength(3);
            expect(listFolderFiles).not.toHaveBeenCalled();
        });

        it('enqueues one message per candidate', async () => {
            configureEnabled();
            listFolderFiles.mockResolvedValue({
                files: [file({ driveItemId: 'a' }), file({ driveItemId: 'b' })],
                folderCount: 0,
                truncated: false
            });

            const context = mockContext();
            const result = await runSweep(context);

            expect(result.enqueued).toBe(2);
            expect(context.extraOutputs.set).toHaveBeenCalledTimes(1);
            expect(context.extraOutputs.set.mock.calls[0][1]).toHaveLength(2);
        });

        it('sets no queue output when there is nothing to do', async () => {
            configureEnabled();
            // Compliant against the real shipped GLJE convention, since runSweep
            // reads the repo rule sets rather than the fixtures above.
            listFolderFiles.mockResolvedValue({
                files: [file({ name: 'GLJE_06_30_2026_418627.pdf' })], folderCount: 0, truncated: false
            });

            const context = mockContext();
            expect((await runSweep(context)).enqueued).toBe(0);
            expect(context.extraOutputs.set).not.toHaveBeenCalled();
        });

        it('scans the configured folder', async () => {
            configureEnabled();
            await runSweep(mockContext());
            expect(listFolderFiles).toHaveBeenCalledWith(expect.objectContaining({
                sitePath: 'host:/sites/X:',
                folderPath: 'Inbox',
                accessToken: 'mock-token'
            }));
        });

        it('honours the per-sweep cap', async () => {
            configureEnabled();
            process.env.RENAME_MAX_PER_SWEEP = '1';
            listFolderFiles.mockResolvedValue({
                files: [file({ driveItemId: 'a' }), file({ driveItemId: 'b' })],
                folderCount: 0,
                truncated: false
            });

            const result = await runSweep(mockContext());
            expect(result.enqueued).toBe(1);
            expect(result.deferred).toBe(1);
        });

        it('reports dry run, which placeholder rules force on', async () => {
            configureEnabled();
            process.env.RENAME_DRY_RUN = 'false';
            expect((await runSweep(mockContext())).dryRun).toBe(true);
        });

        it('propagates a scan failure so the invocation is recorded as failed', async () => {
            configureEnabled();
            listFolderFiles.mockRejectedValue(new Error('Graph down'));
            await expect(runSweep(mockContext())).rejects.toThrow('Graph down');
        });
    });
});
