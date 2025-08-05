const { app } = require('@azure/functions');
const axios = require('axios');

// Helper to discover SharePoint list details
app.http('discover-list', {
    methods: ['POST', 'GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Discovering SharePoint list');
        
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
            
            // Get site ID first
            const siteUrl = 'fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:';
            
            try {
                const siteResponse = await axios.get(
                    `https://graph.microsoft.com/v1.0/sites/${siteUrl}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Accept': 'application/json'
                        }
                    }
                );
                
                const siteId = siteResponse.data.id;
                context.log('Found site:', siteId);
                
                // Get all lists
                const listsResponse = await axios.get(
                    `https://graph.microsoft.com/v1.0/sites/${siteUrl}/lists`,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Accept': 'application/json'
                        }
                    }
                );
                
                // Find COSTCO list
                const costcoList = listsResponse.data.value.find(list => 
                    list.displayName && list.displayName.includes('COSTCO US INLINE Routing Tracker')
                );
                
                if (costcoList) {
                    return {
                        body: JSON.stringify({
                            found: true,
                            site: {
                                id: siteId,
                                url: siteUrl
                            },
                            list: {
                                id: costcoList.id,
                                name: costcoList.displayName,
                                webUrl: costcoList.webUrl,
                                resource: `sites/${siteUrl}/lists/${costcoList.id}`
                            },
                            webhookSetup: {
                                resource: `sites/${siteUrl}/lists/${costcoList.id}`,
                                notificationUrl: "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
                                changeType: "updated"
                            }
                        }, null, 2),
                        headers: { 'Content-Type': 'application/json' }
                    };
                } else {
                    // List all available lists
                    return {
                        body: JSON.stringify({
                            found: false,
                            site: {
                                id: siteId,
                                url: siteUrl
                            },
                            availableLists: listsResponse.data.value.map(list => ({
                                id: list.id,
                                name: list.displayName,
                                webUrl: list.webUrl
                            }))
                        }, null, 2),
                        headers: { 'Content-Type': 'application/json' }
                    };
                }
                
            } catch (error) {
                context.error('Error accessing site:', error.response?.data || error.message);
                return {
                    status: 404,
                    body: JSON.stringify({
                        error: 'Site not found or access denied',
                        site: siteUrl,
                        details: error.response?.data
                    })
                };
            }
            
        } catch (error) {
            context.error('Discovery failed:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Discovery failed',
                    message: error.message
                })
            };
        }
    }
});