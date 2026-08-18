/**
 * Notification Worker
 * Processes SharePoint webhook notifications off the HTTP request path.
 *
 * webhook-handler enqueues one message per notification and returns 202 so that
 * Microsoft Graph always receives a fast 2xx. All Graph fetches, deduplication,
 * and UiPath submissions happen here, where nothing is waiting on the result.
 *
 * Failures are rethrown so the storage queue retries the message; after
 * maxDequeueCount attempts it lands in webhook-notifications-poison.
 */

const { app } = require('@azure/functions');
const { createLogger } = require('../shared/logger');
const {
    processNotification,
    enrichNotificationsWithClientState
} = require('./webhook-handler');

/**
 * Handle a single queued notification.
 * @param {string|Object} message - Queue message (JSON string or parsed object)
 * @param {Object} context - Azure Functions context
 * @returns {Promise<void>}
 */
async function handleQueueMessage(message, context) {
    const logger = createLogger(context);
    const notification = typeof message === 'string' ? JSON.parse(message) : message;

    logger.info('Processing queued notification', {
        subscriptionId: notification.subscriptionId,
        resource: notification.resource,
        receivedAt: notification.receivedAt,
        dequeueCount: context.triggerMetadata?.dequeueCount
    });

    // clientState is not returned by Graph, so it is looked up here rather than
    // on the request path where the extra Graph call would cost response time.
    const [enriched] = await enrichNotificationsWithClientState([notification], context);

    await processNotification(enriched, context);

    logger.info('Queued notification processed', {
        subscriptionId: notification.subscriptionId
    });
}

app.storageQueue('notification-worker', {
    queueName: 'webhook-notifications',
    connection: 'AzureWebJobsStorage',
    handler: handleQueueMessage
});

module.exports = {
    handleQueueMessage
};
