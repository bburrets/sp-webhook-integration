/**
 * Document Rename Timer
 * Hourly sweep of one folder in a document library. Enumerates the folder,
 * decides which files need work, and enqueues one message per candidate.
 *
 * The scan target is a SharePoint URL and subfolders are walked by default.
 * This library nests by type and month (CHECK/2026/2026_01), so a single-folder
 * scan would need reconfiguring every month, and the folder a file sits in is
 * also what identifies its document type.
 *
 * The timer performs NO file I/O and NO writes. It lists, filters, and enqueues.
 * All downloading, parsing, and renaming happens in document-rename-worker, one
 * file per invocation, so neither function can approach the 5-minute
 * Consumption timeout (host.json sets no functionTimeout).
 *
 * It deliberately does not write status for compliant files. Recording
 * "checked, fine" on every already-correct file would mean hundreds of listItem
 * writes per hour, and each one bumps Modified and fires the library's live
 * webhook. Silence is the correct signal for a file that needs nothing.
 *
 * Schedule is offset 30 minutes from webhook-sync-timer's '0 0 * * * *' so the
 * two do not contend for Graph auth and throttle budget on the same tick.
 */

const { app, output } = require('@azure/functions');
const { getAccessToken } = require('../shared/auth');
const { createLogger } = require('../shared/logger');
const { listFolderFiles, resolveDrive } = require('../shared/sharepoint-folder-scanner');
const { getRuleSets, getDisabledTypeFolders } = require('../shared/document-type-rules');
const { isCompliant, getExtension } = require('../shared/document-naming-engine');
const { readState, isExhausted, isTerminal } = require('../shared/document-rename-status');
const {
    getRenameConfig,
    getScanTarget,
    validateRenameConfig,
    resolveDryRun
} = require('../shared/document-rename-config');

const RENAME_QUEUE_NAME = 'document-rename';

const renameQueueOutput = output.storageQueue({
    queueName: RENAME_QUEUE_NAME,
    connection: 'AzureWebJobsStorage'
});

/**
 * Decide what to do with one file.
 * @param {Object} params
 * @param {Object} params.file - Normalised file from the scanner
 * @param {Object[]} params.ruleSets
 * @param {Array<{type: string, hints: string[]}>} [params.disabledFolders]
 * @returns {{candidate: boolean, reason: string, state: Object}}
 */
function evaluateFile({ file, ruleSets, disabledFolders = [] }) {
    const state = readState(file.fields);
    const extension = getExtension(file.name);

    // A file sitting in a switched-off type's folder can never be processed, so
    // skip it here rather than downloading and parsing it to discover that.
    const segments = String(file.folderPath || '')
        .split('/')
        .filter(Boolean)
        .map((segment) => segment.toLowerCase());
    const disabled = disabledFolders.find((entry) =>
        entry.hints.some((hint) => segments.includes(hint)));
    if (disabled) {
        return { candidate: false, reason: `type-disabled:${disabled.type}`, state };
    }

    // Only PDFs are in scope. Skipped silently — writing a status for every
    // stray .xlsx on every sweep would be pure noise.
    const anyRuleAcceptsExtension = ruleSets.some((ruleSet) => ruleSet.extensions.includes(extension));
    if (!anyRuleAcceptsExtension) {
        return { candidate: false, reason: 'unsupported-extension', state };
    }

    // A name that already satisfies any convention is finished. This is also
    // what stops a renamed file being reprocessed on the next sweep.
    const compliantWith = ruleSets.find((ruleSet) => isCompliant(file.name, ruleSet));
    if (compliantWith) {
        return { candidate: false, reason: `already-compliant:${compliantWith.type}`, state };
    }

    // Content changed since we last looked, so any previous verdict is stale.
    const contentChanged = Boolean(
        state.contentHash && file.sha1Hash && state.contentHash !== file.sha1Hash
    );

    if (isExhausted({ state, contentHash: file.sha1Hash })) {
        return { candidate: false, reason: 'attempts-exhausted', state };
    }

    if (isTerminal(state.status) && !contentChanged) {
        return { candidate: false, reason: `terminal:${state.status}`, state };
    }

    return { candidate: true, reason: 'needs-processing', state };
}

/**
 * Filter a folder listing down to the files worth enqueueing.
 * @param {Object} params
 * @param {Object[]} params.files
 * @param {Object[]} [params.ruleSets]
 * @param {Array<{type: string, hints: string[]}>} [params.disabledFolders]
 * @param {number} [params.maxPerSweep]
 * @returns {{candidates: Object[], skipped: Object, deferred: number}}
 */
