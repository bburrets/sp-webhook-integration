/**
 * Document Rename Worker
 * Processes one file per queue message: download, extract text, classify,
 * validate the name, and rename if it is wrong.
 *
 * Failure taxonomy — the distinction matters because it decides whether a file
 * is ever looked at again:
 *
 *   Deterministic outcomes (no text layer, unclassifiable, missing fields,
 *   unsupported type) cannot change unless the file's content changes. These
 *   are recorded with attempts driven straight to MAX_ATTEMPTS so the hourly
 *   sweep stops re-downloading them, while the status column still names the
 *   actual reason. A changed content hash re-arms the file.
 *
 *   Contingent outcomes (name collision) can resolve on their own once the
 *   other file moves, so they increment attempts normally and get retried.
 *
 *   Unexpected errors are rethrown so the storage queue retries the message,
 *   ending in document-rename-poison after maxDequeueCount.
 */

const { app } = require('@azure/functions');
const { getAccessToken } = require('../shared/auth');
const { createLogger } = require('../shared/logger');
const { getFileById, listFolderFiles } = require('../shared/sharepoint-folder-scanner');
const { extractDocumentText } = require('../shared/document-content-extractor');
const { classify } = require('../shared/document-classifier');
const { getRuleSets, hasGeneratedFields } = require('../shared/document-type-rules');
const { isCompliant, buildProposedName } = require('../shared/document-naming-engine');
const { checkCollision, renameFile } = require('../shared/sharepoint-file-renamer');
const {
    RENAME_STATUS,
    MAX_ATTEMPTS,
    writeStatus
} = require('../shared/document-rename-status');
const { getRenameConfig, resolveDryRun } = require('../shared/document-rename-config');

// Short-lived cache of folder listings, used only for the dry-run collision
// pre-check. batchSize is 1 (host.json) so messages from one sweep are handled
// sequentially on the same instance; without this a sweep of N files would list
// the folder N times. Live renames do not use it — Graph's own 409 is
// authoritative and cannot go stale.
const FOLDER_CACHE_TTL_MS = 60000;
const folderCache = new Map();

// How many times to re-mint a generated value that collided. A collision on a
// random id (GLJE's 6-digit number) is bad luck rather than a duplicate
// document, so retrying is correct; a collision on an extracted value is
// information and still goes to the exception path.
const MAX_REGENERATION_ATTEMPTS = 5;

/**
 * Statuses that cannot change while the file's content stays the same.
 */
const DETERMINISTIC_STATUSES = new Set([
    RENAME_STATUS.NO_TEXT_LAYER,
    RENAME_STATUS.UNCLASSIFIED,
    RENAME_STATUS.MISSING_FIELDS,
    RENAME_STATUS.UNSUPPORTED_TYPE
]);

/** Clear the folder listing cache. Tests only. */
function resetFolderCache() {
    folderCache.clear();
}

/**
 * Folder listing with a short TTL.
 * @returns {Promise<Object[]>}
 */
async function getCachedFolderFiles({ accessToken, driveId, folderPath, context }) {
    const key = `${driveId}|${folderPath || ''}`;
    const cached = folderCache.get(key);

    if (cached && Date.now() - cached.at < FOLDER_CACHE_TTL_MS) {
        return cached.files;
    }

    // Not recursive: a filename can only collide inside its own folder.
    const { files } = await listFolderFiles({
        accessToken, driveId, folderPath, recursive: false, context
    });
    folderCache.set(key, { at: Date.now(), files });
    return files;
}

/**
 * Work out the attempt count to record for an outcome.
 * @param {string} status
 * @param {number} priorAttempts
 * @returns {number}
 */
function nextAttempts(status, priorAttempts) {
    if (DETERMINISTIC_STATUSES.has(status)) {
        // Nothing is gained by trying again on identical content.
        return MAX_ATTEMPTS;
    }
    return priorAttempts + 1;
}

/**
 * Process one queued file.
 * @param {string|Object} message
 * @param {Object} context
 * @returns {Promise<Object>} Outcome summary
 */
