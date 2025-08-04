const { app } = require('@azure/functions');
const axios = require('axios');

// Simple sync webhooks to SharePoint list using only Title field
app.http('webhook-sync-simple', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Simple webhook sync triggered');

        try {
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = process.env.WEBHOOK_LIST_ID || '30516097-c58c-478c-b87f-76c8f6ce2b56';
            const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
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
            
            // Get all webhooks
            const webhooksResponse = await axios.get('https://graph.microsoft.com/v1.0/subscriptions', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const webhooks = webhooksResponse.data.value;
            context.log(`Found ${webhooks.length} webhooks`);
            
            // Try to create a simple item for each webhook
            const results = [];
            for (const webhook of webhooks) {
                try {
                    const itemData = {
                        fields: {
                            Title: `Webhook: ${webhook.id} - ${webhook.changeType}`
                        }
                    };
                    
                    const createUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items`;
                    const createResponse = await axios.post(createUrl, itemData, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    });
                    
                    results.push({
                        webhookId: webhook.id,
                        status: 'created',
                        itemId: createResponse.data.id
                    });
                    
                } catch (error) {
                    results.push({
                        webhookId: webhook.id,
                        status: 'failed',
                        error: error.response?.data?.error || error.message
                    });
                }
            }
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Simple sync completed',
                    webhooksFound: webhooks.length,
                    results: results
                })
            };

        } catch (error) {
            context.log.error('Error in simple sync:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Simple sync failed',
                    details: error.response?.data || error.message
                })
            };
        }
    }
});