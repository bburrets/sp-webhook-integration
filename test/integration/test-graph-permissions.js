const { app } = require('@azure/functions');
const axios = require('axios');

// Test Graph API permissions for SharePoint
app.http('test-graph-permissions', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            // Get access token
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = process.env.WEBHOOK_LIST_ID || '30516097-c58c-478c-b87f-76c8f6ce2b56';
            const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
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
            
            const results = {
                tokenAcquired: true,
                tests: []
            };
            
            // Test 1: Get site info
            try {
                const siteUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}`;
                const siteResponse = await axios.get(siteUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                results.tests.push({
                    test: 'Get Site Info',
                    status: 'success',
                    siteId: siteResponse.data.id,
                    siteName: siteResponse.data.name
                });
            } catch (error) {
                results.tests.push({
                    test: 'Get Site Info',
                    status: 'failed',
                    error: error.response?.data || error.message
                });
            }
            
            // Test 2: Get list info
            try {
                const listUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}`;
                const listResponse = await axios.get(listUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                results.tests.push({
                    test: 'Get List Info',
                    status: 'success',
                    listName: listResponse.data.name,
                    listId: listResponse.data.id
                });
            } catch (error) {
                results.tests.push({
                    test: 'Get List Info',
                    status: 'failed',
                    error: error.response?.data || error.message
                });
            }
            
            // Test 3: Get list items (read)
            try {
                const itemsUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$top=1`;
                const itemsResponse = await axios.get(itemsUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                results.tests.push({
                    test: 'Read List Items',
                    status: 'success',
                    itemCount: itemsResponse.data.value.length
                });
            } catch (error) {
                results.tests.push({
                    test: 'Read List Items',
                    status: 'failed',
                    error: error.response?.data || error.message
                });
            }
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(results, null, 2)
            };
            
        } catch (error) {
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Test failed',
                    details: error.message
                })
            };
        }
    }
});