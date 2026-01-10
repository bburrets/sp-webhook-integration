/**
 * Processing Deduplicator
 * Prevents duplicate processing of SharePoint items by tracking recently processed items
 * in Azure Table Storage. This allows for larger time windows when fetching recent items
 * without risking duplicate queue submissions.
 */

const { TableClient } = require('@azure/data-tables');
const { createLogger } = require('./logger');

const TABLE_NAME = 'ProcessedItems';
const DEFAULT_DEDUP_WINDOW_MINUTES = 30; // Don't re-process items within this window

class ProcessingDeduplicator {
    constructor(context = null, options = {}) {
        this.logger = createLogger(context);
        this.context = context;
        this.connectionString = options.connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
        this.dedupWindowMinutes = options.dedupWindowMinutes || DEFAULT_DEDUP_WINDOW_MINUTES;
        this.tableClient = null;
        this.initialized = false;
    }

    /**
     * Initialize the table client and ensure table exists
     */
    async initialize() {
        if (this.initialized) return;

        if (!this.connectionString) {
            this.logger.warn('No Azure Storage connection string configured, deduplication disabled', {
                service: 'deduplicator'
            });
            return;
        }

        try {
            this.tableClient = TableClient.fromConnectionString(this.connectionString, TABLE_NAME);
            await this.tableClient.createTable();
            this.initialized = true;
            this.logger.info('Processing deduplicator initialized', {
                service: 'deduplicator',
                table: TABLE_NAME,
                dedupWindowMinutes: this.dedupWindowMinutes
            });
        } catch (error) {
            // Table already exists is fine
            if (error.statusCode === 409) {
                this.initialized = true;
            } else {
                this.logger.error('Failed to initialize deduplicator', {
                    service: 'deduplicator',
                    error: error.message
                });
            }
        }
    }

    /**
     * Generate partition key from resource path
     * @param {string} resource - SharePoint resource path
     * @returns {string} Sanitized partition key
     */
    getPartitionKey(resource) {
        // Sanitize resource path for use as partition key
        // Azure Table Storage doesn't allow: / \ # ?
        return resource.replace(/[/\\#?:]/g, '_').substring(0, 100);
    }

    /**
     * Generate row key from item ID
     * @param {string} itemId - SharePoint item ID
     * @returns {string} Row key
     */
    getRowKey(itemId) {
        return `item_${itemId}`;
    }

    /**
     * Check if an item was recently processed
     * @param {string} resource - SharePoint resource path
     * @param {string} itemId - SharePoint item ID
     * @returns {Promise<{isDuplicate: boolean, lastProcessed: Date|null, reference: string|null}>}
     */
    async wasRecentlyProcessed(resource, itemId) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.tableClient) {
            // Deduplication disabled, always process
            return { isDuplicate: false, lastProcessed: null, reference: null };
        }

        const partitionKey = this.getPartitionKey(resource);
        const rowKey = this.getRowKey(itemId);

        try {
            const entity = await this.tableClient.getEntity(partitionKey, rowKey);
            const lastProcessed = new Date(entity.processedAt);
            const now = new Date();
            const minutesAgo = (now - lastProcessed) / (1000 * 60);

            if (minutesAgo < this.dedupWindowMinutes) {
                this.logger.info('Item was recently processed, skipping', {
                    service: 'deduplicator',
                    itemId,
                    lastProcessed: entity.processedAt,
                    minutesAgo: Math.round(minutesAgo),
                    dedupWindowMinutes: this.dedupWindowMinutes,
                    previousReference: entity.reference
                });
                return {
                    isDuplicate: true,
                    lastProcessed,
                    reference: entity.reference,
                    minutesAgo: Math.round(minutesAgo)
                };
            }

            // Item was processed but outside the dedup window
            this.logger.debug('Item was processed previously but outside dedup window', {
                service: 'deduplicator',
                itemId,
                lastProcessed: entity.processedAt,
                minutesAgo: Math.round(minutesAgo)
            });
            return { isDuplicate: false, lastProcessed, reference: entity.reference };

        } catch (error) {
            if (error.statusCode === 404) {
                // Item never processed before
                return { isDuplicate: false, lastProcessed: null, reference: null };
            }

            this.logger.error('Error checking deduplication status', {
                service: 'deduplicator',
                itemId,
                error: error.message
            });
            // On error, allow processing to avoid blocking
            return { isDuplicate: false, lastProcessed: null, reference: null };
        }
    }

