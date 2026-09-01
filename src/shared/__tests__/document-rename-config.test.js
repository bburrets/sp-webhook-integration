jest.mock('../document-type-rules', () => ({
    hasPlaceholderRules: jest.fn(() => false),
    placeholderTypes: jest.fn(() => [])
}));

const { hasPlaceholderRules, placeholderTypes } = require('../document-type-rules');
const {
    getRenameConfig,
    validateRenameConfig,
    resolveDryRun,
    DEFAULT_MAX_PER_SWEEP
} = require('../document-rename-config');

const RENAME_VARS = [
    'RENAME_ENABLED', 'RENAME_DRY_RUN', 'RENAME_SITE_PATH',
    'RENAME_LIST_ID', 'RENAME_FOLDER_PATH', 'RENAME_DRIVE_ID', 'RENAME_MAX_PER_SWEEP'
];

describe('document-rename-config', () => {
    let saved;

    beforeEach(() => {
        jest.clearAllMocks();
        hasPlaceholderRules.mockReturnValue(false);
        placeholderTypes.mockReturnValue([]);
        saved = {};
        RENAME_VARS.forEach((key) => { saved[key] = process.env[key]; delete process.env[key]; });
    });

    afterEach(() => {
        RENAME_VARS.forEach((key) => {
            if (saved[key] === undefined) { delete process.env[key]; } else { process.env[key] = saved[key]; }
        });
    });

    describe('getRenameConfig defaults', () => {
        it('is disabled unless explicitly enabled', () => {
            expect(getRenameConfig().enabled).toBe(false);
            process.env.RENAME_ENABLED = 'true';
            expect(getRenameConfig().enabled).toBe(true);
        });

        it('is dry-run unless explicitly disabled', () => {
            // A missing or misspelled setting must not cause a live rename.
            expect(getRenameConfig().dryRun).toBe(true);
            process.env.RENAME_DRY_RUN = 'false';
            expect(getRenameConfig().dryRun).toBe(false);
        });

        it('treats any non-"true" value as false for booleans', () => {
            process.env.RENAME_ENABLED = 'yes';
            expect(getRenameConfig().enabled).toBe(false);
            process.env.RENAME_ENABLED = '1';
            expect(getRenameConfig().enabled).toBe(false);
        });

        it('is case-insensitive for booleans', () => {
            process.env.RENAME_ENABLED = 'TRUE';
            expect(getRenameConfig().enabled).toBe(true);
        });

        it('applies the default per-sweep cap', () => {
            expect(getRenameConfig().maxPerSweep).toBe(DEFAULT_MAX_PER_SWEEP);
        });

        it('accepts a valid per-sweep cap and rejects nonsense', () => {
            process.env.RENAME_MAX_PER_SWEEP = '50';
            expect(getRenameConfig().maxPerSweep).toBe(50);
            process.env.RENAME_MAX_PER_SWEEP = '0';
            expect(getRenameConfig().maxPerSweep).toBe(DEFAULT_MAX_PER_SWEEP);
            process.env.RENAME_MAX_PER_SWEEP = 'lots';
            expect(getRenameConfig().maxPerSweep).toBe(DEFAULT_MAX_PER_SWEEP);
        });

        it('reads the location settings', () => {
            process.env.RENAME_SITE_PATH = 'host:/sites/X:';
            process.env.RENAME_LIST_ID = 'list-1';
            process.env.RENAME_FOLDER_PATH = 'Shared Documents/Inbox';
            expect(getRenameConfig()).toMatchObject({
                sitePath: 'host:/sites/X:', listId: 'list-1', folderPath: 'Shared Documents/Inbox'
            });
        });
    });

    describe('validateRenameConfig', () => {
        it('names every missing setting', () => {
            const problems = validateRenameConfig();
            expect(problems).toHaveLength(3);
            expect(problems.join(' ')).toMatch(/RENAME_SITE_PATH/);
            expect(problems.join(' ')).toMatch(/RENAME_LIST_ID/);
            expect(problems.join(' ')).toMatch(/RENAME_FOLDER_PATH/);
        });

        it('passes a complete configuration', () => {
            process.env.RENAME_SITE_PATH = 'host:/sites/X:';
            process.env.RENAME_LIST_ID = 'list-1';
            process.env.RENAME_FOLDER_PATH = 'Inbox';
            expect(validateRenameConfig()).toEqual([]);
        });

        it('accepts a driveId in place of a folder path', () => {
            process.env.RENAME_SITE_PATH = 'host:/sites/X:';
            process.env.RENAME_LIST_ID = 'list-1';
            process.env.RENAME_DRIVE_ID = 'b!abc';
            expect(validateRenameConfig()).toEqual([]);
        });
    });

    describe('resolveDryRun', () => {
        it('forces dry run while any rule set is a placeholder', () => {
            // Guessed patterns must never rename a real file.
            hasPlaceholderRules.mockReturnValue(true);
            placeholderTypes.mockReturnValue(['CHECK', 'GLJE']);
            process.env.RENAME_DRY_RUN = 'false';

            const result = resolveDryRun();
            expect(result.dryRun).toBe(true);
            expect(result.reason).toMatch(/placeholder: CHECK, GLJE/);
        });

        it('reports dry run when the setting asks for it', () => {
            process.env.RENAME_DRY_RUN = 'true';
            expect(resolveDryRun()).toMatchObject({ dryRun: true, reason: 'RENAME_DRY_RUN is enabled' });
        });

        it('allows live renaming only with real rules and dry run off', () => {
            process.env.RENAME_DRY_RUN = 'false';
            expect(resolveDryRun()).toEqual({ dryRun: false, reason: null });
        });
    });
});
