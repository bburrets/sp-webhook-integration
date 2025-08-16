const { app } = require('@azure/functions');
const axios = require('axios');
const config = require('../shared/config');
const { getAccessToken } = require('../shared/auth');
const { wrapHandler, validationError, handleError } = require('../shared/error-handler');
const { validateSubscriptionRequest, validateGuid } = require('../shared/validators');

// Subscription management endpoint
app.http('subscription-manager', {
    methods: ['GET', 'POST', 'DELETE'],
    authLevel: 'function',
    handler: wrapHandler(async (request, context) => {
        context.log('Subscription manager request:', request.method);

        // Get Azure credentials from config
        const clientId = config.azure.clientId;
        const clientSecret = config.azure.clientSecret;
        const tenantId = config.azure.tenantId;
        
        if (!clientId || !clientSecret || !tenantId) {
            throw validationError('Missing required environment variables: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID');
        }

        // Get access token using shared auth module
        const accessToken = await getAccessToken(context);
        
        if (request.method === 'GET') {
            // List existing subscriptions
            return await listSubscriptions(accessToken, context);
        }
        
        if (request.method === 'POST') {
            // Create new subscription
            const requestBody = await request.text();
            let subscriptionData;
            try {
                subscriptionData = JSON.parse(requestBody);
            } catch (parseError) {
                throw validationError('Invalid JSON in request body', { parseError: parseError.message });
            }
            
            // Validate the subscription request
            const validatedData = validateSubscriptionRequest(subscriptionData);
            return await createSubscription(accessToken, validatedData, context);
        }
        
        if (request.method === 'DELETE') {
            // Delete subscription
            const subscriptionId = request.query.get('subscriptionId');
            if (!subscriptionId) {
                throw validationError('subscriptionId query parameter is required');
            }
            
            // Validate the subscription ID format
            const validatedId = validateGuid(subscriptionId, 'subscriptionId');
            return await deleteSubscription(accessToken, validatedId, context);
        }

        throw validationError('Method not supported', { method: request.method });
    })
});

// Removed duplicate getAccessToken - now using shared auth module

async function listSubscriptions(accessToken, context) {
    try {
        const response = await axios.get(`${config.api.graph.baseUrl}/subscriptions`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        context.log('Subscriptions retrieved successfully:', response.data.value.length);
        
        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscriptions: response.data.value,
                count: response.data.value.length
            })
        };

    } catch (error) {
        context.error('Error listing subscriptions:', error.response?.data || error.message);
        return {
            status: error.response?.status || 500,
            body: JSON.stringify({
                error: 'Failed to list subscriptions',
                details: error.response?.data || error.message
            })
        };
    }
}

async function createSubscription(accessToken, subscriptionData, context) {
    try {
        // Extract fields (already validated)
        const { resource, changeType, notificationUrl, expirationDateTime } = subscriptionData;

        // Calculate expiration date (max 3 days for SharePoint webhooks)
        const expiration = expirationDateTime || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

        const subscription = {
            changeType: changeType,
            notificationUrl: notificationUrl,
            resource: resource,
            expirationDateTime: expiration,
            clientState: subscriptionData.clientState || config.webhook.defaultClientState
        };

        context.log('Creating subscription:', subscription);

        try {
            const response = await axios.post(`${config.api.graph.baseUrl}/subscriptions`, subscription, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: config.api.timeout
            });

            context.log('Subscription created successfully:', response.data.id);

            // Sync to SharePoint list asynchronously - don't wait for it to complete
            const webhookDataWithClientState = {
                ...response.data,
                clientState: subscription.clientState
            };
            
            // Fire and forget - sync happens in background
            syncWebhookToSharePoint(accessToken, webhookDataWithClientState, 'created', context)
                .then(() => {
                    context.log('SharePoint sync completed successfully for webhook:', response.data.id);
                })
                .catch((syncError) => {
                    context.error('Failed to sync to SharePoint:', syncError.message);
                    context.error('Sync error details:', syncError.response?.data || syncError);
                    context.error('Sync error stack:', syncError.stack);
                });

            // Return immediately without waiting for sync
            return {
                status: 201,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(response.data)
            };
        } catch (axiosError) {
            // Log the full axios error
            context.error('Axios Error Details:');
            context.error('Status:', axiosError.response?.status);
            context.error('Status Text:', axiosError.response?.statusText);
            context.error('Headers:', JSON.stringify(axiosError.response?.headers, null, 2));
            context.error('Data:', JSON.stringify(axiosError.response?.data, null, 2));
            context.error('Config URL:', axiosError.config?.url);
            context.error('Config Method:', axiosError.config?.method);
            context.error('Config Headers:', JSON.stringify(axiosError.config?.headers, null, 2));
            
            throw axiosError; // Re-throw to be caught by outer catch
        }

    } catch (error) {
        context.error('Final error handler - Error message:', error.message);
        context.error('Final error handler - Error stack:', error.stack);
        if (error.response) {
            context.error('Final error handler - Response data:', JSON.stringify(error.response.data, null, 2));
        }
        
        return {
            status: error.response?.status || 500,
            body: JSON.stringify({
                error: 'Failed to create subscription',
                message: error.message,
                details: error.response?.data,
                status: error.response?.status,
                statusText: error.response?.statusText
            })
        };
    }
}