async function handleRenameMessage(message, context) {
    const logger = createLogger(context);
    const job = typeof message === 'string' ? JSON.parse(message) : message;
    const renameConfig = getRenameConfig();
    const { driveId, driveItemId } = job;
    // The folder a file sits in identifies its document type in this library.
    const folderPath = job.folderPath || '';
    const priorAttempts = Number(job.attempts) || 0;

    logger.info('Processing rename candidate', {
        service: 'rename-worker',
        driveItemId,
        name: job.name,
        folderPath,
        priorAttempts,
        dequeueCount: context.triggerMetadata?.dequeueCount
    });

    /**
     * Record an outcome and return it. Status writes never throw, so a lost
     * write cannot mask the real result.
     */
    const record = async ({ status, docType = null, detail = null, attempts = null, previousName = null, contentHash = null }) => {
        await writeStatus({
            accessToken: await getAccessToken(context),
            driveId,
            driveItemId,
            status,
            docType,
            detail,
            attempts: attempts === null ? nextAttempts(status, priorAttempts) : attempts,
            previousName,
            contentHash,
            context
        });
        logger.info('Rename outcome recorded', {
            service: 'rename-worker',
            driveItemId,
            name: job.name,
            status,
            docType,
            detail
        });
        return { status, docType, detail };
    };

    const accessToken = await getAccessToken(context);

    // Re-read the file: the sweep's snapshot may be stale, and this yields a
    // fresh pre-signed download URL.
    const file = await getFileById({ accessToken, driveId, driveItemId, context });

    if (!file) {
        logger.info('Skipping rename, file no longer exists', {
            service: 'rename-worker',
            driveItemId,
            name: job.name
        });
        return { status: 'Gone' };
    }

    const ruleSets = getRuleSets();

    // Something already fixed this file between the sweep and now.
    if (ruleSets.some((ruleSet) => isCompliant(file.name, ruleSet))) {
        logger.info('Skipping rename, name already compliant', {
            service: 'rename-worker',
            driveItemId,
            name: file.name
        });
        return { status: RENAME_STATUS.ALREADY_COMPLIANT };
    }

    const extraction = await extractDocumentText({
        driveItem: file.driveItem,
        accessToken,
        context
    });

    if (extraction.unsupported) {
        return record({
            status: RENAME_STATUS.UNSUPPORTED_TYPE,
            detail: `"${file.name}" is not a supported file type for renaming`,
            contentHash: file.sha1Hash
        });
    }

    // The scanned-PDF path. Named precisely so the dry-run report shows how much
    // of the folder would need OCR.
    if (!extraction.hasTextLayer) {
        return record({
            status: RENAME_STATUS.NO_TEXT_LAYER,
            detail: `No usable text layer (${extraction.charCount} chars over ${extraction.pageCount} page(s)). `
                + 'Likely a scanned image; needs OCR or manual naming.',
            contentHash: file.sha1Hash
        });
    }

    const classification = classify({
        fileName: file.name,
        text: extraction.text,
        folderPath,
        folderFallback: renameConfig.folderFallback,
        ruleSets
    });

    if (!classification.ruleSet) {
        return record({
            status: RENAME_STATUS.UNCLASSIFIED,
            detail: classification.reason || 'Could not determine document type',
            contentHash: file.sha1Hash
        });
    }

    // Decided here rather than up front: the interlock is per document type, so
    // it needs the classification.
    const { dryRun, reason: dryRunReason } = resolveDryRun(renameConfig, classification.ruleSet);

    const rebuild = () => buildProposedName({
        fileName: file.name,
        text: extraction.text,
        ruleSet: classification.ruleSet
    });

    // Mutable: a colliding generated value is re-minted below.
    let proposal = rebuild();
    const canRegenerate = hasGeneratedFields(classification.ruleSet);

    if (!proposal.ok) {
        return record({
            status: RENAME_STATUS.MISSING_FIELDS,
            docType: classification.type,
            detail: proposal.reason,
            contentHash: file.sha1Hash
        });
    }

    // Dry run: predict collisions from the folder listing, since no PATCH will
    // happen to surface a real 409.
    if (dryRun) {
        const existingFiles = await getCachedFolderFiles({
            accessToken, driveId, folderPath, context
        });

        let collision = checkCollision({
            proposedName: proposal.name,
            existingFiles,
            currentDriveItemId: driveItemId
        });

        // Re-mint a colliding generated value rather than reporting it.
        for (let i = 0; collision.collides && canRegenerate && i < MAX_REGENERATION_ATTEMPTS; i += 1) {
            proposal = rebuild();
            if (!proposal.ok) {
                break;
            }
            collision = checkCollision({
                proposedName: proposal.name,
                existingFiles,
                currentDriveItemId: driveItemId
            });
        }

        if (collision.collides) {
            return record({
                status: RENAME_STATUS.NAME_COLLISION,
                docType: classification.type,
                detail: `Would rename to "${proposal.name}" but that name is already taken`,
                contentHash: file.sha1Hash
            });
        }

        return record({
            status: RENAME_STATUS.DRY_RUN,
            docType: classification.type,
            detail: `Would rename to "${proposal.name}". ${dryRunReason || ''}`.trim(),
            // A dry run is not an attempt at anything, so the counter is held
            // where it was. Otherwise a few dry sweeps would exhaust every file
            // before the feature was ever switched on.
            attempts: priorAttempts,
            contentHash: file.sha1Hash
        });
    }

    let result = await renameFile({
        accessToken,
        driveId,
        driveItemId,
        newName: proposal.name,
        dryRun: false,
        context
    });

    // Graph is the final arbiter on collisions. If the value that collided was
    // minted rather than extracted, mint another and try again.
    for (let i = 0; result.collision && canRegenerate && i < MAX_REGENERATION_ATTEMPTS; i += 1) {
        proposal = rebuild();
        if (!proposal.ok) {
            break;
        }
        logger.info('Regenerating a colliding generated value', {
            service: 'rename-worker',
            driveItemId,
            attempt: i + 1,
            newName: proposal.name
        });
        result = await renameFile({
            accessToken, driveId, driveItemId, newName: proposal.name, dryRun: false, context
        });
    }

    if (result.collision) {
        return record({
            status: RENAME_STATUS.NAME_COLLISION,
            docType: classification.type,
            detail: result.error,
            contentHash: file.sha1Hash
        });
    }

    return record({
        status: RENAME_STATUS.RENAMED,
        docType: classification.type,
        detail: `Renamed from "${file.name}" to "${proposal.name}"`,
        previousName: file.name,
        attempts: priorAttempts,
        contentHash: file.sha1Hash
    });
}

