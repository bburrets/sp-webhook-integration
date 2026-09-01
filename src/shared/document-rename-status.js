/**
 * Document Rename Status
 * Reads and writes the per-file state that drives the sweep.
 *
 * DEVIATION FROM PLAN: the plan called for an Azure Table Storage attempt
 * counter modelled on processing-deduplicator.js. That turned out to be
 * unnecessary. The folder scanner already expands listItem($expand=fields) on
 * every file, so the status columns come back with the listing for free — no
 * extra table, no extra round trip, and the state is visible to the accounting
 * team in the library view rather than buried in storage. SharePoint is
 * therefore the single source of truth for attempt state.
 *
 * DEVIATION FROM PLAN: writes go through graphRequest rather than
 * graph-api.js updateListItem. updateListItem uses bare axios with no 429
 * handling; a throttled status write would throw and force the queue to retry
 * the whole file, re-downloading and re-parsing it. The retry-aware path is
 * worth more here than the reuse.
 */

const { createLogger } = require('./logger');
const { graphRequest } = require('./graph-request');
const config = require('./config');

/**
 * Outcomes recorded against a file. These are the values the RenameStatus
 * choice column must offer.
 */
const RENAME_STATUS = {
    RENAMED: 'Renamed',
    ALREADY_COMPLIANT: 'AlreadyCompliant',
    NO_TEXT_LAYER: 'NoTextLayer',
    UNCLASSIFIED: 'Unclassified',
    MISSING_FIELDS: 'MissingFields',
    NAME_COLLISION: 'NameCollision',
    UNSUPPORTED_TYPE: 'UnsupportedType',
    DRY_RUN: 'DryRun',
    ERROR: 'Error',
    PERMANENTLY_FAILED: 'PermanentlyFailed'
};

/** SharePoint internal field names. Created without spaces so no _x0020_ encoding applies. */
const STATUS_FIELDS = {
    docType: 'DocTypeDetected',
    status: 'RenameStatus',
    detail: 'RenameDetail',
    attempts: 'RenameAttempts',
    processedAt: 'RenameProcessedAt',
    previousName: 'RenamePreviousName',
    contentHash: 'RenameContentHash'
};

// After this many failed attempts on unchanged content, stop reprocessing the
// file. Without this the hourly sweep would re-download and re-parse a doomed
// document forever.
const MAX_ATTEMPTS = 3;

// SharePoint multi-line text fields accept far more, but there is no value in
// storing a huge stack trace in a column a human reads in a list view.
const MAX_DETAIL_LENGTH = 900;

/**
 * Read rename state off a listItem's fields.
 * @param {Object} fields - listItem.fields from the scanner
 * @returns {{status: string|null, attempts: number, contentHash: string|null, processedAt: string|null, docType: string|null}}
 */
function readState(fields = {}) {
    const rawAttempts = fields[STATUS_FIELDS.attempts];
    const attempts = Number.isFinite(Number(rawAttempts)) ? Number(rawAttempts) : 0;

    return {
        status: fields[STATUS_FIELDS.status] || null,
        attempts,
        contentHash: fields[STATUS_FIELDS.contentHash] || null,
        processedAt: fields[STATUS_FIELDS.processedAt] || null,
        docType: fields[STATUS_FIELDS.docType] || null
    };
}

/**
 * Has this file exhausted its attempts on content we have already tried?
 *
 * A changed content hash re-arms the file: someone re-uploaded or corrected it,
 * so it deserves a fresh set of attempts.
 *
 * @param {Object} params
 * @param {Object} params.state - From readState
 * @param {string|null} params.contentHash - Current sha1 from the scanner
 * @returns {boolean}
 */
function isExhausted({ state, contentHash }) {
    if (!state || state.attempts < MAX_ATTEMPTS) {
        return false;
    }

    // No hash recorded (or none available now) — fall back to the counter alone.
    if (!state.contentHash || !contentHash) {
        return true;
    }

    return state.contentHash === contentHash;
}

/**
 * Terminal statuses. A file in one of these needs no further work unless its
 * content changes.
 */
function isTerminal(status) {
    return status === RENAME_STATUS.RENAMED
        || status === RENAME_STATUS.ALREADY_COMPLIANT
        || status === RENAME_STATUS.PERMANENTLY_FAILED;
}

/**
 * Write rename state back to the file's list item.
 *
 * Never throws: a status write is bookkeeping, and losing it must not fail an
 * otherwise successful rename or mask the real error on a failed one. Returns
 * whether the write landed.
 *
 * @param {Object} params
 * @param {string} params.accessToken
 * @param {string} params.sitePath
 * @param {string} params.listId
 * @param {string} params.listItemId
 * @param {string} params.status - One of RENAME_STATUS
 * @param {string|null} [params.docType]
 * @param {string|null} [params.detail]
 * @param {number} [params.attempts]
 * @param {string|null} [params.previousName]
 * @param {string|null} [params.contentHash]
 * @param {Object} [params.context]
 * @returns {Promise<boolean>}
 */
async function writeStatus({
    accessToken,
    sitePath,
    listId,
    listItemId,
    status,
    docType = null,
    detail = null,
    attempts = null,
    previousName = null,
    contentHash = null,
    context
}) {
    const logger = createLogger(context);

    if (!listItemId || !listId || !sitePath) {
        logger.warn('Cannot write rename status without sitePath, listId and listItemId', {
            service: 'rename-status',
            listItemId,
            status
        });
        return false;
    }

    const fields = {
        [STATUS_FIELDS.status]: status,
        [STATUS_FIELDS.processedAt]: new Date().toISOString()
    };

    if (docType !== null) {
        fields[STATUS_FIELDS.docType] = docType;
    }
    if (detail !== null) {
        fields[STATUS_FIELDS.detail] = String(detail).slice(0, MAX_DETAIL_LENGTH);
    }
    if (attempts !== null) {
        fields[STATUS_FIELDS.attempts] = attempts;
    }
    if (previousName !== null) {
        fields[STATUS_FIELDS.previousName] = previousName;
    }
    if (contentHash !== null) {
        fields[STATUS_FIELDS.contentHash] = contentHash;
    }

    const url = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items/${listItemId}`;

    try {
        await graphRequest({
            url,
            method: 'patch',
            accessToken,
            data: { fields },
            context
        });
        logger.debug('Rename status written', {
            service: 'rename-status',
            listItemId,
            status,
            attempts
        });
        return true;
    } catch (error) {
        logger.error('Failed to write rename status', {
            service: 'rename-status',
            listItemId,
            status,
            graphStatus: error.response?.status || null,
            error: error.message
        });
        return false;
    }
}

module.exports = {
    RENAME_STATUS,
    STATUS_FIELDS,
    MAX_ATTEMPTS,
    MAX_DETAIL_LENGTH,
    readState,
    isExhausted,
    isTerminal,
    writeStatus
};
