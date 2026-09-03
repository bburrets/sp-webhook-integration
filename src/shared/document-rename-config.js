/**
 * Document Rename Configuration
 * Kept separate from shared/config.js so that adding this feature touches no
 * file on the live notification path.
 *
 * The scan target is a SharePoint URL — the thing an operator can actually copy
 * from the address bar — rather than a site path, drive id and drive-relative
 * folder path, none of which are visible anywhere in SharePoint. The drive is
 * resolved from the library name at scan time.
 *
 * Two settings default to the safe value rather than the useful one:
 *   RENAME_ENABLED  defaults false — the sweep does nothing until switched on.
 *   RENAME_DRY_RUN  defaults true  — a missing or misspelled setting cannot
 *                                    cause a live rename.
 */

const { hasPlaceholderRules, placeholderTypes } = require('./document-type-rules');
const { parseSharePointUrl } = require('./sharepoint-url');

// Cap on how many candidates one sweep enqueues. At ~400 documents/day this is
// generous; it exists so a first run against a large library backlog does not
// enqueue everything at once.
const DEFAULT_MAX_PER_SWEEP = 500;

function readBoolean(value, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    return String(value).toLowerCase() === 'true';
}

/**
 * Resolve the feature configuration from app settings.
 * @returns {Object}
 */
function getRenameConfig() {
    const maxPerSweep = Number(process.env.RENAME_MAX_PER_SWEEP);

    return {
        enabled: readBoolean(process.env.RENAME_ENABLED, false),
        // Explicit opt-in required to write. See module header.
        dryRun: readBoolean(process.env.RENAME_DRY_RUN, true),
        libraryUrl: process.env.RENAME_LIBRARY_URL || null,
        // Subfolders are in scope by default: this library nests by type and
        // month (CHECK/2026/2026_01), so a non-recursive scan of a sensible
        // starting point would find nothing at all.
        recursive: readBoolean(process.env.RENAME_RECURSIVE, true),
        // Content always classifies first. This only controls whether the
        // folder is consulted when the document itself is inconclusive --
        // usually because OCR salvaged nothing from it.
        folderFallback: readBoolean(process.env.RENAME_CLASSIFY_BY_FOLDER, true),
        maxPerSweep: Number.isInteger(maxPerSweep) && maxPerSweep > 0
            ? maxPerSweep
            : DEFAULT_MAX_PER_SWEEP
    };
}

/**
 * Resolve the configured URL into its Graph parts.
 * @param {Object} [renameConfig]
 * @returns {{hostname, siteName, sitePath, libraryName, folderPath, isRoot}|null}
 */
function getScanTarget(renameConfig = getRenameConfig()) {
    if (!renameConfig.libraryUrl) {
        return null;
    }
    return parseSharePointUrl(renameConfig.libraryUrl);
}

/**
 * What is missing or wrong about the current configuration?
 * @param {Object} [renameConfig]
 * @returns {string[]} Empty when usable
 */
function validateRenameConfig(renameConfig = getRenameConfig()) {
    const problems = [];

    if (!renameConfig.libraryUrl) {
        problems.push(
            'RENAME_LIBRARY_URL is not set. Paste the URL of the document library or folder to '
            + 'scan, e.g. https://contoso.sharepoint.com/sites/Finance/OutputBox/Forms/AllItems.aspx'
        );
        return problems;
    }

    try {
        getScanTarget(renameConfig);
    } catch (error) {
        problems.push(`RENAME_LIBRARY_URL could not be parsed: ${error.message}`);
    }

    return problems;
}

/**
 * Should renames actually be written for this document?
 *
 * The placeholder interlock is PER TYPE, not global. A rule set whose convention
 * is not yet confirmed cannot rename its own files, but it must not stop a
 * confirmed type from renaming — otherwise one unreviewed document type holds
 * the whole feature in dry-run.
 *
 * Called without a rule set (from the timer, which has not classified anything
 * yet) it reports only what the RENAME_DRY_RUN setting says, plus a note if any
 * type is still a placeholder.
 *
 * @param {Object} [renameConfig]
 * @param {Object} [ruleSet] - The classified type, when known
 * @returns {{dryRun: boolean, reason: string|null}}
 */
function resolveDryRun(renameConfig = getRenameConfig(), ruleSet = null) {
    if (ruleSet && ruleSet.placeholder) {
        return {
            dryRun: true,
            reason: `${ruleSet.type} is still marked placeholder. Confirm its convention and set `
                + '"placeholder": false to enable renaming for this type.'
        };
    }

    if (renameConfig.dryRun) {
        return { dryRun: true, reason: 'RENAME_DRY_RUN is enabled' };
    }

    if (!ruleSet && hasPlaceholderRules()) {
        // Timer-level reporting only: these types will stay in dry-run even
        // once RENAME_DRY_RUN is off.
        return {
            dryRun: false,
            reason: `Live, except these types which remain placeholders: ${placeholderTypes().join(', ')}`
        };
    }

    return { dryRun: false, reason: null };
}

module.exports = {
    getRenameConfig,
    getScanTarget,
    validateRenameConfig,
    resolveDryRun,
    DEFAULT_MAX_PER_SWEEP
};
