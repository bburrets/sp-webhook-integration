const { app } = require('@azure/functions');
const axios = require('axios');


// Webhook endpoint to handle Microsoft Graph notifications
app.http('webhook-handler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Webhook request received:', request.method);
        context.log('Query parameters:', request.query);
        context.log('Headers:', request.headers);

        try {
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
                return {
                    status: 400,
                    headers: {
                        'Content-Type': 'text/plain'
                    },
                    body: 'Missing validation token'
                };
            }

            if (request.method === 'POST') {
                // Handle webhook notifications
                const requestBody = await request.text();
                context.log('Webhook notification body:', requestBody);
                
                let notifications;
                try {
                    notifications = JSON.parse(requestBody);
                } catch (parseError) {
                    context.error('Failed to parse request body:', parseError);
                    return {
                        status: 400,
                        body: 'Invalid JSON in request body'
                    };
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
                    context.error('Invalid notification format:', notifications);
                    return {
                        status: 400,
                        body: 'Invalid notification format'
                    };
                }
            }

            return {
                status: 405,
                body: 'Method not allowed'
            };

        } catch (error) {
            context.error('Error processing webhook:', error);
            context.error('Error stack:', error.stack);
            context.error('Error details:', {
                message: error.message,
                name: error.name,
                code: error.code
            });
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Internal server error',
                    message: error.message,
                    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
                })
            };
        }
    }
});

async function processNotification(notification, context) {
    try {
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
            const forwardingUrl = clientState.substring(8);
            context.log(`Forwarding notification to: ${forwardingUrl}`);
            
            try {
                await forwardNotification(notification, forwardingUrl, context);
                // Update forwarding statistics in background
                updateForwardingStats(subscriptionId, context).catch(err => 
                    context.error('Background forwarding stats update failed:', err.message)
                );
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
        context.error('Error processing individual notification:', error);
        context.error('Notification error stack:', error.stack);
        context.error('Failed notification:', JSON.stringify(notification, null, 2));
        throw error;
    }
}

async function updateForwardingStats(subscriptionId, context) {
    try {
        // Get access token
        const clientId = process.env.AZURE_CLIENT_ID;
        const clientSecret = process.env.AZURE_CLIENT_SECRET;
        const tenantId = process.env.AZURE_TENANT_ID;
        const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
        const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
        
        if (!clientId || !clientSecret || !tenantId) {
            context.log.warn('Missing Azure credentials for SharePoint update');
            return;
        }
        
        // Get access token
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const tokenParams = new URLSearchParams();
        tokenParams.append('client_id', clientId);
        tokenParams.append('client_secret', clientSecret);
        tokenParams.append('scope', 'https://graph.microsoft.com/.default');
        tokenParams.append('grant_type', 'client_credentials');

        const tokenResponse = await axios.post(tokenUrl, tokenParams, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const accessToken = tokenResponse.data.access_token;
        
        // Get all items from SharePoint list
        const searchUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
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
            const updateUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${matchingItem.id}`;
            
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
        // Get access token
        const clientId = process.env.AZURE_CLIENT_ID;
        const clientSecret = process.env.AZURE_CLIENT_SECRET;
        const tenantId = process.env.AZURE_TENANT_ID;
        const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
        const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
        
        if (!clientId || !clientSecret || !tenantId) {
            context.warn('Missing Azure credentials for notification count update');
            return;
        }
        
        // Get access token
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const tokenParams = new URLSearchParams();
        tokenParams.append('client_id', clientId);
        tokenParams.append('client_secret', clientSecret);
        tokenParams.append('scope', 'https://graph.microsoft.com/.default');
        tokenParams.append('grant_type', 'client_credentials');

        const tokenResponse = await axios.post(tokenUrl, tokenParams, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const accessToken = tokenResponse.data.access_token;
        
        // Find the item in SharePoint list using Graph API
        // Note: Can't filter by SubscriptionId as it's not indexed, so we get all items and filter in memory
        const searchUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
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
            const updateUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${itemId}`;
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
        // Prepare the payload with enriched data
        const enrichedPayload = {
            timestamp: new Date().toISOString(),
            source: 'SharePoint-Webhook-Proxy',
            notification: notification,
            metadata: {
                processedBy: 'webhook-functions-sharepoint-002',
                environment: process.env.ENVIRONMENT || 'production'
            }
        };

        // Optional: Add more enrichment based on environment variables
        if (process.env.INCLUDE_ENRICHED_DATA === 'true') {
            try {
                // You could add logic here to fetch additional data from SharePoint
                // For now, we'll just include what we have
                enrichedPayload.enrichedData = {
                    resourcePath: notification.resource,
                    changeType: notification.changeType,
                    subscriptionId: notification.subscriptionId
                };
            } catch (enrichError) {
                context.log.warn('Failed to enrich data:', enrichError.message);
            }
        }

        // Forward the notification
        const response = await axios.post(forwardingUrl, enrichedPayload, {
            timeout: 10000, // 10 second timeout
            headers: {
                'Content-Type': 'application/json',
                'X-SharePoint-Webhook-Proxy': 'true',
                'X-Original-Subscription-Id': notification.subscriptionId
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
            subscriptionId: notification.subscriptionId
        });
        throw error;
    }
}

