const { app } = require('@azure/functions');
const axios = require('axios');

// Sync webhooks to SharePoint list using Microsoft Graph API
app.http('webhook-sync', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Webhook sync triggered');

        try {
            // Get environment variables
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
            
            // Using the site path format from the webhook resource
            const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
            if (!clientId || !clientSecret || !tenantId) {
                return {
                    status: 500,
                    body: JSON.stringify({
                        error: 'Missing required environment variables'
                    })
                };
            }

            // Get access token
            const accessToken = await getAccessToken(clientId, clientSecret, tenantId, context);
            
            // Get all webhooks from Microsoft Graph
            const webhooks = await getWebhooks(accessToken, context);
            
            // Sync to SharePoint list using Graph API
            const syncResult = await syncToSharePoint(accessToken, sitePath, listId, webhooks, context);
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Sync completed',
                    webhooksFound: webhooks.length,
                    syncResult: syncResult
                })
            };

        } catch (error) {
            context.log.error('Error in webhook sync:', error);
            context.log.error('Error stack:', error.stack);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Sync failed',
                    details: error.message,
                    stack: error.stack
                })
            };
        }
    }
});

// Timer trigger for automatic sync
app.timer('webhook-sync-timer', {
    schedule: '0 */30 * * * *', // Every 30 minutes
    handler: async (myTimer, context) => {
        context.log('Timer triggered webhook sync');
        
        try {
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
            const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
            const accessToken = await getAccessToken(clientId, clientSecret, tenantId, context);
            const webhooks = await getWebhooks(accessToken, context);
            await syncToSharePoint(accessToken, sitePath, listId, webhooks, context);
            
            context.log('Timer sync completed successfully');
        } catch (error) {
            context.log.error('Timer sync failed:', error);
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

        return tokenResponse.data.access_token;
    } catch (error) {
        context.log.error('Error getting access token:', error);
        throw new Error('Failed to obtain access token');
    }
}

async function getWebhooks(accessToken, context) {
    try {
        const response = await axios.get('https://graph.microsoft.com/v1.0/subscriptions', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        context.log(`Found ${response.data.value.length} webhooks`);
        return response.data.value;
    } catch (error) {
        context.log.error('Error getting webhooks:', error);
        throw error;
    }
}

async function syncToSharePoint(accessToken, sitePath, listId, webhooks, context) {
    try {
        // Get existing items from SharePoint list using Graph API
        const existingItems = await getSharePointListItems(accessToken, sitePath, listId, context);
        
        // Create a map of existing webhooks by subscription ID
        const existingMap = new Map();
        existingItems.forEach(item => {
            if (item.fields && item.fields.SubscriptionId) {
                existingMap.set(item.fields.SubscriptionId, item);
            }
        });

        const results = {
            created: 0,
            updated: 0,
            deleted: 0
        };

        // Update or create items for current webhooks
        for (const webhook of webhooks) {
            const existingItem = existingMap.get(webhook.id);
            
            // Extract site and list info from resource
            let listName = 'Unknown List';
            let siteUrl = '';
            let listIdValue = '';
            let resourceType = 'List'; // Default
            
            if (webhook.resource) {
                const parts = webhook.resource.split('/lists/');
                siteUrl = parts[0];
                listIdValue = parts[1];
                
                // Try to get the actual list name and type from Graph API
                try {
                    const sitePathForList = siteUrl.replace('sites/', '');
                    const listUrl = `https://graph.microsoft.com/v1.0/sites/${sitePathForList}/lists/${listIdValue}`;
                    const listResponse = await axios.get(listUrl, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Accept': 'application/json'
                        }
                    });
                    listName = listResponse.data.displayName || listResponse.data.name || `List ${listIdValue}`;
                    
                    // Determine if it's a Document Library
                    if (listResponse.data.list && listResponse.data.list.template === 'documentLibrary') {
                        resourceType = 'Library';
                    }
                } catch (listError) {
                    context.log.warn(`Could not fetch list details for ${listIdValue}:`, listError.message);
                    context.log.warn(`Error response:`, listError.response?.data);
                    listName = `List ${listIdValue}`;
                }
            }
            
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
                    NotificationCount: existingItem ? existingItem.fields.NotificationCount || 0 : 0
                }
            };

            try {
                if (existingItem) {
                    // Update existing item
                    await updateSharePointListItem(accessToken, sitePath, listId, existingItem.id, itemData, context);
                    results.updated++;
                    existingMap.delete(webhook.id); // Remove from map to track what's left
                } else {
                    // Create new item
                    await createSharePointListItem(accessToken, sitePath, listId, itemData, context);
                    results.created++;
                }
            } catch (itemError) {
                context.log.error(`Failed to sync webhook ${webhook.id}:`, itemError.message);
                // Continue with other webhooks
            }
        }

        // Mark remaining items as deleted (no longer exist in Graph)
        for (const [subscriptionId, item] of existingMap) {
            try {
                const updateData = {
                    fields: {
                        Status: 'Deleted'
                    }
                };
                await updateSharePointListItem(accessToken, sitePath, listId, item.id, updateData, context);
                results.deleted++;
            } catch (deleteError) {
                context.log.error(`Failed to mark webhook ${subscriptionId} as deleted:`, deleteError.message);
                // Continue with other items
            }
        }

        context.log('Sync results:', results);
        return results;

    } catch (error) {
        context.log.error('Error syncing to SharePoint:', error);
        throw error;
    }
}

async function getSharePointListItems(accessToken, sitePath, listId, context) {
    try {
        const apiUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=5000`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        return response.data.value || [];
    } catch (error) {
        context.log.error('Error getting SharePoint list items:', error.response?.data || error.message);
        return [];
    }
}

async function createSharePointListItem(accessToken, sitePath, listId, itemData, context) {
    try {
        const apiUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items`;
        
        const response = await axios.post(apiUrl, itemData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        context.log('Created SharePoint list item for webhook:', itemData.fields.SubscriptionId);
    } catch (error) {
        context.log.error('Error creating SharePoint list item:', error.response?.data || error.message);
        context.log.error('Item data:', JSON.stringify(itemData, null, 2));
        context.log.error('API URL:', apiUrl);
        // Don't re-throw - let the sync continue
    }
}

async function updateSharePointListItem(accessToken, sitePath, listId, itemId, itemData, context) {
    try {
        const apiUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${itemId}`;
        
        await axios.patch(apiUrl, itemData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        context.log('Updated SharePoint list item:', itemId);
    } catch (error) {
        context.log.error('Error updating SharePoint list item:', error.response?.data || error.message);
    }
}