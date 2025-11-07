/**
 * UiPath Dispatcher Azure Function
 * Routes SharePoint webhook notifications to UiPath Orchestrator queues
 * Processes items based on status changes and business logic
 */

const { app } = require('@azure/functions');
const axios = require('axios');
const config = require('../shared/config');
const { getAccessToken } = require('../shared/auth');
const { wrapHandler, validationError, AppError } = require('../shared/error-handler');
const { validateWebhookNotification } = require('../shared/validators');
const { createLogger } = require('../shared/logger');
const { createUiPathQueueClient } = require('../shared/uipath-queue-client');
const { createCostcoProcessor } = require('../templates/costco-inline-routing');
const EnhancedForwarder = require('../shared/enhanced-forwarder');
const {
    HTTP_STATUS,
    HTTP_HEADERS,
    CLIENT_STATE_PATTERNS,
    WEBHOOK_CHANGE_TYPES,
    SERVICE_NAMES,
    SUCCESS_MESSAGES
} = require('../shared/constants');

// UiPath Dispatcher Function
app.http('uipath-dispatcher', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: wrapHandler(async (request, context) => {
        const logger = createLogger(context);
        const startTime = Date.now();
        
        logger.logRequest(request.method, request.url, {
            headers: Object.fromEntries(request.headers.entries()),
            service: SERVICE_NAMES.UIPATH_DISPATCHER
        });

        // Only handle POST requests
        if (request.method !== 'POST') {
            throw validationError('Only POST requests are supported', { method: request.method });
        }

        // Parse request body
        const requestBody = await request.text();
        logger.debug('Received UiPath dispatcher request', {
            bodyLength: requestBody.length,
            preview: requestBody.substring(0, 200),
            service: 'uipath-dispatcher'
        });
        
        let notifications;
        try {
            notifications = JSON.parse(requestBody);
        } catch (parseError) {
            throw validationError('Invalid JSON in request body', { parseError: parseError.message });
        }

        // Validate the notification payload
        const validatedData = validateWebhookNotification(notifications);

        // Process each validated notification
        logger.info('Processing webhook notifications for UiPath dispatch', {
            count: validatedData.value.length,
            service: 'uipath-dispatcher'
        });
        
        const results = [];
        
        for (const notification of validatedData.value) {
            try {
                const result = await processUiPathNotification(notification, context);
                results.push(result);
            } catch (error) {
                logger.error('Failed to process individual notification', {
                    notification: notification,
                    error: error.message,
                    service: 'uipath-dispatcher'
                });
                results.push({
                    processed: false,
                    error: error.message,
                    notification: notification
                });
            }
        }
        
        const duration = Date.now() - startTime;
        const processedCount = results.filter(r => r.processed).length;
        
        logger.logResponse(200, duration, {
            notificationCount: validatedData.value.length,
            processedCount,
            service: 'uipath-dispatcher'
        });
        
        return {
            status: HTTP_STATUS.OK,
            headers: {
                [HTTP_HEADERS.CONTENT_TYPE]: HTTP_HEADERS.CONTENT_TYPE_JSON
            },
            body: JSON.stringify({
                message: SUCCESS_MESSAGES.UIPATH_DISPATCH_COMPLETED,
                totalNotifications: validatedData.value.length,
                processedCount,
                results: results
            })
        };
    })
});

/**
 * Process individual webhook notification for UiPath dispatch
 * @param {Object} notification - Webhook notification
 * @param {Object} context - Azure Functions context
 * @returns {Promise<Object>} Processing result
 */
