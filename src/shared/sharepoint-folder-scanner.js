/**
 * SharePoint Folder Scanner
 * Enumerates the files in ONE folder of a document library.
 *
 * Nothing else in this codebase scopes to a folder — webhook subscriptions are
 * validated as list-level only (validators.js), and EnhancedForwarder queries
 * whole libraries. This is the first folder-scoped read.
 *
 * It also follows @odata.nextLink to completion. EnhancedForwarder.getRecentItems
 * reads exactly one page and drops the rest, which makes its $top a silent
 * truncation ceiling; a folder sweep that silently skipped files past page one
 * would leave documents unrenamed with no signal at all.
 *
 * listItem is expanded alongside each driveItem because the rename happens on
 * the driveItem (PATCH name) while the status columns live on the listItem.
 * Fetching both in one pass avoids a per-file lookup later.
 */

const { createLogger } = require('./logger');
const { graphRequest } = require('./graph-request');
const config = require('./config');

const PAGE_SIZE = 200;

// A folder this large means something is wrong with the configured path (e.g.
// it points at the library root). Stop rather than issue hundreds of requests.
const MAX_ITEMS = 5000;

/**
 * Encode a folder path for Graph's path addressing, preserving separators.
 * @param {string} folderPath - e.g. "Shared Documents/Inbox"
 * @returns {string}
 */
function encodeFolderPath(folderPath) {
    return String(folderPath)
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

/**
 * Build the Graph URL for a folder's children.
 * @param {Object} params
 * @param {string} params.sitePath - e.g. "host.sharepoint.com:/sites/Name:"
 * @param {string} [params.folderPath] - Path under the drive root; omit for root
 * @param {string} [params.driveId] - Use a specific drive instead of the default
 * @returns {string}
 */
function buildChildrenUrl({ sitePath, folderPath, driveId }) {
    const base = driveId
        ? `${config.api.graph.baseUrl}/drives/${driveId}`
        : `${config.api.graph.baseUrl}/sites/${sitePath}/drive`;

    const encoded = folderPath ? encodeFolderPath(folderPath) : '';
    const root = encoded ? `root:/${encoded}:` : 'root';

    // $expand carries the listItem (and its fields) so status columns can be
    // read and written without a second request per file.
    return `${base}/${root}/children`
        + `?$top=${PAGE_SIZE}`
        + '&$expand=listItem($expand=fields)';
}

/**
 * Reduce a Graph driveItem to the shape the rename pipeline needs.
 * @param {Object} driveItem
 * @returns {Object}
 */
function normaliseFile(driveItem) {
    return {
        driveItemId: driveItem.id,
        driveId: driveItem.parentReference?.driveId || null,
        name: driveItem.name,
        size: driveItem.size || 0,
        sha1Hash: driveItem.file?.hashes?.sha1Hash || null,
        downloadUrl: driveItem['@microsoft.graph.downloadUrl'] || null,
        lastModifiedDateTime: driveItem.lastModifiedDateTime || null,
        webUrl: driveItem.webUrl || null,
        parentPath: driveItem.parentReference?.path || null,
        listItemId: driveItem.listItem?.id || null,
        fields: driveItem.listItem?.fields || {},
        // Kept so the extractor can use the pre-signed download URL directly.
        driveItem
    };
}

/**
 * List every file in a folder.
 *
 * Folders are excluded; only files are returned. Sub-folders are NOT walked —
 * the feature targets one folder, and recursing would silently widen the blast
 * radius of a rename sweep.
 *
 * @param {Object} params
 * @param {string} params.accessToken
 * @param {string} params.sitePath
 * @param {string} [params.folderPath]
 * @param {string} [params.driveId]
 * @param {Object} [params.context]
 * @returns {Promise<{files: Object[], folderCount: number, truncated: boolean}>}
 */
async function listFolderFiles({ accessToken, sitePath, folderPath, driveId, context }) {
    const logger = createLogger(context);
    const files = [];
    let folderCount = 0;
    let truncated = false;
    let pages = 0;

    let url = buildChildrenUrl({ sitePath, folderPath, driveId });

    while (url) {
        const response = await graphRequest({ url, accessToken, context });
        pages += 1;

        const children = response.data?.value || [];
        for (const child of children) {
            if (child.folder) {
                folderCount += 1;
                continue;
            }
            if (!child.file) {
                // Neither file nor folder (e.g. a OneNote package). Skip it.
                continue;
            }
            files.push(normaliseFile(child));
        }

        if (files.length >= MAX_ITEMS) {
            truncated = true;
            logger.error('Folder scan hit the item ceiling, stopping', {
                service: 'folder-scanner',
                folderPath: folderPath || '(root)',
                fileCount: files.length,
                maxItems: MAX_ITEMS
            });
            break;
        }

        url = response.data?.['@odata.nextLink'] || null;
    }

    logger.info('Folder scan complete', {
        service: 'folder-scanner',
        folderPath: folderPath || '(root)',
        fileCount: files.length,
        folderCount,
        pages,
        truncated
    });

    return { files, folderCount, truncated };
}

/**
 * Fetch one file by driveItem id, with its listItem fields.
 *
 * The worker calls this rather than trusting the sweep's snapshot: the
 * pre-signed download URL in a listing expires in roughly an hour and a queued
 * message can outlive it, and re-reading also reveals a file that was renamed,
 * changed, or deleted between the sweep and processing.
 *
 * @param {Object} params
 * @param {string} params.accessToken
 * @param {string} params.driveId
 * @param {string} params.driveItemId
 * @param {Object} [params.context]
 * @returns {Promise<Object|null>} Normalised file, or null if it no longer exists
 */
async function getFileById({ accessToken, driveId, driveItemId, context }) {
    const logger = createLogger(context);
    const url = `${config.api.graph.baseUrl}/drives/${driveId}/items/${driveItemId}`
        + '?$expand=listItem($expand=fields)';

    try {
        const response = await graphRequest({ url, accessToken, context });
        if (!response.data?.file) {
            return null;
        }
        return normaliseFile(response.data);
    } catch (error) {
        if (error.response?.status === 404) {
            logger.info('Drive item no longer exists', {
                service: 'folder-scanner',
                driveItemId
            });
            return null;
        }
        throw error;
    }
}

module.exports = {
    listFolderFiles,
    getFileById,
    buildChildrenUrl,
    encodeFolderPath,
    normaliseFile,
    PAGE_SIZE,
    MAX_ITEMS
};
