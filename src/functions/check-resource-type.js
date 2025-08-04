const { app } = require('@azure/functions');
const axios = require('axios');

// Function to check if a resource is a List or Document Library
app.http('check-resource-type', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            
            // Get list ID from query parameter
            const listId = request.query.get('listId');
            const siteUrl = request.query.get('siteUrl') || 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
            if (!listId) {
                return {
                    status: 400,
                    body: 'Please provide listId query parameter'
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
            
            // Get list details
            const listUrl = `https://graph.microsoft.com/v1.0/sites/${siteUrl}/lists/${listId}`;
            const listResponse = await axios.get(listUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            const list = listResponse.data;
            
            // Determine type based on template
            let resourceType = 'Unknown';
            if (list.list && list.list.template) {
                const template = list.list.template;
                if (template === 'documentLibrary') {
                    resourceType = 'Document Library';
                } else if (template === 'genericList') {
                    resourceType = 'List';
                } else {
                    resourceType = `${template} (${list.list.template})`;
                }
            }
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: list.id,
                    name: list.name,
                    displayName: list.displayName,
                    resourceType: resourceType,
                    template: list.list?.template,
                    webUrl: list.webUrl,
                    createdDateTime: list.createdDateTime,
                    lastModifiedDateTime: list.lastModifiedDateTime
                }, null, 2)
            };
            
        } catch (error) {
            return {
                status: error.response?.status || 500,
                body: JSON.stringify({
                    error: 'Failed to check resource type',
                    details: error.response?.data || error.message
                })
            };
        }
    }
});