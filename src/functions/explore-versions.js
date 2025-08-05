const { app } = require('@azure/functions');
const axios = require('axios');

async function getAccessToken() {
    const tokenEndpoint = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams();
    params.append('client_id', process.env.AZURE_CLIENT_ID);
    params.append('client_secret', process.env.AZURE_CLIENT_SECRET);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');
    
    const response = await axios.post(tokenEndpoint, params);
    return response.data.access_token;
}

app.http('explore-versions', {
    methods: ['GET', 'POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Exploring SharePoint version history capabilities');
        
        try {
            const accessToken = await getAccessToken();
            
            // Get item ID from query or body
            let itemId, listId;
            if (request.method === 'GET') {
                itemId = request.query.get('itemId');
                listId = request.query.get('listId') || '30516097-c58c-478c-b87f-76c8f6ce2b56';
            } else {
                const body = await request.json();
                itemId = body.itemId;
                listId = body.listId || '30516097-c58c-478c-b87f-76c8f6ce2b56';
            }
            const siteId = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
            
            const results = {
                timestamp: new Date().toISOString(),
                exploration: []
            };
            
            // Test 1: Check if versioning is enabled on the list
            try {
                const listResponse = await axios.get(
                    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}`,
                    {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    }
                );
                
                results.exploration.push({
                    test: 'List versioning settings',
                    success: true,
                    data: {
                        listName: listResponse.data.displayName,
                        listTemplate: listResponse.data.list?.template,
                        // Note: Graph API doesn't directly expose versioning settings
                        // This would need SharePoint REST API
                    }
                });
            } catch (error) {
                results.exploration.push({
                    test: 'List versioning settings',
                    success: false,
                    error: error.message
                });
            }
            
            // Test 2: Try to get versions for a specific item
            if (itemId) {
                try {
                    // First get the item
                    const itemResponse = await axios.get(
                        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}?expand=fields`,
                        {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        }
                    );
                    
                    results.exploration.push({
                        test: 'Current item state',
                        success: true,
                        data: {
                            id: itemResponse.data.id,
                            lastModified: itemResponse.data.lastModifiedDateTime,
                            fields: itemResponse.data.fields
                        }
                    });
                    
                    // Try to get versions - Note: This is not directly supported in Graph API v1.0
                    // Need to use SharePoint REST API
                    const spSiteUrl = 'https://fambrandsllc.sharepoint.com/sites/sphookmanagement';
                    const spApiUrl = `${spSiteUrl}/_api/web/lists(guid'${listId}')/items(${itemId})/versions`;
                    
                    const spResponse = await axios.get(spApiUrl, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Accept': 'application/json;odata=nometadata'
                        }
                    });
                    
                    results.exploration.push({
                        test: 'SharePoint REST API versions',
                        success: true,
                        data: {
                            versionCount: spResponse.data.value?.length || 0,
                            versions: spResponse.data.value?.map(v => ({
                                versionId: v.VersionId,
                                versionLabel: v.VersionLabel,
                                created: v.Created,
                                createdBy: v.CreatedBy?.Email
                            }))
                        }
                    });
                } catch (error) {
                    results.exploration.push({
                        test: 'Version history access',
                        success: false,
                        error: error.message,
                        details: error.response?.data
                    });
                }
            }
            
            // Test 3: Try delta query for change tracking
            try {
                const deltaResponse = await axios.get(
                    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/delta`,
                    {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    }
                );
                
                results.exploration.push({
                    test: 'Delta query support',
                    success: true,
                    data: {
                        deltaLink: deltaResponse.data['@odata.deltaLink'],
                        itemCount: deltaResponse.data.value?.length || 0,
                        sample: deltaResponse.data.value?.slice(0, 2)
                    }
                });
            } catch (error) {
                results.exploration.push({
                    test: 'Delta query support',
                    success: false,
                    error: error.message
                });
            }
            
            // Test 4: Check field types and metadata
            try {
                const columnsResponse = await axios.get(
                    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns`,
                    {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    }
                );
                
                results.exploration.push({
                    test: 'Column metadata for change tracking',
                    success: true,
                    data: {
                        columnCount: columnsResponse.data.value?.length || 0,
                        trackableColumns: columnsResponse.data.value?.filter(c => !c.readOnly).map(c => ({
                            name: c.name,
                            displayName: c.displayName,
                            type: c.columnGroup || c.type
                        }))
                    }
                });
            } catch (error) {
                results.exploration.push({
                    test: 'Column metadata',
                    success: false,
                    error: error.message
                });
            }
            
            // Summary and recommendations
            results.summary = {
                graphApiLimitations: [
                    "Graph API v1.0 doesn't directly support item version history",
                    "Need to use SharePoint REST API for version details",
                    "Delta query is supported and good for tracking changes"
                ],
                recommendations: [
                    "Use delta query for efficient change tracking",
                    "Store item snapshots for comparison if versions not available",
                    "Consider hybrid approach: Graph API for notifications, SP REST for versions"
                ],
                alternativeApproaches: [
                    "Use Graph API delta query with state storage",
                    "Implement custom versioning in Azure Table Storage",
                    "Use SharePoint REST API for lists with versioning enabled"
                ]
            };
            
            return { 
                body: JSON.stringify(results, null, 2),
                headers: { 'Content-Type': 'application/json' }
            };
            
        } catch (error) {
            context.error('Version exploration failed:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Version exploration failed',
                    message: error.message,
                    stack: error.stack
                }, null, 2)
            };
        }
    }
});