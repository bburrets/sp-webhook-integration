const { app } = require('@azure/functions');
const axios = require('axios');

// Test minimal update to SharePoint list
app.http('test-minimal-update', {
    methods: ['POST'],
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
            
            // Get one item
            const itemsUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=1`;
            const itemsResponse = await axios.get(itemsUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            if (itemsResponse.data.value.length === 0) {
                return {
                    status: 404,
                    body: 'No items found'
                };
            }
            
            const item = itemsResponse.data.value[0];
            const itemId = item.id;
            
            // Try minimal update - just Status field
            const updateUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${itemId}`;
            
            const updateData = {
                fields: {
                    Status: 'Test Update'
                }
            };
            
            try {
                const updateResponse = await axios.patch(updateUrl, updateData, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                
                return {
                    status: 200,
                    body: JSON.stringify({
                        success: true,
                        itemId: itemId,
                        updateResponse: updateResponse.data
                    }, null, 2)
                };
            } catch (updateError) {
                return {
                    status: updateError.response?.status || 500,
                    body: JSON.stringify({
                        success: false,
                        itemId: itemId,
                        error: updateError.response?.data || updateError.message,
                        updateData: updateData
                    }, null, 2)
                };
            }
            
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