async function deleteSubscription(accessToken, subscriptionId, context) {
    try {
        await axios.delete(`${config.api.graph.baseUrl}/subscriptions/${subscriptionId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        context.log('Subscription deleted successfully:', subscriptionId);

        // Sync to SharePoint list asynchronously
        syncWebhookToSharePoint(accessToken, { id: subscriptionId }, 'deleted', context)
            .then(() => {
                context.log('SharePoint sync completed successfully for deleted webhook:', subscriptionId);
            })
            .catch((syncError) => {
                context.error('Failed to sync deletion to SharePoint:', syncError);
            });

        return {
            status: 200,
            body: JSON.stringify({
                message: 'Subscription deleted successfully',
                subscriptionId: subscriptionId
            })
        };

    } catch (error) {
        context.error('Error deleting subscription:', error.response?.data || error.message);
        return {
            status: error.response?.status || 500,
            body: JSON.stringify({
                error: 'Failed to delete subscription',
                details: error.response?.data || error.message
            })
        };
    }
}

async function syncWebhookToSharePoint(accessToken, webhook, action, context) {
    try {
        const listId = config.sharepoint.lists.webhookManagement;
        const sitePath = config.sharepoint.primarySite.sitePath;
        
        if (action === 'created') {
            // Extract site and list info from resource
            let listName = 'Unknown List';
            let siteUrl = '';
            let listIdValue = '';
            
            if (webhook.resource) {
                const parts = webhook.resource.split('/lists/');
                siteUrl = parts[0];
                listIdValue = parts[1];
                
                // Map known list IDs to names using config
                listName = config.sharepoint.listMappings[listIdValue] || 'Unknown List';
            }
            
            // Determine resource type
            let resourceType = 'List';
            if (webhook.resource && webhook.resource.includes('sites/')) {
                resourceType = 'List';
            }
            
            // Parse client state for proxy/UiPath configuration
            let isProxy = 'No';
            let forwardingUrl = '';
            let uipathQueue = '';
            
            if (webhook.clientState) {
                // Check for forwarding configuration
                if (webhook.clientState.includes('forward:')) {
                    isProxy = 'Yes';
                    const forwardMatch = webhook.clientState.match(/forward:([^;]+)/);
                    if (forwardMatch) {
                        forwardingUrl = forwardMatch[1];
                    }
                }
                
                // Check for UiPath configuration
                if (webhook.clientState.includes('uipath:')) {
                    const uipathMatch = webhook.clientState.match(/uipath:([^;]+)/);
                    if (uipathMatch) {
                        uipathQueue = uipathMatch[1];
                        // Update title to include UiPath queue info
                        if (uipathQueue) {
                            listName = `${listName} → ${uipathQueue}`;
                        }
                    }
                }
            }
            
            // Add webhook to SharePoint list using Graph API
            const itemData = {
                fields: {
                    Title: `${resourceType} - ${listName}`,
                    SubscriptionId: webhook.id,
                    ChangeType: webhook.changeType,
                    NotificationUrl: webhook.notificationUrl,
                    ExpirationDateTime: webhook.expirationDateTime,
                    Status: 'Active',
                    SiteUrl: siteUrl,
                    ListId: listIdValue,
                    ListName: listName,
                    ResourceType: resourceType,
                    AutoRenew: true,
                    NotificationCount: 0,
                    ClientState: webhook.clientState || '',
                    ForwardingUrl: forwardingUrl,
                    IsProxy: isProxy
                }
            };
            
            const apiUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items`;
            await axios.post(apiUrl, itemData, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            context.log('Webhook synced to SharePoint list:', webhook.id);
            
        } else if (action === 'deleted') {
            // Find and update the item in SharePoint list using Graph API
            // Note: Can't filter by SubscriptionId as it's not indexed, so we get all items and filter in memory
            const searchUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
            const searchResponse = await axios.get(searchUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            // Find the item with matching SubscriptionId
            const matchingItem = searchResponse.data.value?.find(item => 
                item.fields && item.fields.SubscriptionId === webhook.id
            );
            
            if (matchingItem) {
                const updateUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items/${matchingItem.id}`;
                
                await axios.patch(updateUrl, {
                    fields: {
                        Status: 'Deleted'
                    }
                }, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                
                context.log('Webhook marked as deleted in SharePoint list:', webhook.id);
            } else {
                context.log.warn('Webhook not found in SharePoint list:', webhook.id);
            }
        }
    } catch (error) {
        context.error('Error syncing to SharePoint:', error.response?.data || error.message);
        throw error;
    }
}