async function processUiPathNotification(notification, context) {
    const logger = createLogger(context);
    
    try {
        logger.logWebhook('processing-uipath', notification.subscriptionId, {
            resource: notification.resource,
            changeType: notification.changeType,
            clientState: notification.clientState,
            service: 'uipath-dispatcher'
        });

        // Extract information from the notification
        const subscriptionId = notification.subscriptionId;
        const resource = notification.resource;
        const changeType = notification.changeType;
        const resourceData = notification.resourceData;
        const clientState = notification.clientState;
        
        // Check if this notification should be processed by UiPath
        if (!shouldProcessForUiPath(clientState)) {
            logger.debug('Notification does not require UiPath processing', {
                clientState,
                subscriptionId,
                service: 'uipath-dispatcher'
            });
            return {
                processed: false,
                reason: 'Not configured for UiPath processing',
                subscriptionId
            };
        }

        // Only process created and updated items
        if (![WEBHOOK_CHANGE_TYPES.CREATED, WEBHOOK_CHANGE_TYPES.UPDATED].includes(changeType)) {
            logger.debug('Skipping notification - unsupported change type for UiPath', {
                changeType,
                subscriptionId,
                service: 'uipath-dispatcher'
            });
            return {
                processed: false,
                reason: `Unsupported change type: ${changeType}`,
                subscriptionId
            };
        }

        // Get SharePoint item details
        const itemDetails = await fetchSharePointItem(resource, resourceData, context);
        
        if (!itemDetails) {
            logger.warn('Could not fetch SharePoint item details', {
                resource,
                resourceData,
                subscriptionId,
                service: 'uipath-dispatcher'
            });
            return {
                processed: false,
                reason: 'Could not fetch SharePoint item details',
                subscriptionId
            };
        }

        // Determine processor based on clientState or list identification
        const processorType = determineProcessor(clientState, itemDetails, resource);
        
        if (!processorType) {
            logger.debug('No processor determined for item', {
                resource,
                itemId: itemDetails.ID,
                service: 'uipath-dispatcher'
            });
            return {
                processed: false,
                reason: 'No processor determined for item',
                subscriptionId
            };
        }

        // Extract queue name from client state if specified
        let queueName = null;
        if (clientState && clientState.includes('uipath:')) {
            const queueMatch = clientState.match(/uipath:([^;]+)/);
            if (queueMatch) {
                queueName = queueMatch[1];
            }
        }
        
        // Process item based on processor type
        const processingResult = await processItemByType(processorType, itemDetails, queueName, context);
        
        logger.logWebhook('processed-uipath', notification.subscriptionId, {
            resource: notification.resource,
            changeType: notification.changeType,
            processorType,
            processed: processingResult.processed,
            service: 'uipath-dispatcher'
        });

        return {
            ...processingResult,
            subscriptionId,
            processorType
        };

    } catch (error) {
        logger.error('Error processing UiPath notification', {
            error: error.message,
            stack: error.stack,
            notification: notification,
            service: 'uipath-dispatcher'
        });
        
        return {
            processed: false,
            error: error.message,
            subscriptionId: notification.subscriptionId
        };
    }
}

/**
 * Check if notification should be processed for UiPath
 * @param {string} clientState - Notification client state
 * @returns {boolean} True if should process for UiPath
 */
function shouldProcessForUiPath(clientState) {
    if (!clientState) {
        return false;
    }

    // Check for UiPath processor indicator in clientState
    // Format examples:
    // - "processor:uipath"
    // - "forward:url;processor:uipath"
    // - "uipath:enabled"
    // - "uipath:TEST_API" (queue name)
    // - "uipath:TEST_API;costco:routing"
    
    const lowercaseState = clientState.toLowerCase();
    return lowercaseState.includes('processor:uipath') || 
           lowercaseState.includes('uipath:enabled') ||
           lowercaseState.includes('uipath=true') ||
           lowercaseState.includes('uipath:'); // Matches any UiPath queue specification
}

/**
 * Fetch SharePoint item details using Graph API
 * @param {string} resource - Resource path from notification
 * @param {Object} resourceData - Resource data from notification (contains item ID)
 * @param {Object} context - Azure Functions context
 * @returns {Promise<Object|null>} SharePoint item or null if not found
 */
