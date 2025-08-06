const { app } = require('@azure/functions');
const axios = require('axios');
const EnhancedForwarder = require('../shared/enhanced-forwarder');
const config = require('../shared/config');
const { getAccessToken } = require('../shared/auth');
const { wrapHandler, validationError } = require('../shared/error-handler');


// Webhook endpoint to handle Microsoft Graph notifications
app.http('webhook-handler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: wrapHandler(async (request, context) => {
        context.log('Webhook request received:', request.method);
        context.log('Query parameters:', request.query);
        context.log('Headers:', request.headers);

        // Check for validation token in query string (works for both GET and POST)
        const validationToken = request.query.get('validationToken');
        
        if (validationToken) {
            context.log('Validation token found:', validationToken);
            context.log('Request method for validation:', request.method);
            
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
            context.log('Webhook notification body:', requestBody);
            
            let notifications;
            try {
                notifications = JSON.parse(requestBody);
            } catch (parseError) {
                throw validationError('Invalid JSON in request body', { parseError: parseError.message });
            }

            // Process each notification
            if (notifications.value && Array.isArray(notifications.value)) {
                for (const notification of notifications.value) {
                    await processNotification(notification, context);
                }
                
                return {
                    status: 200,
                    body: 'Notifications processed successfully'
                };
            } else {
                throw validationError('Invalid notification format', { receivedData: notifications });
            }
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
            context.log('Duplicate notification detected, skipping to prevent loop');
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
        
        context.log('Processing notification:', {
            subscriptionId: notification.subscriptionId,
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
            context.log('Skipping self-notification to prevent loops');
            return;
        }

        // Log the change details
        context.log('SharePoint change detected:', {
            changeType: changeType,
            resource: resource,
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
                    context.log(`Enhanced forwarding to: ${config.forwardUrl} with mode: ${config.mode}`);
                    
                    // Forward with enhanced data
                    const result = await forwarder.forward(notification, config.forwardUrl, config);
                    
                    if (result.success) {
                        context.log(`Successfully forwarded with enhanced mode: ${config.mode}`);
                        // Update forwarding statistics in background
                        updateForwardingStats(subscriptionId, context).catch(err => 
                            context.error('Background forwarding stats update failed:', err.message)
                        );
                    } else {
                        context.error('Enhanced forwarding failed:', result.error);
                    }
                } else {
                    // Fallback to simple forwarding
                    const options = parseClientState(clientState);
                    const forwardingUrl = options.forwardUrl;
                    context.log(`Simple forwarding to: ${forwardingUrl}`);
                    
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
                        context.error('Background forwarding stats update failed:', err.message)
                    );
                }
            } catch (forwardError) {
                context.error('Failed to forward notification:', forwardError.message);
                // Continue processing even if forwarding fails
            }
        }

        // Update notification count in SharePoint list
        try {
            // Run in background - don't await
            updateNotificationCount(subscriptionId, context).catch(err => 
                context.error('Background update failed:', err.message)
            );
        } catch (updateError) {
            context.error('Failed to start notification count update:', updateError.message);
        }

        // Here you can add your business logic to handle the changes
        // For example:
        // - Send notifications
        // - Trigger workflows
        // - Update databases
        // - Call other APIs

        context.log('Notification processed successfully');

    } catch (error) {
        context.error('Error processing individual notification:', {
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
            
            context.log(`Updated forwarding stats for webhook ${subscriptionId}`);
        }
    } catch (error) {
        context.error('Error updating forwarding stats:', error.message);
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
        context.log(`Found ${searchResponse.data.value?.length || 0} items in SharePoint list`);
        
        // Find the item with matching SubscriptionId
        const matchingItem = searchResponse.data.value?.find(item => 
            item.fields && item.fields.SubscriptionId === subscriptionId
        );
        
        if (matchingItem) {
            const item = matchingItem;
            
            // Check if webhook is marked as deleted
            if (item.fields.Status === 'Deleted') {
                context.warn(`Received notification from deleted webhook ${subscriptionId}. Ignoring.`);
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
            
            context.log(`Updated notification count for webhook ${subscriptionId}: ${currentCount + 1}`);
        } else {
            context.warn(`Webhook ${subscriptionId} not found in SharePoint list. It may have been deleted.`);
        }
    } catch (error) {
        context.error('Error updating notification count:', error.message);
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

        context.log('Successfully forwarded notification:', {
            url: forwardingUrl,
            status: response.status,
            subscriptionId: notification.subscriptionId
        });

        return response;
    } catch (error) {
        context.error('Error forwarding notification:', {
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