    /**
     * Record that an item was processed
     * @param {string} resource - SharePoint resource path
     * @param {string} itemId - SharePoint item ID
     * @param {Object} metadata - Additional metadata to store
     * @returns {Promise<boolean>} True if recorded successfully
     */
    async recordProcessed(resource, itemId, metadata = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.tableClient) {
            return false;
        }

        const partitionKey = this.getPartitionKey(resource);
        const rowKey = this.getRowKey(itemId);

        try {
            const entity = {
                partitionKey,
                rowKey,
                itemId: String(itemId),
                resource,
                processedAt: new Date().toISOString(),
                reference: metadata.reference || null,
                queueName: metadata.queueName || null,
                queueItemId: metadata.queueItemId ? String(metadata.queueItemId) : null,
                subscriptionId: metadata.subscriptionId || null,
                processor: metadata.processor || null,
                fileName: metadata.fileName || null
            };

            await this.tableClient.upsertEntity(entity, 'Replace');

            this.logger.debug('Recorded item as processed', {
                service: 'deduplicator',
                itemId,
                reference: metadata.reference
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to record processed item', {
                service: 'deduplicator',
                itemId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Filter a list of items to only those not recently processed
     * @param {string} resource - SharePoint resource path
     * @param {Array} items - Array of SharePoint items
     * @returns {Promise<{toProcess: Array, skipped: Array}>}
     */
    async filterDuplicates(resource, items) {
        if (!items || items.length === 0) {
            return { toProcess: [], skipped: [] };
        }

        const toProcess = [];
        const skipped = [];

        for (const item of items) {
            const itemId = item.id || item.ID || item.fields?.id;
            if (!itemId) {
                // No ID, can't deduplicate - process it
                toProcess.push(item);
                continue;
            }

            const result = await this.wasRecentlyProcessed(resource, itemId);
            if (result.isDuplicate) {
                skipped.push({
                    item,
                    reason: 'recently_processed',
                    lastProcessed: result.lastProcessed,
                    previousReference: result.reference
                });
            } else {
                toProcess.push(item);
            }
        }

        if (skipped.length > 0) {
            this.logger.info('Filtered duplicate items', {
                service: 'deduplicator',
                totalItems: items.length,
                toProcess: toProcess.length,
                skipped: skipped.length,
                skippedIds: skipped.map(s => s.item.id || s.item.ID)
            });
        }

        return { toProcess, skipped };
    }

    /**
     * Clean up old entries from the table (call periodically)
     * @param {number} olderThanDays - Remove entries older than this many days
     * @returns {Promise<number>} Number of entries deleted
     */
    async cleanup(olderThanDays = 7) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.tableClient) {
            return 0;
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        const cutoffIso = cutoffDate.toISOString();

        let deletedCount = 0;

        try {
            // Query for old entries
            const entities = this.tableClient.listEntities({
                queryOptions: {
                    filter: `processedAt lt '${cutoffIso}'`
                }
            });

            for await (const entity of entities) {
                try {
                    await this.tableClient.deleteEntity(entity.partitionKey, entity.rowKey);
                    deletedCount++;
                } catch (error) {
                    // Ignore individual delete errors
                }
            }

            if (deletedCount > 0) {
                this.logger.info('Cleaned up old deduplication entries', {
                    service: 'deduplicator',
                    deletedCount,
                    olderThanDays
                });
            }

            return deletedCount;
        } catch (error) {
            this.logger.error('Failed to cleanup deduplication table', {
                service: 'deduplicator',
                error: error.message
            });
            return 0;
        }
    }
}

/**
 * Create a processing deduplicator instance
 * @param {Object} context - Azure Functions context
 * @param {Object} options - Configuration options
 * @returns {ProcessingDeduplicator}
 */
function createDeduplicator(context = null, options = {}) {
    return new ProcessingDeduplicator(context, options);
}

module.exports = {
    ProcessingDeduplicator,
    createDeduplicator,
    DEFAULT_DEDUP_WINDOW_MINUTES
};
