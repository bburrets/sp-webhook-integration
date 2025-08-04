const { app } = require('@azure/functions');
const axios = require('axios');

// Alternative sync using Microsoft Graph API instead of SharePoint REST API
app.http('webhook-sync-graph', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Webhook sync via Graph API triggered');

        try {
            // Get environment variables
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            
            if (!clientId || !clientSecret || !tenantId) {
                return {
                    status: 500,
                    body: JSON.stringify({
                        error: 'Missing required environment variables'
                    })
                };
            }

            // Get access token
            const accessToken = await getAccessToken(clientId, clientSecret, tenantId, context);
            
            // Get all webhooks from Microsoft Graph
            const webhooks = await getWebhooks(accessToken, context);
            
            // For now, just return the webhooks we found
            // This helps us verify the auth is working
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Webhooks retrieved successfully',
                    webhooksFound: webhooks.length,
                    webhooks: webhooks.map(w => ({
                        id: w.id,
                        resource: w.resource,
                        expirationDateTime: w.expirationDateTime,
                        changeType: w.changeType
                    }))
                })
            };

        } catch (error) {
            context.log.error('Error in webhook sync:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Sync failed',
                    details: error.message,
                    stack: error.stack
                })
            };
        }
    }
});

async function getAccessToken(clientId, clientSecret, tenantId, context) {
    try {
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

        return tokenResponse.data.access_token;
    } catch (error) {
        context.log.error('Error getting access token:', error);
        throw new Error('Failed to obtain access token');
    }
}

async function getWebhooks(accessToken, context) {
    try {
        const response = await axios.get('https://graph.microsoft.com/v1.0/subscriptions', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        context.log(`Found ${response.data.value.length} webhooks`);
        return response.data.value;
    } catch (error) {
        context.log.error('Error getting webhooks:', error);
        throw error;
    }
}