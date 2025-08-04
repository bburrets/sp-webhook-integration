const { app } = require('@azure/functions');
const axios = require('axios');

// Debug version of webhook sync with detailed error logging
app.http('webhook-sync-debug-v2', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('=== WEBHOOK SYNC DEBUG V2 STARTED ===');
        const errors = [];
        const successes = [];

        try {
            // Get environment variables
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
            
            const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
            context.log('Environment check:', {
                hasClientId: !!clientId,
                hasClientSecret: !!clientSecret,
                hasTenantId: !!tenantId,
                listId: listId
            });

            if (!clientId || !clientSecret || !tenantId) {
                throw new Error('Missing required environment variables');
            }

            // Get access token
            context.log('Getting access token...');
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
            context.log('Access token obtained successfully');
            
            // Get all webhooks
            context.log('Getting webhooks...');
            const webhooksUrl = 'https://graph.microsoft.com/v1.0/subscriptions';
            const webhooksResponse = await axios.get(webhooksUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            const webhooks = webhooksResponse.data.value || [];
            context.log(`Found ${webhooks.length} webhooks`);
            
            // Get existing items from SharePoint list
            context.log('Getting existing SharePoint items...');
            let existingItems = [];
            try {
                const itemsUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
                const itemsResponse = await axios.get(itemsUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                existingItems = itemsResponse.data.value || [];
                context.log(`Found ${existingItems.length} existing SharePoint items`);
            } catch (itemsError) {
                errors.push({
                    stage: 'Get SharePoint Items',
                    error: itemsError.message,
                    response: itemsError.response?.data
                });
                context.log.error('Failed to get SharePoint items:', itemsError.message);
            }
            
            // Process each webhook
            for (let i = 0; i < webhooks.length; i++) {
                const webhook = webhooks[i];
                context.log(`Processing webhook ${i + 1}/${webhooks.length}: ${webhook.id}`);
                
                try {
                    // Extract info
                    let listName = 'Unknown List';
                    let siteUrl = '';
                    let listIdValue = '';
                    let resourceType = 'List';
                    
                    if (webhook.resource) {
                        const parts = webhook.resource.split('/lists/');
                        siteUrl = parts[0];
                        listIdValue = parts[1];
                        
                        context.log(`Webhook resource: ${webhook.resource}`);
                        context.log(`Site URL: ${siteUrl}`);
                        context.log(`List ID: ${listIdValue}`);
                        
                        // Try to get list details
                        try {
                            const sitePathForList = siteUrl.replace('sites/', '');
                            const listUrl = `https://graph.microsoft.com/v1.0/sites/${sitePathForList}/lists/${listIdValue}`;
                            
                            context.log(`Fetching list details from: ${listUrl}`);
                            
                            const listResponse = await axios.get(listUrl, {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Accept': 'application/json'
                                }
                            });
                            
                            listName = listResponse.data.displayName || listResponse.data.name || `List ${listIdValue}`;
                            
                            if (listResponse.data.list && listResponse.data.list.template === 'documentLibrary') {
                                resourceType = 'Library';
                            }
                            
                            context.log(`List name: ${listName}, Type: ${resourceType}`);
                            successes.push(`Got list details for ${listName}`);
                        } catch (listError) {
                            errors.push({
                                stage: 'Get List Details',
                                webhookId: webhook.id,
                                listId: listIdValue,
                                error: listError.message,
                                response: listError.response?.data
                            });
                            context.log.warn(`Could not fetch list details for ${listIdValue}:`, listError.message);
                        }
                    }
                    
                    // Create/update SharePoint item
                    const existingItem = existingItems.find(item => 
                        item.fields && item.fields.SubscriptionId === webhook.id
                    );
                    
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
                    
                    if (existingItem) {
                        // Update
                        const updateUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${existingItem.id}`;
                        context.log(`Updating item ${existingItem.id}...`);
                        
                        await axios.patch(updateUrl, itemData, {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            }
                        });
                        
                        successes.push(`Updated webhook ${webhook.id}`);
                    } else {
                        // Create
                        const createUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items`;
                        context.log('Creating new item...');
                        
                        await axios.post(createUrl, itemData, {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            }
                        });
                        
                        successes.push(`Created webhook ${webhook.id}`);
                    }
                } catch (webhookError) {
                    errors.push({
                        stage: 'Process Webhook',
                        webhookId: webhook.id,
                        error: webhookError.message,
                        response: webhookError.response?.data
                    });
                    context.log.error(`Failed to process webhook ${webhook.id}:`, webhookError.message);
                }
            }
            
            const result = {
                message: 'Sync debug completed',
                webhooksFound: webhooks.length,
                successes: successes,
                errors: errors,
                errorCount: errors.length,
                successCount: successes.length
            };
            
            context.log('=== WEBHOOK SYNC DEBUG V2 COMPLETED ===');
            context.log(JSON.stringify(result, null, 2));
            
            return {
                status: errors.length > 0 ? 207 : 200, // Multi-status if partial success
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(result, null, 2)
            };
            
        } catch (error) {
            const errorResult = {
                error: 'Fatal error in webhook sync',
                message: error.message,
                stack: error.stack,
                errors: errors
            };
            
            context.log.error('=== FATAL ERROR ===');
            context.log.error(JSON.stringify(errorResult, null, 2));
            
            return {
                status: 500,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(errorResult, null, 2)
            };
        }
    }
});