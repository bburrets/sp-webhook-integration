const { app } = require('@azure/functions');
const axios = require('axios');

async function syncWebhookToSharePoint(accessToken, webhook, action, context) {
    try {
        const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
        const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
        
        if (action === 'created') {
            // Extract site and list info from resource
            let listName = 'Unknown List';
            let siteUrl = '';
            let listIdValue = '';
            let resourceType = 'List';
            
            if (webhook.resource) {
                const parts = webhook.resource.split('/lists/');
                siteUrl = parts[0];
                listIdValue = parts[1];
            }
            
            // Check if this is a proxy webhook
            let isProxy = 'No';
            let forwardingUrl = '';
            if (webhook.clientState && webhook.clientState.startsWith('forward:')) {
                isProxy = 'Yes';
                forwardingUrl = webhook.clientState.substring(8);
            }
            
            // Add webhook to SharePoint list
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
            
            context.log('Webhook synced to SharePoint list with preserved clientState:', webhook.id);
        }
    } catch (error) {
        context.log.error('Error syncing to SharePoint:', error.response?.data || error.message);
        throw error;
    }
}

app.http('test-webhook-creation', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Test webhook creation started');

        try {
            // Get request body
            const requestBody = await request.text();
            const data = JSON.parse(requestBody);
            
            context.log('Received data:', JSON.stringify(data, null, 2));
            
            // Get access token
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            
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
            
            // Create subscription with explicit clientState
            const subscription = {
                changeType: data.changeType || 'updated',
                notificationUrl: data.notificationUrl || 'https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler',
                resource: data.resource,
                expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                clientState: data.clientState
            };
            
            context.log('Sending subscription to Graph API:', JSON.stringify(subscription, null, 2));
            
            const response = await axios.post('https://graph.microsoft.com/v1.0/subscriptions', subscription, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            context.log('Graph API response:', JSON.stringify(response.data, null, 2));
            
            // Sync to SharePoint with clientState preserved
            try {
                await syncWebhookToSharePoint(accessToken, {
                    ...response.data,
                    clientState: subscription.clientState // Preserve the original clientState
                }, 'created', context);
                context.log('Successfully synced webhook to SharePoint with clientState');
            } catch (syncError) {
                context.log.error('Failed to sync to SharePoint:', syncError.message);
            }
            
            return {
                status: 200,
                body: JSON.stringify({
                    message: 'Test completed',
                    sentToGraph: subscription,
                    receivedFromGraph: response.data,
                    clientStateMatch: subscription.clientState === response.data.clientState
                })
            };
            
        } catch (error) {
            context.log.error('Test error:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: error.message,
                    details: error.response?.data
                })
            };
        }
    }
});