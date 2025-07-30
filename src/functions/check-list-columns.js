const { app } = require('@azure/functions');
const axios = require('axios');

// Check what columns exist in the webhook management list
app.http('check-list-columns', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            const listId = '82a105da-8206-4bd0-851b-d3f2260043f4'; // Webhook management list
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
            
            // Get list columns
            const columnsUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/columns`;
            const columnsResponse = await axios.get(columnsUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            const columns = columnsResponse.data.value
                .filter(col => !col.readOnly && col.name !== 'ContentType')
                .map(col => ({
                    name: col.name,
                    displayName: col.displayName,
                    type: col.columnDefinition ? Object.keys(col.columnDefinition)[0] : 'unknown'
                }));
            
            // Get a sample item to see field names
            const itemsUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=1`;
            const itemsResponse = await axios.get(itemsUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            const sampleFields = itemsResponse.data.value.length > 0 
                ? Object.keys(itemsResponse.data.value[0].fields).filter(f => !f.startsWith('@'))
                : [];
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    listId: listId,
                    listName: 'Webhook Management List',
                    columns: columns,
                    sampleFields: sampleFields,
                    totalColumns: columns.length
                }, null, 2)
            };
            
        } catch (error) {
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Failed to get list columns',
                    details: error.response?.data || error.message
                })
            };
        }
    }
});