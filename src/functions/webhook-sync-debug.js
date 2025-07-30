const { app } = require('@azure/functions');
const axios = require('axios');

// Debug version of webhook sync
app.http('webhook-sync-debug', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Debug webhook sync triggered');
        const results = {
            steps: []
        };

        try {
            // Step 1: Get credentials
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
            const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
            results.steps.push({ step: 'credentials', status: 'success' });
            
            // Step 2: Get access token
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
            results.steps.push({ step: 'token', status: 'success' });
            
            // Step 3: Get webhooks
            const webhooksResponse = await axios.get('https://graph.microsoft.com/v1.0/subscriptions', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const webhooks = webhooksResponse.data.value;
            results.steps.push({ 
                step: 'get_webhooks', 
                status: 'success',
                count: webhooks.length 
            });
            
            // Step 4: Get existing items
            let existingItems = [];
            try {
                const itemsUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=5000`;
                const itemsResponse = await axios.get(itemsUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                existingItems = itemsResponse.data.value || [];
                results.steps.push({ 
                    step: 'get_existing_items', 
                    status: 'success',
                    count: existingItems.length 
                });
            } catch (error) {
                results.steps.push({ 
                    step: 'get_existing_items', 
                    status: 'failed',
                    error: error.response?.data || error.message 
                });
            }
            
            // Step 5: Try to create/update one webhook
            if (webhooks.length > 0) {
                const webhook = webhooks[0];
                try {
                    const itemData = {
                        fields: {
                            Title: webhook.resource || 'Unknown Resource',
                            SubscriptionId: webhook.id,
                            ChangeType: webhook.changeType,
                            NotificationUrl: webhook.notificationUrl,
                            ExpirationDateTime: webhook.expirationDateTime,
                            Status: 'Active',
                            SiteUrl: webhook.resource ? webhook.resource.split('/lists/')[0] : '',
                            ListId: webhook.resource ? webhook.resource.split('/lists/')[1] : ''
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
                    
                    results.steps.push({ 
                        step: 'create_item', 
                        status: 'success',
                        itemId: createResponse.data.id 
                    });
                } catch (error) {
                    results.steps.push({ 
                        step: 'create_item', 
                        status: 'failed',
                        error: error.response?.data || error.message,
                        statusCode: error.response?.status
                    });
                }
            }
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(results, null, 2)
            };

        } catch (error) {
            results.error = error.message;
            return {
                status: 500,
                body: JSON.stringify(results, null, 2)
            };
        }
    }
});