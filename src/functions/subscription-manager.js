const { app } = require('@azure/functions');
const axios = require('axios');

// Subscription management endpoint
app.http('subscription-manager', {
    methods: ['GET', 'POST', 'DELETE'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Subscription manager request:', request.method);

        try {
            // Get environment variables
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            
            if (!clientId || !clientSecret || !tenantId) {
                return {
                    status: 500,
                    body: JSON.stringify({
                        error: 'Missing required environment variables: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID'
                    })
                };
            }

            // Get access token
            const accessToken = await getAccessToken(clientId, clientSecret, tenantId, context);
            
            if (request.method === 'GET') {
                // List existing subscriptions
                return await listSubscriptions(accessToken, context);
            }
            
            if (request.method === 'POST') {
                // Create new subscription
                const requestBody = await request.text();
                const subscriptionData = JSON.parse(requestBody);
                return await createSubscription(accessToken, subscriptionData, context);
            }
            
            if (request.method === 'DELETE') {
                // Delete subscription
                const subscriptionId = request.query.get('subscriptionId');
                if (!subscriptionId) {
                    return {
                        status: 400,
                        body: JSON.stringify({ error: 'subscriptionId query parameter is required' })
                    };
                }
                return await deleteSubscription(accessToken, subscriptionId, context);
            }

        } catch (error) {
            context.log.error('Error in subscription manager:', error);
            context.log.error('Error stack:', error.stack);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Internal server error',
                    details: error.message,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                })
            };
        }
    }
});

async function getAccessToken(clientId, clientSecret, tenantId, context) {
    try {
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

        context.log('Access token obtained successfully');
        return tokenResponse.data.access_token;

    } catch (error) {
        context.log.error('Error getting access token:', error.response?.data || error.message);
        throw new Error('Failed to obtain access token');
    }
}

async function listSubscriptions(accessToken, context) {
    try {
        const response = await axios.get('https://graph.microsoft.com/v1.0/subscriptions', {
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
        context.log.error('Error listing subscriptions:', error.response?.data || error.message);
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
        // Validate required fields
        const { resource, changeType, notificationUrl, expirationDateTime } = subscriptionData;
        
        if (!resource || !changeType || !notificationUrl) {
            return {
                status: 400,
                body: JSON.stringify({
                    error: 'Missing required fields: resource, changeType, notificationUrl'
                })
            };
        }

        // Calculate expiration date (max 3 days for SharePoint webhooks)
        const expiration = expirationDateTime || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

        const subscription = {
            changeType: changeType,
            notificationUrl: notificationUrl,
            resource: resource,
            expirationDateTime: expiration,
            clientState: subscriptionData.clientState || 'SharePointWebhook'
        };

        context.log('Creating subscription:', subscription);

        try {
            const response = await axios.post('https://graph.microsoft.com/v1.0/subscriptions', subscription, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
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
                    context.log.error('Failed to sync to SharePoint:', syncError.message);
                    context.log.error('Sync error details:', syncError.response?.data || syncError);
                    context.log.error('Sync error stack:', syncError.stack);
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
            context.log.error('Axios Error Details:');
            context.log.error('Status:', axiosError.response?.status);
            context.log.error('Status Text:', axiosError.response?.statusText);
            context.log.error('Headers:', JSON.stringify(axiosError.response?.headers, null, 2));
            context.log.error('Data:', JSON.stringify(axiosError.response?.data, null, 2));
            context.log.error('Config URL:', axiosError.config?.url);
            context.log.error('Config Method:', axiosError.config?.method);
            context.log.error('Config Headers:', JSON.stringify(axiosError.config?.headers, null, 2));
            
            throw axiosError; // Re-throw to be caught by outer catch
        }

    } catch (error) {
        context.log.error('Final error handler - Error message:', error.message);
        context.log.error('Final error handler - Error stack:', error.stack);
        if (error.response) {
            context.log.error('Final error handler - Response data:', JSON.stringify(error.response.data, null, 2));
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
        await axios.delete(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
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
                context.log.error('Failed to sync deletion to SharePoint:', syncError);
            });

        return {
            status: 200,
            body: JSON.stringify({
                message: 'Subscription deleted successfully',
                subscriptionId: subscriptionId
            })
        };

    } catch (error) {
        context.log.error('Error deleting subscription:', error.response?.data || error.message);
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
        const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
        const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
        
        if (action === 'created') {
            // Extract site and list info from resource
            let listName = 'Unknown List';
            let siteUrl = '';
            let listIdValue = '';
            
            if (webhook.resource) {
                const parts = webhook.resource.split('/lists/');
                siteUrl = parts[0];
                listIdValue = parts[1];
                
                // Simplified - no extra API call
                let resourceType = 'List'; // Default
                listName = `List`; // Simplified name
            }
            
            // Check if this is a proxy webhook
            let isProxy = 'No';
            let forwardingUrl = '';
            if (webhook.clientState && webhook.clientState.startsWith('forward:')) {
                isProxy = 'Yes';
                forwardingUrl = webhook.clientState.substring(8);
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
            
            const apiUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items`;
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
            const searchUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
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
                const updateUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${matchingItem.id}`;
                
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
        context.log.error('Error syncing to SharePoint:', error.response?.data || error.message);
        throw error;
    }
}