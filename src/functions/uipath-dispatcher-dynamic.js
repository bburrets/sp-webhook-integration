/**
 * Dynamic UiPath Dispatcher
 * A flexible dispatcher that can route SharePoint notifications originating
 * from either classic lists or document libraries into UiPath Orchestrator
 * queues. Processors are resolved at runtime via the UiPath processor registry
 * so new business rules can be plugged in without modifying this function.
 */

const { app } = require('@azure/functions');
const { wrapHandler, validationError } = require('../shared/error-handler');
const { validateWebhookNotification } = require('../shared/validators');
const { createLogger } = require('../shared/logger');
const { getAccessToken } = require('../shared/auth');
const { resolveProcessor, parseClientState } = require('../shared/uipath-processor-registry');
const { getEnvironmentConfig } = require('../shared/uipath-environment-config');
const { createDeduplicator } = require('../shared/processing-deduplicator');
const {
    shouldProcessForUiPath,
    fetchSharePointItem
} = require('./uipath-dispatcher');
const {
    HTTP_STATUS,
    HTTP_HEADERS,
    SUCCESS_MESSAGES,
    SERVICE_NAMES
} = require('../shared/constants');

// Dynamic UiPath Dispatcher Function
app.http('uipath-dispatcher-dynamic', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: wrapHandler(async (request, context) => {
        const logger = createLogger(context);
        const start = Date.now();

        if (request.method !== 'POST') {
            throw validationError('Only POST requests are supported', { method: request.method });
        }

        const body = await request.text();
        let payload;
        try {
            payload = JSON.parse(body);
        } catch (error) {
            throw validationError('Invalid JSON in request body', { error: error.message });
        }

        const validated = validateWebhookNotification(payload);
        const results = [];

        for (const notification of validated.value) {
            const result = await processNotification(notification, context, logger);
            results.push(result);
        }

        logger.logResponse(HTTP_STATUS.OK, Date.now() - start, {
            notificationCount: validated.value.length,
            processedCount: results.filter(r => r.processed).length,
            service: SERVICE_NAMES.UIPATH_DISPATCHER
        });

        return {
            status: HTTP_STATUS.OK,
            headers: { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_HEADERS.CONTENT_TYPE_JSON },
            body: JSON.stringify({
                message: SUCCESS_MESSAGES.UIPATH_DISPATCH_COMPLETED,
                totalNotifications: validated.value.length,
                processedCount: results.filter(r => r.processed).length,
                results
            })
        };
    })
});

