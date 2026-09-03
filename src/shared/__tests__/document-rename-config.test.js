jest.mock('../document-type-rules', () => ({
    hasPlaceholderRules: jest.fn(() => false),
    placeholderTypes: jest.fn(() => [])
}));

const { hasPlaceholderRules, placeholderTypes } = require('../document-type-rules');
const {
    getRenameConfig,
    getScanTarget,
    validateRenameConfig,
    resolveDryRun,
    DEFAULT_MAX_PER_SWEEP
} = require('../document-rename-config');

const LIBRARY_URL =
    'https://contoso.sharepoint.com/sites/Finance/OutputBox/Forms/AllItems.aspx';

const RENAME_VARS = [
    'RENAME_ENABLED', 'RENAME_DRY_RUN', 'RENAME_LIBRARY_URL',
    'RENAME_RECURSIVE', 'RENAME_CLASSIFY_BY_FOLDER', 'RENAME_MAX_PER_SWEEP'
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

        it('keeps the folder fallback on unless told otherwise', () => {
            // Content always classifies first; this only controls whether the
            // folder is consulted when the document itself is inconclusive.
            expect(getRenameConfig().folderFallback).toBe(true);
            process.env.RENAME_CLASSIFY_BY_FOLDER = 'false';
            expect(getRenameConfig().folderFallback).toBe(false);
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

        it('reads the library URL', () => {
            process.env.RENAME_LIBRARY_URL = LIBRARY_URL;
            expect(getRenameConfig().libraryUrl).toBe(LIBRARY_URL);
        });

        it('recurses into subfolders unless told otherwise', () => {
            // This library nests by type and month, so a non-recursive scan of a
            // sensible starting point would find nothing.
            expect(getRenameConfig().recursive).toBe(true);
            process.env.RENAME_RECURSIVE = 'false';
            expect(getRenameConfig().recursive).toBe(false);
        });
    });

    describe('getScanTarget', () => {
        it('returns null when no URL is configured', () => {
            expect(getScanTarget()).toBeNull();
        });

        it('resolves a library URL into its Graph parts', () => {
            process.env.RENAME_LIBRARY_URL = LIBRARY_URL;
            expect(getScanTarget()).toMatchObject({
                sitePath: 'contoso.sharepoint.com:/sites/Finance:',
                libraryName: 'OutputBox',
                folderPath: '',
                isRoot: true
            });
        });

        it('resolves a subfolder URL', () => {
            process.env.RENAME_LIBRARY_URL =
                'https://contoso.sharepoint.com/sites/Finance/OutputBox/Forms/AllItems.aspx'
                + '?id=%2Fsites%2FFinance%2FOutputBox%2FCHECK%2F2026';
            expect(getScanTarget()).toMatchObject({ libraryName: 'OutputBox', folderPath: 'CHECK/2026' });
        });
    });

    describe('validateRenameConfig', () => {
        it('reports a missing URL with an example', () => {
            const problems = validateRenameConfig();
            expect(problems).toHaveLength(1);
            expect(problems[0]).toMatch(/RENAME_LIBRARY_URL is not set/);
            expect(problems[0]).toMatch(/AllItems\.aspx/);
        });

        it('passes a complete configuration', () => {
            process.env.RENAME_LIBRARY_URL = LIBRARY_URL;
            expect(validateRenameConfig()).toEqual([]);
        });

        it('reports a URL it cannot parse', () => {
            process.env.RENAME_LIBRARY_URL = 'not a url';
            expect(validateRenameConfig()[0]).toMatch(/could not be parsed/);
        });

        it('reports a URL that points at a site rather than a library', () => {
            process.env.RENAME_LIBRARY_URL = 'https://contoso.sharepoint.com/sites/Finance';
            expect(validateRenameConfig()[0]).toMatch(/points at the site, not a document library/);
        });
    });

    describe('resolveDryRun', () => {
        it('forces dry run for a placeholder type, whatever the setting says', () => {
            // An unconfirmed convention must never rename a real file.
            process.env.RENAME_DRY_RUN = 'false';
            const result = resolveDryRun(undefined, { type: 'COSTING', placeholder: true });
            expect(result.dryRun).toBe(true);
            expect(result.reason).toMatch(/COSTING is still marked placeholder/);
        });

        it('does NOT hold a confirmed type in dry run because another is a placeholder', () => {
            // The interlock is per type. One unreviewed document type must not
            // keep the whole feature from going live.
            hasPlaceholderRules.mockReturnValue(true);
            placeholderTypes.mockReturnValue(['COSTING']);
            process.env.RENAME_DRY_RUN = 'false';

            expect(resolveDryRun(undefined, { type: 'CHECK', placeholder: false }).dryRun).toBe(false);
        });

        it('still names the placeholder types when reporting without a type', () => {
            // The timer has not classified anything yet, so it reports which
            // types will stay dry even once the setting is off.
            hasPlaceholderRules.mockReturnValue(true);
            placeholderTypes.mockReturnValue(['COSTING']);
            process.env.RENAME_DRY_RUN = 'false';

            const result = resolveDryRun();
            expect(result.dryRun).toBe(false);
            expect(result.reason).toMatch(/remain placeholders: COSTING/);
        });

        it('reports dry run when the setting asks for it', () => {
            process.env.RENAME_DRY_RUN = 'true';
            expect(resolveDryRun()).toMatchObject({ dryRun: true, reason: 'RENAME_DRY_RUN is enabled' });
        });

        it('a placeholder type outranks the setting being off', () => {
            process.env.RENAME_DRY_RUN = 'true';
            expect(resolveDryRun(undefined, { type: 'COSTING', placeholder: true }).dryRun).toBe(true);
        });

        it('allows live renaming only with real rules and dry run off', () => {
            process.env.RENAME_DRY_RUN = 'false';
            expect(resolveDryRun()).toEqual({ dryRun: false, reason: null });
        });
    });
});