async function fetchSharePointItem(resource, resourceData, context) {
    const logger = createLogger(context);
    
    try {
        // Get access token
        const accessToken = await getAccessToken(context);
        
        // Parse the resource path to get site and list IDs
        // Format can be either:
        // - sites/{site-id}/lists/{list-id}/items/{item-id}
        // - sites/domain:/sites/path:/lists/{list-id}
        
        let siteId, listId, itemId;
        
        // First try the standard format with item ID
        const standardMatch = resource.match(/sites\/([^\/]+)\/lists\/([^\/]+)\/items\/([^\/]+)/);
        if (standardMatch) {
            [, siteId, listId, itemId] = standardMatch;
        } else {
            // Try the SharePoint webhook format
            // Format: sites/domain.sharepoint.com:/sites/sitename:/lists/{list-id}
            // Use greedy match to capture full site path including nested /sites/
            const webhookMatch = resource.match(/^sites\/(.+)\/lists\/([^\/]+)/);
            if (webhookMatch) {
                [, siteId, listId] = webhookMatch;
                // Get item ID from resourceData
                itemId = resourceData?.id;
                
                if (!itemId) {
                    logger.info('No item ID in notification, fetching recent changes', {
                        resource,
                        service: 'uipath-dispatcher'
                    });
                    
                    // Use EnhancedForwarder to get the most recently modified item
                    const forwarder = new EnhancedForwarder(context, accessToken);
                    const recentItem = await forwarder.getItemData(resource, null);
                    
                    if (recentItem && recentItem.id) {
                        logger.info('Found recently modified item', {
                            itemId: recentItem.id,
                            title: recentItem.fields?.Title,
                            modified: recentItem.lastModifiedDateTime,
                            service: 'uipath-dispatcher'
                        });
                        
                        // Merge fields into the main item object for easier access
                        if (recentItem.fields) {
                            Object.assign(recentItem, recentItem.fields);
                        }
                        
                        return recentItem;
                    } else {
                        logger.warn('Could not find recently modified item', {
                            resource,
                            service: 'uipath-dispatcher'
                        });
                        return null;
                    }
                }
            } else {
                logger.warn('Could not parse resource path', {
                    resource,
                    service: 'uipath-dispatcher'
                });
                return null;
            }
        }
        
        // Clean up the siteId if it contains colons (SharePoint site path format)
        if (siteId.includes(':')) {
            // Keep the format as-is for Graph API
            siteId = siteId.replace(/\/$/, ''); // Remove trailing slash if present
        }
        
        // Construct Graph API URL to get item with all fields
        const itemUrl = `${config.api.graph.baseUrl}/sites/${siteId}/lists/${listId}/items/${itemId}?$expand=fields`;
        
        logger.debug('Fetching SharePoint item details', {
            siteId,
            listId,
            itemId,
            url: itemUrl,
            service: 'uipath-dispatcher'
        });

        const response = await axios.get(itemUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            },
            timeout: config.webhook.notificationTimeout
        });

        const item = response.data;
        
        // Merge fields into the main item object for easier access
        if (item.fields) {
            Object.assign(item, item.fields);
        }

        logger.info('Successfully fetched SharePoint item', {
            itemId: item.ID,
            title: item.Title,
            status: item.Status,
            listId,
            service: 'uipath-dispatcher'
        });

        return item;

    } catch (error) {
        logger.error('Failed to fetch SharePoint item', {
            resource,
            error: error.message,
            status: error.response?.status,
            service: 'uipath-dispatcher'
        });
        
        return null;
    }
}

/**
 * Determine which processor to use for the item
 * @param {string} clientState - Client state from notification
 * @param {Object} itemDetails - SharePoint item details
 * @param {string} resource - Resource path
 * @returns {string|null} Processor type or null
 */
function determineProcessor(clientState, itemDetails, resource) {
    // Check clientState for explicit processor hints
    if (clientState) {
        const lowercaseState = clientState.toLowerCase();
        
        // Check for COSTCO routing indicator
        if (lowercaseState.includes('costco:routing') || 
            lowercaseState.includes('costco')) {
            return 'costco';
        }
        
        // Check for specific processor types
        if (lowercaseState.includes('processor:costco')) {
            return 'costco';
        }
    }
    
    // For COSTCO items, check if it matches the COSTCO template
    const costcoProcessor = createCostcoProcessor();
    
    // Extract list name from resource or item data
    const listName = extractListName(resource, itemDetails);
    
    if (listName && costcoProcessor.appliesToList(listName)) {
        return 'costco';
    }
    
    // Check if resource path contains COSTCO-related identifiers
    if (resource && resource.toLowerCase().includes('costco')) {
        return 'costco';
    }

    // Could add other processor types here based on clientState or other criteria
    
    return null;
}

/**
 * Extract list name from resource path or item data
 * @param {string} resource - Resource path
 * @param {Object} itemDetails - SharePoint item details
 * @returns {string|null} List name or null
 */
function extractListName(resource, itemDetails) {
    // Try to get list name from item metadata
    if (itemDetails && itemDetails['@odata.context']) {
        const contextMatch = itemDetails['@odata.context'].match(/lists\('([^']+)'\)/);
        if (contextMatch) {
            return decodeURIComponent(contextMatch[1]);
        }
    }

    // Could also try to extract from resource path if needed
    // This would require additional API calls to get list information
    
    return null;
}

