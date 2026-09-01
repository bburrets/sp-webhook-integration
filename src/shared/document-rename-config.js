/**
 * Document Rename Configuration
 * Kept separate from shared/config.js so that adding this feature touches no
 * file on the live notification path.
 *
 * Two settings default to the safe value rather than the useful one:
 *   RENAME_ENABLED  defaults false — the sweep does nothing until switched on.
 *   RENAME_DRY_RUN  defaults true  — a missing or misspelled setting cannot
 *                                    cause a live rename.
 */

const { hasPlaceholderRules, placeholderTypes } = require('./document-type-rules');

// Cap on how many candidates one sweep enqueues. At ~400 documents/day this is
// generous; it exists so a misconfigured folder path pointing at a whole library
// cannot enqueue thousands of downloads in one tick.
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
        sitePath: process.env.RENAME_SITE_PATH || null,
        listId: process.env.RENAME_LIST_ID || null,
        folderPath: process.env.RENAME_FOLDER_PATH || null,
        driveId: process.env.RENAME_DRIVE_ID || null,
        maxPerSweep: Number.isInteger(maxPerSweep) && maxPerSweep > 0
            ? maxPerSweep
            : DEFAULT_MAX_PER_SWEEP
    };
}

/**
 * What is missing or wrong about the current configuration?
 * @param {Object} [renameConfig]
 * @returns {string[]} Empty when usable
 */
function validateRenameConfig(renameConfig = getRenameConfig()) {
    const problems = [];

    if (!renameConfig.sitePath) {
        problems.push('RENAME_SITE_PATH is not set (e.g. "host.sharepoint.com:/sites/Accounting_Research:")');
    }
    if (!renameConfig.listId) {
        problems.push('RENAME_LIST_ID is not set (the document library list id, needed to write status columns)');
    }
    if (!renameConfig.folderPath && !renameConfig.driveId) {
        problems.push('RENAME_FOLDER_PATH is not set (the folder to scan, relative to the drive root)');
    }

    return problems;
}

/**
 * Should renames actually be written?
 *
 * Placeholder rule sets force dry-run regardless of RENAME_DRY_RUN. Those
 * patterns are guesses at the real naming convention; letting them rename live
 * files would be worse than doing nothing.
 *
 * @param {Object} [renameConfig]
 * @returns {{dryRun: boolean, reason: string|null}}
 */
function resolveDryRun(renameConfig = getRenameConfig()) {
    if (hasPlaceholderRules()) {
        return {
            dryRun: true,
            reason: `Rule sets still marked placeholder: ${placeholderTypes().join(', ')}. `
                + 'Supply the real naming conventions and set "placeholder": false to enable renaming.'
        };
    }

    if (renameConfig.dryRun) {
        return { dryRun: true, reason: 'RENAME_DRY_RUN is enabled' };
    }

    return { dryRun: false, reason: null };
}

module.exports = {
    getRenameConfig,
    validateRenameConfig,
    resolveDryRun,
    DEFAULT_MAX_PER_SWEEP
};