/**
 * Queue handler. Wraps handleRenameMessage so an unexpected failure is recorded
 * against the file before being rethrown for the queue to retry.
 */
async function handleQueueMessage(message, context) {
    const logger = createLogger(context);

    try {
        return await handleRenameMessage(message, context);
    } catch (error) {
        const job = typeof message === 'string' ? safeParse(message) : message;

        logger.error('Rename processing failed', {
            service: 'rename-worker',
            driveItemId: job?.driveItemId,
            name: job?.name,
            dequeueCount: context.triggerMetadata?.dequeueCount,
            error: error.message,
            stack: error.stack
        });

        if (job?.driveId && job?.driveItemId) {
            await writeStatus({
                accessToken: await getAccessToken(context).catch(() => null),
                driveId: job.driveId,
                driveItemId: job.driveItemId,
                status: RENAME_STATUS.ERROR,
                detail: error.message,
                attempts: (Number(job.attempts) || 0) + 1,
                context
            });
        }

        // Rethrow so the queue retries and eventually poisons, rather than
        // deleting the message and losing the file silently.
        throw error;
    }
}

function safeParse(value) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

app.storageQueue('document-rename-worker', {
    queueName: 'document-rename',
    connection: 'AzureWebJobsStorage',
    handler: handleQueueMessage
});

module.exports = {
    handleQueueMessage,
    handleRenameMessage,
    nextAttempts,
    resetFolderCache,
    getCachedFolderFiles,
    DETERMINISTIC_STATUSES,
    FOLDER_CACHE_TTL_MS,
    MAX_REGENERATION_ATTEMPTS
};
