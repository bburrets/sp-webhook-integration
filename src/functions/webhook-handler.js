const { app } = require('@azure/functions');
const axios = require('axios');
const EnhancedForwarder = require('../shared/enhanced-forwarder');
const config = require('../shared/config');
const { getAccessToken } = require('../shared/auth');
const { wrapHandler, validationError } = require('../shared/error-handler');
const { validateWebhookNotification } = require('../shared/validators');
const { createLogger } = require('../shared/logger');


// Webhook endpoint to handle Microsoft Graph notifications
app.http('webhook-handler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: wrapHandler(async (request, context) => {
        const logger = createLogger(context);
        const startTime = Date.now();
        
        logger.logRequest(request.method, request.url, {
            queryParams: Object.fromEntries(request.query.entries()),
            headers: Object.fromEntries(request.headers.entries())
        });

        // Check for validation token in query string (works for both GET and POST)
        const validationToken = request.query.get('validationToken');
        
        if (validationToken) {
            logger.info('Webhook validation request received', {
                validationToken,
                method: request.method
            });
            
            // Microsoft Graph requires exact 200 status and plain text response
            return {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain',
                    'Cache-Control': 'no-cache'
                },
                body: validationToken
            };
        }

        if (request.method === 'GET') {
            throw validationError('Missing validation token');
        }

        if (request.method === 'POST') {
            // Handle webhook notifications
            const requestBody = await request.text();
            logger.debug('Received webhook notification', {
                bodyLength: requestBody.length,
                preview: requestBody.substring(0, 200)
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
            logger.info('Processing webhook notifications', {
                count: validatedData.value.length
            });
            
            for (const notification of validatedData.value) {
                await processNotification(notification, context);
            }
            
            const duration = Date.now() - startTime;
            logger.logResponse(200, duration, {
                notificationCount: validatedData.value.length
            });
            
            return {
                status: 200,
                body: 'Notifications processed successfully'
            };
        }

        throw validationError('Method not allowed', { method: request.method });
    })
});

// Track recent notifications to prevent loops
const recentNotifications = new Map();
const LOOP_PREVENTION_WINDOW = config.webhook.loopPreventionWindow;

