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

    const processor = descriptor.factory(context);
    const queueName = extractQueueName(clientState);
    const clientStateTokens = parseClientState(clientState);

    let accessToken = null;
    if (clientStateTokens.some(token => token.includes('document') || token.includes('costco'))) {
        // Lazily fetch access token for processors that may require document operations
        accessToken = await getAccessToken(context);
    }

    try {
        const processorResult = await processor.process({
            item: itemDetails,
            previousItem: null,
            queueName,
            accessToken
        });

        return {
            ...processorResult,
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

    const match = clientState.match(/uipath:([^;]+)/i);
    return match ? match[1] : null;
}

module.exports = {
    processNotification
};