async function processNotification(notification, context, logger) {
    const { subscriptionId, resource, clientState } = notification;

    logger.logWebhook('processing-dynamic-uipath', subscriptionId, {
        resource,
        clientState,
        service: 'uipath-dispatcher-dynamic'
    });

    if (!shouldProcessForUiPath(clientState)) {
        return {
            processed: false,
            reason: 'UiPath processing not requested',
            subscriptionId
        };
    }

    const itemDetails = await fetchSharePointItem(resource, notification.resourceData, context);
    if (!itemDetails) {
        return {
            processed: false,
            reason: 'Unable to resolve SharePoint item',
            subscriptionId
        };
    }

    const descriptor = resolveProcessor({ clientState, resource, item: itemDetails });
    if (!descriptor) {
        logger.warn('No processor resolved for notification', {
            subscriptionId,
            resource,
            clientState
        });
        return {
            processed: false,
            reason: 'No matching UiPath processor registered',
            subscriptionId
        };
    }

    // Extract environment configuration from clientState
    const envConfig = getEnvironmentConfig(clientState, context);
    logger.info('Using UiPath environment configuration', {
        tenantName: envConfig.tenantName,
        folder: envConfig.organizationUnitId,
        environment: envConfig.environment || 'DEFAULT'
    });

    const processor = descriptor.factory(context, envConfig);
    const queueName = extractQueueName(clientState);
    const clientStateTokens = parseClientState(clientState);

    let accessToken = null;
    if (clientStateTokens.some(token => token.includes('document') || token.includes('costco'))) {
        // Lazily fetch access token for processors that may require document operations
        accessToken = await getAccessToken(context);
    }

    try {
        // Check if we have multiple items to process (bulk upload scenario)
        const allItems = itemDetails._allRecentItems || [itemDetails];

        // Initialize deduplicator to filter out recently processed items
        const deduplicator = createDeduplicator(context, { dedupWindowMinutes: 30 });
        const { toProcess, skipped } = await deduplicator.filterDuplicates(resource, allItems);

        if (skipped.length > 0) {
            logger.info('Skipped duplicate items', {
                skippedCount: skipped.length,
                skippedIds: skipped.map(s => s.item.id),
                subscriptionId
            });
        }

        if (toProcess.length === 0) {
            logger.info('All items were duplicates, nothing to process', {
                totalItems: allItems.length,
                skippedCount: skipped.length,
                subscriptionId
            });
            return {
                processed: false,
                reason: 'All items were recently processed (deduplication)',
                skippedCount: skipped.length,
                subscriptionId
            };
        }

        const isBulkProcessing = toProcess.length > 1;

        if (isBulkProcessing) {
            logger.info('Processing multiple items from bulk operation', {
                count: toProcess.length,
                itemIds: toProcess.map(i => i.id),
                skippedCount: skipped.length,
                subscriptionId
            });
        } else {
            const firstItem = toProcess[0];
            logger.info('Processing single item', {
                itemId: firstItem.id,
                title: firstItem.Title || firstItem.FileLeafRef || firstItem.fields?.FileLeafRef,
                hasFields: !!firstItem.fields,
                skippedCount: skipped.length,
                subscriptionId
            });
        }

        // Process all non-duplicate items
        const results = [];
        for (const item of toProcess) {
            // Merge fields into item for easier access (if not already merged)
            if (item.fields && !item.Title && !item.FileLeafRef) {
                Object.assign(item, item.fields);
                logger.debug('Merged fields into item', { itemId: item.id });
            }

            logger.info('Calling processor for item', {
                itemId: item.id,
                processor: descriptor.name,
                queueName,
                hasTitle: !!(item.Title || item.FileLeafRef)
            });

            const processorResult = await processor.process({
                item,
                previousItem: null,
                queueName,
                accessToken
            });

            logger.info('Processor returned result', {
                itemId: item.id,
                processed: processorResult.processed,
                resultKeys: Object.keys(processorResult)
            });

            // Record successfully processed items to prevent duplicates
            if (processorResult.processed) {
                await deduplicator.recordProcessed(resource, item.id, {
                    reference: processorResult.queueSubmission?.reference,
                    queueName,
                    queueItemId: processorResult.queueSubmission?.queueItemId,
                    subscriptionId,
                    processor: descriptor.name,
                    fileName: item.Title || item.FileLeafRef
                });
            }

            results.push({
                itemId: item.id,
                title: item.Title || item.FileLeafRef,
                ...processorResult
            });
        }

        // For single item, return original format for backwards compatibility
        if (!isBulkProcessing) {
            logger.info('Returning single item result', {
                processed: results[0].processed,
                subscriptionId
            });
            return {
                ...results[0],
                subscriptionId,
                processor: descriptor.name
            };
        }

        // For bulk processing, return summary
        logger.info('Returning bulk processing summary', {
            totalItems: results.length,
            processedCount: results.filter(r => r.processed).length,
            subscriptionId
        });

        return {
            processed: results.every(r => r.processed),
            itemsProcessed: results.length,
            results,
            subscriptionId,
            processor: descriptor.name
        };
    } catch (error) {
        logger.error('Dynamic UiPath processor failed', {
            subscriptionId,
            processor: descriptor.name,
            error: error.message
        });
        return {
            processed: false,
            subscriptionId,
            processor: descriptor.name,
            error: error.message
        };
    }
}

function extractQueueName(clientState) {
    if (!clientState) {
        return null;
    }

    // Try new format first: queue:QueueName or q:QueueName
    let match = clientState.match(/(?:queue|q):([^|;]+)/i);
    if (match) {
        return match[1];
    }

    // Fall back to legacy format: uipath:QueueName
    match = clientState.match(/uipath:([^;]+)/i);
    return match ? match[1] : null;
}

module.exports = {
    processNotification
};
