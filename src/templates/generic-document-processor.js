/**
 * Generic Document Processor
 * Provides a reusable template for SharePoint document libraries or
 * list items that should be forwarded to UiPath queues without bespoke
 * business logic. The processor extracts key metadata, flattens the
 * SharePoint fields, and submits a queue item using the dynamic queue
 * client.
 */

const { createLogger } = require('../shared/logger');
const { UIPATH_PRIORITY } = require('../shared/constants');
const { createDynamicUiPathQueueClient } = require('../shared/uipath-dynamic-queue-client');

// Generic Document Processor Template
class GenericDocumentProcessor {
    constructor(context = null, options = {}) {
        this.logger = createLogger(context);
        this.queueClient = createDynamicUiPathQueueClient(context);
        this.context = context;
        this.options = {
            defaultQueue: process.env.UIPATH_DEFAULT_QUEUE,
            referencePrefix: 'SPDOC',
            priority: UIPATH_PRIORITY.NORMAL,
            includeFields: options.includeFields || null,
            excludeFields: options.excludeFields || [],
            ...options
        };
    }

    /**
     * Determine if the item should be processed. For document libraries we
     * default to true, but consumers can configure file extension filters.
     */
    shouldProcessItem(item) {
        if (!item) {
            return false;
        }

        if (this.options.allowedExtensions && item.FileLeafRef) {
            const ext = item.FileLeafRef.split('.').pop().toLowerCase();
            return this.options.allowedExtensions.map(e => e.toLowerCase()).includes(ext);
        }

        return true;
    }

    buildReference(item) {
        const rawId = item.ID || item.id || 'NOID';
        const fileName = (item.FileLeafRef || item.Title || 'ITEM').replace(/[\s,]+/g, '_');
        return `${this.options.referencePrefix}_${fileName}_${rawId}_${Date.now()}`;
    }

    buildAdditionalContent(item) {
        const extra = {};
        if (item.FileRef) {
            extra.FilePath = item.FileRef;
        }
        if (item.FileDirRef) {
            extra.FileDirectory = item.FileDirRef;
        }
        if (item.FileLeafRef) {
            extra.FileName = item.FileLeafRef;
        }
        if (item.UniqueId) {
            extra.UniqueId = item.UniqueId;
        }
        if (item.ContentType) {
            extra.ContentType = item.ContentType;
        }
        if (item.Author && typeof item.Author === 'object') {
            extra.CreatedBy = item.Author.Email || item.Author.Title || JSON.stringify(item.Author);
        }
        if (item.Editor && typeof item.Editor === 'object') {
            extra.ModifiedBy = item.Editor.Email || item.Editor.Title || JSON.stringify(item.Editor);
        }
        extra.LastModified = item.LastModifiedDateTime || item.Modified || item.lastModifiedDateTime || null;
        extra.WebUrl = item.WebUrl || item.webUrl || null;
        return extra;
    }

    async processItem(item, previousItem = null, queueNameOverride = null) {
        if (!this.shouldProcessItem(item, previousItem)) {
            this.logger.debug('Generic document processor skipping item', {
                reason: 'did-not-meet-criteria',
                itemId: item?.ID || item?.id
            });
            return {
                processed: false,
                reason: 'Item did not meet processing criteria',
                itemId: item?.ID || item?.id
            };
        }

        const queueName = queueNameOverride || this.options.defaultQueue;
        if (!queueName) {
            throw new Error('UiPath queue name not configured for generic document processor');
        }

        const specificContent = this.queueClient.buildSpecificContentFromItem(item, {
            includeFields: this.options.includeFields,
            excludeFields: this.options.excludeFields
        });
        Object.assign(specificContent, this.buildAdditionalContent(item));

        const queueResult = await this.queueClient.enqueue({
            queueName,
            priority: this.options.priority,
            reference: this.buildReference(item),
            specificContent
        });

        return {
            processed: queueResult?.success !== false,
            queueSubmission: queueResult,
            itemId: item?.ID || item?.id,
            template: 'generic-document'
        };
    }
}

function createGenericDocumentProcessor(context, options) {
    return new GenericDocumentProcessor(context, options);
}

module.exports = {
    createGenericDocumentProcessor,
    GenericDocumentProcessor
};
