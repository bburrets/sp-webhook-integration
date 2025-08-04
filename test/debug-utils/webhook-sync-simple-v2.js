const { app } = require('@azure/functions');
const axios = require('axios');

// Simple webhook sync with detailed logging
app.http('webhook-sync-simple-v2', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Simple webhook sync v2 triggered');
        const logs = [];
        
        try {
            // Get credentials
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
            const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
            logs.push('Got credentials');
            
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
            logs.push('Got access token');
            
            // Get webhooks
            const webhooksResponse = await axios.get('https://graph.microsoft.com/v1.0/subscriptions', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const webhooks = webhooksResponse.data.value;
            logs.push(`Found ${webhooks.length} webhooks`);
            
            // Get existing items
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
                logs.push(`Found ${existingItems.length} existing items`);
            } catch (itemsError) {
                logs.push(`Error getting items: ${itemsError.message}`);
                logs.push(`Status: ${itemsError.response?.status}`);
                logs.push(`Data: ${JSON.stringify(itemsError.response?.data)}`);
            }
            
            // Try to sync first webhook only
            if (webhooks.length > 0) {
                const webhook = webhooks[0];
                logs.push(`Processing webhook: ${webhook.id}`);
                
                try {
                    // Extract site and list info
                    let listName = 'Unknown List';
                    let siteUrl = '';
                    let listIdValue = '';
                    
                    if (webhook.resource) {
                        const parts = webhook.resource.split('/lists/');
                        siteUrl = parts[0];
                        listIdValue = parts[1];
                        listName = `List ${listIdValue}`;
                    }
                    
                    const itemData = {
                        fields: {
                            Title: webhook.resource || 'Unknown Resource',
                            SubscriptionId: webhook.id,
                            ChangeType: webhook.changeType,
                            NotificationUrl: webhook.notificationUrl,
                            ExpirationDateTime: webhook.expirationDateTime,
                            Status: 'Active',
                            SiteUrl: siteUrl,
                            ListId: listIdValue,
                            ListName: listName,
                            AutoRenew: 'Yes',
                            NotificationCount: 0
                        }
                    };
                    
                    logs.push('Prepared item data');
                    
                    // Check if exists
                    const existing = existingItems.find(item => 
                        item.fields && item.fields.SubscriptionId === webhook.id
                    );
                    
                    if (existing) {
                        logs.push(`Webhook exists with ID: ${existing.id}`);
                        // Update
                        const updateUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${existing.id}`;
                        logs.push(`Update URL: ${updateUrl}`);
                        
                        try {
                            await axios.patch(updateUrl, itemData, {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json'
                                }
                            });
                            logs.push('Update successful');
                        } catch (updateError) {
                            logs.push(`Update error: ${updateError.message}`);
                            logs.push(`Update status: ${updateError.response?.status}`);
                            logs.push(`Update data: ${JSON.stringify(updateError.response?.data)}`);
                        }
                    } else {
                        logs.push('Webhook does not exist, creating new');
                        // Create
                        const createUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items`;
                        logs.push(`Create URL: ${createUrl}`);
                        
                        try {
                            const createResponse = await axios.post(createUrl, itemData, {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json'
                                }
                            });
                            logs.push(`Create successful, ID: ${createResponse.data.id}`);
                        } catch (createError) {
                            logs.push(`Create error: ${createError.message}`);
                            logs.push(`Create status: ${createError.response?.status}`);
                            logs.push(`Create data: ${JSON.stringify(createError.response?.data)}`);
                        }
                    }
                } catch (processError) {
                    logs.push(`Process error: ${processError.message}`);
                }
            }
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    logs: logs
                }, null, 2)
            };

        } catch (error) {
            logs.push(`Main error: ${error.message}`);
            return {
                status: 500,
                body: JSON.stringify({
                    success: false,
                    logs: logs,
                    error: error.message
                }, null, 2)
            };
        }
    }
});