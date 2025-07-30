const { app } = require('@azure/functions');
const axios = require('axios');

// Test access to webhook management list
app.http('test-management-list', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = '82a105da-8206-4bd0-851b-d3f2260043f4';
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
            
            // Test reading items
            const itemsUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=5`;
            const itemsResponse = await axios.get(itemsUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            // Test creating a simple item
            const testItem = {
                fields: {
                    Title: 'Test Webhook Entry',
                    SubscriptionId: 'test-' + Date.now(),
                    Status: 'Test',
                    ChangeType: 'created,updated',
                    NotificationUrl: 'https://example.com/webhook'
                }
            };
            
            const createUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items`;
            let createResult = null;
            
            try {
                const createResponse = await axios.post(createUrl, testItem, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                createResult = {
                    success: true,
                    itemId: createResponse.data.id
                };
            } catch (createError) {
                createResult = {
                    success: false,
                    error: createError.response?.data || createError.message
                };
            }
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    listAccess: 'success',
                    existingItems: itemsResponse.data.value.length,
                    createTest: createResult
                }, null, 2)
            };
            
        } catch (error) {
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Test failed',
                    details: error.response?.data || error.message
                })
            };
        }
    }
});