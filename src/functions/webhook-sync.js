const { app } = require('@azure/functions');
const axios = require('axios');

// Sync webhooks to SharePoint list
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
            const siteUrl = process.env.SHAREPOINT_SITE_URL || 'https://fambrandsllc.sharepoint.com/sites/sphookmanagement';
            const listId = process.env.WEBHOOK_LIST_ID || '30516097-c58c-478c-b87f-76c8f6ce2b56';
            
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
            
            // Sync to SharePoint list
            const syncResult = await syncToSharePoint(accessToken, siteUrl, listId, webhooks, context);
            
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
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Sync failed',
                    details: error.message
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
            const siteUrl = process.env.SHAREPOINT_SITE_URL || 'https://fambrandsllc.sharepoint.com/sites/sphookmanagement';
            const listId = process.env.WEBHOOK_LIST_ID || '30516097-c58c-478c-b87f-76c8f6ce2b56';
            
            const accessToken = await getAccessToken(clientId, clientSecret, tenantId, context);
            const webhooks = await getWebhooks(accessToken, context);
            await syncToSharePoint(accessToken, siteUrl, listId, webhooks, context);
            
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

async function syncToSharePoint(accessToken, siteUrl, listId, webhooks, context) {
    try {
        // Get existing items from SharePoint list
        const existingItems = await getSharePointListItems(accessToken, siteUrl, listId, context);
        
        // Create a map of existing webhooks by subscription ID
        const existingMap = new Map();
        existingItems.forEach(item => {
            if (item.fields.SubscriptionId) {
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
            
            const itemData = {
                Title: webhook.resource || 'Unknown Resource',
                SubscriptionId: webhook.id,
                Resource: webhook.resource,
                ChangeType: webhook.changeType,
                NotificationUrl: webhook.notificationUrl,
                ExpirationDateTime: webhook.expirationDateTime,
                ClientState: webhook.clientState || '',
                ApplicationId: webhook.applicationId || '',
                CreatorId: webhook.creatorId || '',
                Status: 'Active',
                LastSyncDateTime: new Date().toISOString()
            };

            if (existingItem) {
                // Update existing item
                await updateSharePointListItem(accessToken, siteUrl, listId, existingItem.id, itemData, context);
                results.updated++;
                existingMap.delete(webhook.id); // Remove from map to track what's left
            } else {
                // Create new item
                await createSharePointListItem(accessToken, siteUrl, listId, itemData, context);
                results.created++;
            }
        }

        // Mark remaining items as deleted (no longer exist in Graph)
        for (const [subscriptionId, item] of existingMap) {
            const updateData = {
                Status: 'Deleted',
                LastSyncDateTime: new Date().toISOString()
            };
            await updateSharePointListItem(accessToken, siteUrl, listId, item.id, updateData, context);
            results.deleted++;
        }

        context.log('Sync results:', results);
        return results;

    } catch (error) {
        context.log.error('Error syncing to SharePoint:', error);
        throw error;
    }
}

async function getSharePointListItems(accessToken, siteUrl, listId, context) {
    try {
        const apiUrl = `${siteUrl}/_api/web/lists(guid'${listId}')/items?$select=*&$top=5000`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        return response.data.value || [];
    } catch (error) {
        context.log.error('Error getting SharePoint list items:', error);
        return [];
    }
}

async function createSharePointListItem(accessToken, siteUrl, listId, itemData, context) {
    try {
        const apiUrl = `${siteUrl}/_api/web/lists(guid'${listId}')/items`;
        
        await axios.post(apiUrl, itemData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        context.log('Created SharePoint list item for webhook:', itemData.SubscriptionId);
    } catch (error) {
        context.log.error('Error creating SharePoint list item:', error.response?.data || error.message);
    }
}

async function updateSharePointListItem(accessToken, siteUrl, listId, itemId, itemData, context) {
    try {
        const apiUrl = `${siteUrl}/_api/web/lists(guid'${listId}')/items(${itemId})`;
        
        await axios.patch(apiUrl, itemData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'IF-MATCH': '*'
            }
        });

        context.log('Updated SharePoint list item:', itemId);
    } catch (error) {
        context.log.error('Error updating SharePoint list item:', error.response?.data || error.message);
    }
}