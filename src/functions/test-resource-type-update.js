const { app } = require('@azure/functions');
const axios = require('axios');

// Test updating ResourceType field
app.http('test-resource-type-update', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = '82a105da-8206-4bd0-851b-d3f2260043f4';
            const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
            // Get the ResourceType value to test from query
            const resourceType = request.query.get('resourceType') || 'List';
            
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
            
            // Get first item
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
            
            // Try updating with ResourceType
            const updateUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${itemId}`;
            
            const updateData = {
                fields: {
                    ResourceType: resourceType
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
                        resourceType: resourceType,
                        response: updateResponse.data
                    }, null, 2)
                };
            } catch (updateError) {
                return {
                    status: updateError.response?.status || 500,
                    body: JSON.stringify({
                        success: false,
                        itemId: itemId,
                        resourceType: resourceType,
                        error: updateError.response?.data || updateError.message
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