const { app } = require('@azure/functions');
const axios = require('axios');

// Simple endpoint to show recent changes without delta tracking
app.http('test-recent-changes', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Testing recent changes');
        
        try {
            // Get access token
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            
            const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
            const tokenParams = new URLSearchParams();
            tokenParams.append('client_id', clientId);
            tokenParams.append('client_secret', clientSecret);
            tokenParams.append('scope', 'https://graph.microsoft.com/.default');
            tokenParams.append('grant_type', 'client_credentials');
            
            const tokenResponse = await axios.post(tokenUrl, tokenParams);
            const accessToken = tokenResponse.data.access_token;
            
            // Get all items from the list
            const listUrl = `https://graph.microsoft.com/v1.0/sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/30516097-c58c-478c-b87f-76c8f6ce2b56/items?$expand=fields&$orderby=lastModifiedDateTime desc&$top=10`;
            
            const response = await axios.get(listUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            // Filter to recent changes
            const minutes = parseInt(request.query.get('minutes') || '5');
            const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
            
            const recentItems = response.data.value.filter(item => {
                const modifiedDate = new Date(item.lastModifiedDateTime);
                return modifiedDate > cutoffTime;
            });
            
            const result = {
                timestamp: new Date().toISOString(),
                timeWindow: `${minutes} minutes`,
                totalRecentChanges: recentItems.length,
                items: recentItems.map(item => ({
                    id: item.id,
                    lastModified: item.lastModifiedDateTime,
                    fields: {
                        Title: item.fields?.Title,
                        id: item.fields?.id,
                        Modified: item.fields?.Modified,
                        Editor: item.fields?.EditorLookupId
                    }
                }))
            };
            
            return {
                body: JSON.stringify(result, null, 2),
                headers: { 'Content-Type': 'application/json' }
            };
            
        } catch (error) {
            context.error('Failed to get recent changes:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Failed to get recent changes',
                    message: error.message,
                    details: error.response?.data
                })
            };
        }
    }
});