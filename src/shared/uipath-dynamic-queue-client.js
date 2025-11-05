/**
 * Dynamic UiPath Queue Client
 * Wraps the existing UiPath queue client with helper utilities that build
 * queue payloads from either SharePoint list items or document library items.
 */

const { createLogger } = require('./logger');
const { createUiPathQueueClient } = require('./uipath-queue-client');
const { UIPATH_PRIORITY } = require('./constants');

// Dynamic UiPath Queue Client
class DynamicUiPathQueueClient {
    constructor(context = null) {
        this.logger = createLogger(context);
        this.baseClient = createUiPathQueueClient(context);
    }

    /**
     * Normalise standard metadata from a SharePoint item or document.
     */
    normaliseBaseMetadata(item) {
        const metadata = {
            ItemId: item?.ID || item?.id || null,
            Title: item?.Title || item?.FileLeafRef || item?.name || null,
            WebUrl: item?.WebUrl || item?.webUrl || null,
            LastModified: item?.LastModifiedDateTime || item?.lastModifiedDateTime || item?.Modified || null,
            Created: item?.Created || item?.createdDateTime || null,
            ListItemUniqueId: item?.UniqueId || item?.listItemUniqueId || null
        };

        if (item?.FileLeafRef) {
            metadata.FileName = item.FileLeafRef;
        }
        if (item?.FileRef) {
            metadata.FilePath = item.FileRef;
        }
        if (item?.FileDirRef) {
            metadata.FileDirectory = item.FileDirRef;
        }
        if (item?.ContentType) {
            metadata.ContentType = item.ContentType;
        }
        if (item?.fields && item.fields.File_x0020_Type) {
            metadata.FileType = item.fields.File_x0020_Type;
        }

        return metadata;
    }

    /**
     * Build specific content from any SharePoint item. Allows optional include
     * and exclude lists for fine-grained control.
     */
    buildSpecificContentFromItem(item, options = {}) {
        const includeFields = options.includeFields || null;
        const excludeFields = new Set(options.excludeFields || []);

        const specificContent = { ...this.normaliseBaseMetadata(item) };

        const appendField = (key, value) => {
            if (value === undefined || value === null) {
                return;
            }
            if (excludeFields.has(key)) {
                return;
            }
            if (includeFields && !includeFields.includes(key)) {
                return;
            }
            specificContent[key] = value;
        };

        // Native fields merged in fetchSharePointItem
        if (item) {
            Object.keys(item).forEach(key => {
                if (key.startsWith('@')) {
                    return;
                }
                if (['fields', 'parentReference', 'fileSystemInfo'].includes(key)) {
                    return;
                }
                appendField(key, item[key]);
            });
        }

        if (item?.fields && typeof item.fields === 'object') {
            Object.entries(item.fields).forEach(([key, value]) => appendField(key, value));
        }

        if (item?.parentReference) {
            appendField('ParentPath', item.parentReference.path || null);
            appendField('ParentSite', item.parentReference.siteId || null);
        }

        if (item?.file) {
            appendField('FileHash', item.file.hashes?.sha1Hash || null);
            appendField('FileSizeBytes', item.size || null);
        }

        return specificContent;
    }

    async enqueue({ queueName, specificContent, reference, priority = UIPATH_PRIORITY.NORMAL }) {
        const payload = {
            priority,
            reference,
            specificContent
        };

        return this.baseClient.submitQueueItem(queueName, payload);
    }
}

function createDynamicUiPathQueueClient(context) {
    return new DynamicUiPathQueueClient(context);
}

module.exports = {
    DynamicUiPathQueueClient,
    createDynamicUiPathQueueClient
};