/**
 * Process item based on processor type
 * @param {string} processorType - Type of processor to use
 * @param {Object} itemDetails - SharePoint item details
 * @param {string} queueName - UiPath queue name (optional)
 * @param {Object} context - Azure Functions context
 * @returns {Promise<Object>} Processing result
 */
async function processItemByType(processorType, itemDetails, queueName, context) {
    const logger = createLogger(context);
    
    try {
        switch (processorType) {
            case 'costco':
                return await processCostcoItem(itemDetails, queueName, context);
            
            default:
                logger.warn('Unknown processor type', {
                    processorType,
                    itemId: itemDetails.ID,
                    service: 'uipath-dispatcher'
                });
                return {
                    processed: false,
                    reason: `Unknown processor type: ${processorType}`
                };
        }
    } catch (error) {
        logger.error('Error in processor', {
            processorType,
            itemId: itemDetails.ID,
            error: error.message,
            service: 'uipath-dispatcher'
        });
        
        return {
            processed: false,
            error: error.message,
            processorType
        };
    }
}

/**
 * Process COSTCO item using the COSTCO template
 * @param {Object} itemDetails - SharePoint item details
 * @param {string} queueName - UiPath queue name (optional, defaults to COSTCO template default)
 * @param {Object} context - Azure Functions context
 * @returns {Promise<Object>} Processing result
 */
async function processCostcoItem(itemDetails, queueName, context) {
    const logger = createLogger(context);
    
    try {
        // Create COSTCO processor
        const costcoProcessor = createCostcoProcessor(context);
        
        // Check if item should be processed (status = "Send Generated Form")
        if (!costcoProcessor.shouldProcessItem(itemDetails)) {
            logger.debug('COSTCO item does not meet processing criteria', {
                itemId: itemDetails.ID,
                status: itemDetails.Status,
                service: 'uipath-dispatcher'
            });
            return {
                processed: false,
                reason: 'Item does not meet COSTCO processing criteria',
                itemId: itemDetails.ID,
                status: itemDetails.Status
            };
        }

        logger.info('Processing COSTCO item for UiPath', {
            itemId: itemDetails.ID,
            status: itemDetails.Status,
            poNumber: itemDetails['PO_x005f_no'],
            service: 'uipath-dispatcher'
        });

        // Process the item using COSTCO template with optional queue name override
        const result = await costcoProcessor.processItem(itemDetails, null, queueName);
        
        if (result.processed) {
            logger.info('Successfully processed COSTCO item', {
                itemId: itemDetails.ID,
                queueItemId: result.queueSubmission?.queueItemId,
                poNumber: result.poNumber,
                service: 'uipath-dispatcher'
            });
        } else {
            logger.warn('COSTCO item processing failed', {
                itemId: itemDetails.ID,
                reason: result.reason || result.error,
                service: 'uipath-dispatcher'
            });
        }

        return result;

    } catch (error) {
        logger.error('Error processing COSTCO item', {
            itemId: itemDetails.ID,
            error: error.message,
            service: 'uipath-dispatcher'
        });
        
        return {
            processed: false,
            error: error.message,
            itemId: itemDetails.ID
        };
    }
}

/**
 * Create a test notification for UiPath dispatcher (development/testing only)
 * @param {Object} context - Azure Functions context
 * @param {Object} testData - Test notification data
 * @returns {Promise<Object>} Test result
 */
async function createTestNotification(context, testData = {}) {
    const logger = createLogger(context);
    
    const defaultTestNotification = {
        subscriptionId: testData.subscriptionId || 'test-subscription-123',
        clientState: testData.clientState || 'processor:uipath',
        changeType: testData.changeType || 'updated',
        resource: testData.resource || '/sites/test-site/lists/test-list/items/1',
        resourceData: {
            id: testData.itemId || '1',
            webId: 'test-web-id',
            listId: 'test-list-id'
        }
    };

    logger.info('Creating test UiPath notification', {
        testNotification: defaultTestNotification,
        service: 'uipath-dispatcher'
    });

    return await processUiPathNotification(defaultTestNotification, context);
}

module.exports = {
    processUiPathNotification,
    shouldProcessForUiPath,
    fetchSharePointItem,
    determineProcessor,
    processItemByType,
    processCostcoItem,
    createTestNotification
};