async function processNotification(notification, context) {
    try {
        // Create notification key for loop detection
        const notificationKey = `${notification.subscriptionId}-${notification.resource}`;
        const now = Date.now();
        
        // Check if we've seen this notification recently
        const lastSeen = recentNotifications.get(notificationKey);
        if (lastSeen && (now - lastSeen) < LOOP_PREVENTION_WINDOW) {
            const logger = createLogger(context);
            logger.warn('Duplicate notification detected, skipping to prevent loop', {
                notificationKey,
                timeSinceLastSeen: now - lastSeen
            });
            return;
        }
        
        // Record this notification
        recentNotifications.set(notificationKey, now);
        
        // Clean up old entries
        for (const [key, timestamp] of recentNotifications.entries()) {
            if (now - timestamp > LOOP_PREVENTION_WINDOW * 2) {
                recentNotifications.delete(key);
            }
        }
        
        const logger = createLogger(context);
        logger.logWebhook('processing', notification.subscriptionId, {
            resource: notification.resource,
            changeType: notification.changeType,
            clientState: notification.clientState
        });

        // Extract information from the notification
        const subscriptionId = notification.subscriptionId;
        const resource = notification.resource;
        const changeType = notification.changeType;
        const resourceData = notification.resourceData;
        const clientState = notification.clientState;
        
        // Skip processing if this is our own webhook handler being notified
        if (config.features.skipSelfNotifications && 
            notification.notificationUrl && 
            notification.notificationUrl.includes('webhook-handler')) {
            logger.info('Skipping self-notification to prevent loops', {
                notificationUrl: notification.notificationUrl
            });
            return;
        }

        // Log the change details
        logger.logSharePoint('change-detected', resource, {
            changeType: changeType,
            resourceId: resourceData?.id,
            webId: resourceData?.webId,
            listId: resourceData?.listId
        });

        // Check if this notification should be forwarded
        if (clientState && clientState.startsWith('forward:')) {
            try {
                // Get access token for enhanced forwarding
                const accessToken = await getAccessToken(context);
                
                // Create enhanced forwarder
                const forwarder = new EnhancedForwarder(context, accessToken);
                
                // Parse enhanced clientState
                const config = forwarder.parseClientState(clientState);
                
                if (config && config.forwardUrl) {
                    logger.info('Enhanced forwarding notification', {
                        forwardUrl: config.forwardUrl,
                        mode: config.mode
                    });
                    
                    // Forward with enhanced data
                    const result = await forwarder.forward(notification, config.forwardUrl, config);
                    
                    if (result.success) {
                        logger.info('Successfully forwarded notification', {
                            mode: config.mode,
                            forwardUrl: config.forwardUrl
                        });
                        // Update forwarding statistics in background
                        updateForwardingStats(subscriptionId, context).catch(err => 
                            logger.error('Background forwarding stats update failed', { error: err.message })
                        );
                    } else {
                        logger.error('Enhanced forwarding failed', { error: result.error });
                    }
                } else {
                    // Fallback to simple forwarding
                    const options = parseClientState(clientState);
                    const forwardingUrl = options.forwardUrl;
                    logger.info('Simple forwarding notification', {
                        forwardUrl: forwardingUrl
                    });
                    
                    const enrichedPayload = {
                        timestamp: new Date().toISOString(),
                        source: 'SharePoint-Webhook-Proxy',
                        notification: notification,
                        metadata: {
                            processedBy: process.env.WEBSITE_HOSTNAME || 'webhook-handler',
                            environment: process.env.AZURE_FUNCTIONS_ENVIRONMENT || 'production'
                        }
                    };
                    
                    await forwardNotification(enrichedPayload, forwardingUrl, context);
                    updateForwardingStats(subscriptionId, context).catch(err => 
                        logger.error('Background forwarding stats update failed', { error: err.message })
                    );
                }
            } catch (forwardError) {
                logger.error('Failed to forward notification', {
                    error: forwardError.message,
                    subscriptionId
                });
                // Continue processing even if forwarding fails
            }
        }

        // Update notification count in SharePoint list
        try {
            // Run in background - don't await
            updateNotificationCount(subscriptionId, context).catch(err => 
                logger.error('Background notification count update failed', { error: err.message })
            );
        } catch (updateError) {
            logger.error('Failed to start notification count update', {
                error: updateError.message,
                subscriptionId
            });
        }

        // Here you can add your business logic to handle the changes
        // For example:
        // - Send notifications
        // - Trigger workflows
        // - Update databases
        // - Call other APIs

        logger.logWebhook('processed', notification.subscriptionId, {
            resource: notification.resource,
            changeType: notification.changeType
        });

    } catch (error) {
        const logger = createLogger(context);
        logger.error('Error processing individual notification', {
            error: error.message,
            stack: error.stack,
            notification: notification
        });
        throw error;
    }
}

