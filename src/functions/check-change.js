const { app } = require('@azure/functions');
const axios = require('axios');

// Quick function to check what changed in a list
app.http('check-change', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Checking recent changes');
        
        try {
            const body = await request.json();
            const { resource } = body;
            
            if (!resource) {
                return {
                    status: 400,
                    body: JSON.stringify({ error: 'resource parameter is required' })
                };
            }
            
            // Get Graph API token
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            
            const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
            const params = new URLSearchParams();
            params.append('client_id', clientId);
            params.append('client_secret', clientSecret);
            params.append('scope', 'https://graph.microsoft.com/.default');
            params.append('grant_type', 'client_credentials');
            
            const tokenResponse = await axios.post(tokenUrl, params);
            const accessToken = tokenResponse.data.access_token;
            
            // Build the list items URL
            const listUrl = `https://graph.microsoft.com/v1.0/${resource}/items?$expand=fields&$orderby=lastModifiedDateTime desc&$top=10`;
            
            context.log('Fetching recent items from:', listUrl);
            
            const response = await axios.get(listUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            // Get list details too
            const listDetailsUrl = `https://graph.microsoft.com/v1.0/${resource}`;
            const listResponse = await axios.get(listDetailsUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            const now = new Date();
            const recentItems = response.data.value.filter(item => {
                const modified = new Date(item.lastModifiedDateTime);
                const minutesAgo = (now - modified) / 1000 / 60;
                return minutesAgo <= 30;
            });
            
            return {
                body: JSON.stringify({
                    list: {
                        displayName: listResponse.data.displayName,
                        description: listResponse.data.description,
                        webUrl: listResponse.data.webUrl
                    },
                    totalItems: response.data.value.length,
                    recentChanges: recentItems.length,
                    items: recentItems.map(item => ({
                        id: item.id,
                        lastModified: item.lastModifiedDateTime,
                        minutesAgo: Math.round((now - new Date(item.lastModifiedDateTime)) / 1000 / 60),
                        fields: item.fields
                    }))
                }, null, 2),
                headers: { 'Content-Type': 'application/json' }
            };
            
        } catch (error) {
            context.error('Failed to check changes:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Failed to check changes',
                    message: error.message,
                    details: error.response?.data
                })
            };
        }
    }
});