function selectCandidates({ files, ruleSets, disabledFolders, maxPerSweep = Infinity }) {
    const sets = ruleSets || getRuleSets();
    const disabled = disabledFolders || getDisabledTypeFolders();
    const skipped = {};
    const candidates = [];

    for (const file of files) {
        const verdict = evaluateFile({ file, ruleSets: sets, disabledFolders: disabled });
        if (verdict.candidate) {
            candidates.push({ file, state: verdict.state });
        } else {
            skipped[verdict.reason] = (skipped[verdict.reason] || 0) + 1;
        }
    }

    // Oldest first, so a backlog drains in a predictable order rather than
    // whatever order Graph happened to return.
    candidates.sort((a, b) =>
        String(a.file.lastModifiedDateTime || '').localeCompare(String(b.file.lastModifiedDateTime || ''))
    );

    const deferred = Math.max(0, candidates.length - maxPerSweep);

    return {
        candidates: deferred > 0 ? candidates.slice(0, maxPerSweep) : candidates,
        skipped,
        deferred
    };
}

/**
 * Build the queue message for one candidate.
 *
 * The pre-signed download URL is deliberately NOT included: it expires in about
 * an hour and a queued message can outlive that. The worker re-fetches the
 * driveItem, which also lets it notice a file that changed or was deleted
 * between the sweep and processing.
 *
 * @param {Object} params
 * @returns {string} JSON message
 */
function buildRenameMessage({ file, state, driveId, enqueuedAt }) {
    return JSON.stringify({
        driveId,
        driveItemId: file.driveItemId,
        name: file.name,
        // The folder identifies the document type, so the worker needs it.
        folderPath: file.folderPath || '',
        sha1Hash: file.sha1Hash,
        attempts: state.attempts,
        enqueuedAt
    });
}

/**
 * The sweep itself. Exported for testing without the timer binding.
 * @param {Object} context - Azure Functions context
 * @returns {Promise<Object>} Summary
 */
async function runSweep(context) {
    const logger = createLogger(context);
    const renameConfig = getRenameConfig();

    if (!renameConfig.enabled) {
        logger.info('Document rename sweep skipped, feature disabled', {
            service: 'rename-timer',
            hint: 'Set RENAME_ENABLED=true to enable'
        });
        return { enqueued: 0, skipped: {}, disabled: true };
    }

    const problems = validateRenameConfig(renameConfig);
    if (problems.length > 0) {
        // Configuration errors are logged at error level so the alerting rules
        // pick them up; a silently misconfigured sweep would look identical to
        // a folder with nothing to do.
        logger.error('Document rename sweep misconfigured, nothing done', {
            service: 'rename-timer',
            problems
        });
        return { enqueued: 0, skipped: {}, misconfigured: problems };
    }

    const { dryRun, reason: dryRunReason } = resolveDryRun(renameConfig);
    const target = getScanTarget(renameConfig);
    const accessToken = await getAccessToken(context);

    // The URL names a library; Graph needs the drive behind it.
    const drive = await resolveDrive({
        accessToken,
        sitePath: target.sitePath,
        libraryName: target.libraryName,
        context
    });

    const { files, foldersVisited, truncated } = await listFolderFiles({
        accessToken,
        driveId: drive.id,
        folderPath: target.folderPath,
        recursive: renameConfig.recursive,
        context
    });

    const { candidates, skipped, deferred } = selectCandidates({
        files,
        maxPerSweep: renameConfig.maxPerSweep
    });

    const enqueuedAt = new Date().toISOString();
    const messages = candidates.map(({ file, state }) =>
        buildRenameMessage({ file, state, driveId: drive.id, enqueuedAt }));

    if (messages.length > 0) {
        context.extraOutputs.set(renameQueueOutput, messages);
    }

    if (deferred > 0) {
        logger.warn('Sweep deferred candidates over the per-sweep cap', {
            service: 'rename-timer',
            deferred,
            maxPerSweep: renameConfig.maxPerSweep,
            hint: 'The remainder is picked up by the next sweep'
        });
    }

    logger.info('Document rename sweep complete', {
        service: 'rename-timer',
        library: target.libraryName,
        folderPath: target.folderPath || '(library root)',
        recursive: renameConfig.recursive,
        foldersVisited,
        filesSeen: files.length,
        enqueued: messages.length,
        deferred,
        skipped,
        dryRun,
        dryRunReason,
        truncated
    });

    return { enqueued: messages.length, skipped, deferred, dryRun, truncated };
}

app.timer('document-rename-timer', {
    // Offset from webhook-sync-timer's top-of-hour schedule on purpose.
    schedule: '0 30 * * * *',
    extraOutputs: [renameQueueOutput],
    handler: async (_timer, context) => {
        const logger = createLogger(context);
        try {
            await runSweep(context);
        } catch (error) {
            // A timer that throws is reported as a failed invocation, which the
            // sp-webhook-worker-failing style alert rules can see. Unlike
            // webhook-sync.js, this does not swallow the error into a log line
            // that reports success while broken.
            logger.error('Document rename sweep failed', {
                service: 'rename-timer',
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
});

module.exports = {
    runSweep,
    selectCandidates,
    evaluateFile,
    buildRenameMessage,
    RENAME_QUEUE_NAME
};