async function updateForwardingStats(subscriptionId, context) {
    try {
        // Get configuration
        const listId = config.sharepoint.lists.webhookManagement;
        const sitePath = config.sharepoint.primarySite.sitePath;
        
        // Get access token
        const accessToken = await getAccessToken(context);
        
        // Get all items from SharePoint list
        const searchUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
        const searchResponse = await axios.get(searchUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
        
        // Find the matching item
        const matchingItem = searchResponse.data.value?.find(item => 
            item.fields && item.fields.SubscriptionId === subscriptionId
        );
        
        if (matchingItem) {
            const updateUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items/${matchingItem.id}`;
            
            // Update LastForwardedDateTime
            await axios.patch(updateUrl, {
                fields: {
                    LastForwardedDateTime: new Date().toISOString()
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            const logger = createLogger(context);
            logger.info('Updated forwarding stats', {
                subscriptionId,
                lastForwardedDateTime: new Date().toISOString()
            });
        }
    } catch (error) {
        const logger = createLogger(context);
        logger.error('Error updating forwarding stats', {
            error: error.message,
            subscriptionId
        });
        // Don't throw - just log the error so notification processing can continue
    }
}

async function updateNotificationCount(subscriptionId, context) {
    try {
        // Get configuration
        const listId = config.sharepoint.lists.webhookManagement;
        const sitePath = config.sharepoint.primarySite.sitePath;
        
        // Get access token
        const accessToken = await getAccessToken(context);
        
        // Find the item in SharePoint list using Graph API
        // Note: Can't filter by SubscriptionId as it's not indexed, so we get all items and filter in memory
        const searchUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
        const searchResponse = await axios.get(searchUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
        
        // Log the search results for debugging
        const logger = createLogger(context);
        logger.debug('SharePoint list search results', {
            itemCount: searchResponse.data.value?.length || 0,
            listId
        });
        
        // Find the item with matching SubscriptionId
        const matchingItem = searchResponse.data.value?.find(item => 
            item.fields && item.fields.SubscriptionId === subscriptionId
        );
        
        if (matchingItem) {
            const item = matchingItem;
            
            // Check if webhook is marked as deleted
            if (item.fields.Status === 'Deleted') {
                logger.warn('Received notification from deleted webhook', {
                    subscriptionId,
                    status: item.fields.Status
                });
                return;
            }
            
            const itemId = item.id;
            const currentCount = item.fields.NotificationCount || 0;
            
            // Update the notification count using Graph API
            const updateUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items/${itemId}`;
            await axios.patch(updateUrl, {
                fields: {
                    NotificationCount: currentCount + 1
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            logger.info('Updated notification count', {
                subscriptionId,
                previousCount: currentCount,
                newCount: currentCount + 1
            });
        } else {
            logger.warn('Webhook not found in SharePoint list', {
                subscriptionId,
                suggestion: 'It may have been deleted'
            });
        }
    } catch (error) {
        const logger = createLogger(context);
        logger.error('Error updating notification count', {
            error: error.message,
            subscriptionId
        });
        // Don't throw - just log the error so notification processing can continue
    }
}

async function forwardNotification(notification, forwardingUrl, context) {
    try {
        // If notification is already enriched, use it as-is
        const payload = notification.source ? notification : {
            timestamp: new Date().toISOString(),
            source: 'SharePoint-Webhook-Proxy',
            notification: notification,
            metadata: {
                processedBy: config.functionApp.name,
                environment: config.functionApp.environment
            }
        };


        // Forward the notification
        const response = await axios.post(forwardingUrl, payload, {
            timeout: config.webhook.notificationTimeout,
            headers: {
                'Content-Type': 'application/json',
                'X-SharePoint-Webhook-Proxy': 'true',
                'X-Original-Subscription-Id': notification.subscriptionId || notification.notification?.subscriptionId
            }
        });

        const logger = createLogger(context);
        logger.info('Successfully forwarded notification', {
            url: forwardingUrl,
            status: response.status,
            subscriptionId: notification.subscriptionId || notification.notification?.subscriptionId
        });

        return response;
    } catch (error) {
        const logger = createLogger(context);
        logger.error('Error forwarding notification', {
            url: forwardingUrl,
            error: error.message,
            subscriptionId: notification.subscriptionId || notification.notification?.subscriptionId
        });
        throw error;
    }
}

// Parse clientState to extract options
function parseClientState(clientState) {
    const options = {
        forwardUrl: '',
        detectChanges: false,
        fields: []
    };
    
    // Parse format: "forward:url;detectChanges:true;fields:Title,Status"
    // Handle URLs with colons by splitting only on first occurrence
    const parts = clientState.split(';');
    
    for (const part of parts) {
        const colonIndex = part.indexOf(':');
        if (colonIndex === -1) continue;
        
        const key = part.substring(0, colonIndex);
        const value = part.substring(colonIndex + 1);
        
        if (key === 'forward') {
            options.forwardUrl = value;
        } else if (key === 'detectChanges') {
            options.detectChanges = value === 'true';
        } else if (key === 'fields') {
            options.fields = value.split(',').map(f => f.trim());
        }
    }
    
    return options;
}



