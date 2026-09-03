/**
 * SharePoint File Renamer
 * The only code in this repo that mutates a file in SharePoint.
 *
 * Two safety properties matter here:
 *
 * 1. Collisions are an exception, never an auto-suffix. If two documents render
 *    to the same name, that is either a genuine duplicate upload or a bad
 *    extraction, and silently creating NAME_2.pdf would hide both. The caller
 *    records NameCollision and a human decides.
 *
 * 2. Graph is the final arbiter. The pre-check runs against the folder listing,
 *    which is a snapshot; a concurrent upload could still take the name. Graph
 *    rejects a conflicting rename with 409 nameAlreadyExists by default (no
 *    conflictBehavior is sent, so it does NOT auto-rename), and that 409 is
 *    surfaced as a collision rather than a generic failure.
 */

const { createLogger } = require('./logger');
const { graphRequest } = require('./graph-request');
const config = require('./config');

/**
 * Would this name collide with something already in the folder?
 *
 * SharePoint filenames are case-insensitive, so the comparison is too.
 *
 * @param {Object} params
 * @param {string} params.proposedName
 * @param {Object[]} params.existingFiles - Normalised files from the scanner
 * @param {string} params.currentDriveItemId - The file being renamed
 * @returns {{collides: boolean, conflictingFile: Object|null}}
 */
function checkCollision({ proposedName, existingFiles, currentDriveItemId }) {
    const wanted = String(proposedName).toLowerCase();

    const conflictingFile = (existingFiles || []).find((file) =>
        // A match against the file itself is not a collision — it means the
        // file already carries the proposed name.
        file.driveItemId !== currentDriveItemId
        && String(file.name).toLowerCase() === wanted
    );

    return {
        collides: Boolean(conflictingFile),
        conflictingFile: conflictingFile || null
    };
}

/**
 * Rename a driveItem.
 *
 * @param {Object} params
 * @param {string} params.accessToken
 * @param {string} params.driveId
 * @param {string} params.driveItemId
 * @param {string} params.newName
 * @param {boolean} [params.dryRun=true] - Defaults to true: a caller that
 *   forgets to pass it does not rename anything
 * @param {Object} [params.context]
 * @returns {Promise<{renamed: boolean, dryRun: boolean, collision: boolean, newName: string, error: string|null}>}
 */
async function renameFile({
    accessToken,
    driveId,
    driveItemId,
    newName,
    dryRun = true,
    context
}) {
    const logger = createLogger(context);

    if (!driveId || !driveItemId) {
        throw new Error('renameFile requires both driveId and driveItemId');
    }
    if (!newName) {
        throw new Error('renameFile requires a newName');
    }

    if (dryRun) {
        logger.info('Rename suppressed by dry run', {
            service: 'file-renamer',
            driveItemId,
            proposedName: newName
        });
        return { renamed: false, dryRun: true, collision: false, newName, error: null };
    }

    const url = `${config.api.graph.baseUrl}/drives/${driveId}/items/${driveItemId}`;

    try {
        await graphRequest({
            url,
            method: 'patch',
            accessToken,
            data: { name: newName },
            context
        });

        logger.info('File renamed', {
            service: 'file-renamer',
            driveItemId,
            newName
        });

        return { renamed: true, dryRun: false, collision: false, newName, error: null };
    } catch (error) {
        const status = error.response?.status;
        const graphCode = error.response?.data?.error?.code;

        // 409 means the pre-check lost a race. Report it as a collision so the
        // caller writes the accurate status instead of retrying eight times.
        if (status === 409 || graphCode === 'nameAlreadyExists') {
            logger.warn('Rename rejected, name already exists', {
                service: 'file-renamer',
                driveItemId,
                newName
            });
            return {
                renamed: false,
                dryRun: false,
                collision: true,
                newName,
                error: `A file named "${newName}" already exists in the folder`
            };
        }

        // 403 almost certainly means the app registration lacks write on the
        // drive. Say so explicitly — it is the single most likely deployment
        // failure for this feature and a generic message would waste hours.
        if (status === 403) {
            throw new Error(
                `Rename forbidden (403) for driveItem ${driveItemId}. `
                + 'The Azure AD app registration likely lacks write permission on the drive '
                + '(Sites.ReadWrite.All or Files.ReadWrite.All, application, admin-consented).'
            );
        }

        throw error;
    }
}

module.exports = {
    checkCollision,
    renameFile
};
