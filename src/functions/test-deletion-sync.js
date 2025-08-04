const { app } = require('@azure/functions');
const axios = require('axios');

// Test deletion sync functionality
app.http('test-deletion-sync', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';
            const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
            // Get test subscription ID from request
            const { subscriptionId } = await request.json();
            if (!subscriptionId) {
                return {
                    status: 400,
                    body: JSON.stringify({ error: 'subscriptionId is required' })
                };
            }
            
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
            
            context.log('Testing deletion sync for subscription:', subscriptionId);
            
            // Test the search query
            const searchUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields&$filter=fields/SubscriptionId eq '${subscriptionId}'`;
            
            context.log('Search URL:', searchUrl);
            
            try {
                const searchResponse = await axios.get(searchUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                
                context.log('Search response:', JSON.stringify(searchResponse.data, null, 2));
                
                if (searchResponse.data.value && searchResponse.data.value.length > 0) {
                    const item = searchResponse.data.value[0];
                    context.log('Found item:', item.id);
                    
                    // Try to update it
                    const updateUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${item.id}`;
                    
                    const updateResponse = await axios.patch(updateUrl, {
                        fields: {
                            Status: 'Deleted'
                        }
                    }, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    });
                    
                    return {
                        status: 200,
                        body: JSON.stringify({
                            message: 'Successfully updated item',
                            itemId: item.id,
                            updateResponse: updateResponse.data
                        })
                    };
                } else {
                    return {
                        status: 404,
                        body: JSON.stringify({
                            message: 'No item found with that subscription ID',
                            searchUrl: searchUrl
                        })
                    };
                }
            } catch (searchError) {
                return {
                    status: 500,
                    body: JSON.stringify({
                        error: 'Search/update failed',
                        message: searchError.message,
                        response: searchError.response?.data,
                        searchUrl: searchUrl
                    })
                };
            }
            
        } catch (error) {
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Fatal error',
                    message: error.message,
                    stack: error.stack
                })
            };
        }
    }
});