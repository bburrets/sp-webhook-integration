const { app } = require('@azure/functions');
const axios = require('axios');

app.http('test-webhook-creation', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Test webhook creation started');

        try {
            // Get request body
            const requestBody = await request.text();
            const data = JSON.parse(requestBody);
            
            context.log('Received data:', JSON.stringify(data, null, 2));
            
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

            const tokenResponse = await axios.post(tokenUrl, tokenParams, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            const accessToken = tokenResponse.data.access_token;
            
            // Create subscription with explicit clientState
            const subscription = {
                changeType: data.changeType || 'updated',
                notificationUrl: data.notificationUrl || 'https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler',
                resource: data.resource,
                expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                clientState: data.clientState
            };
            
            context.log('Sending subscription to Graph API:', JSON.stringify(subscription, null, 2));
            
            const response = await axios.post('https://graph.microsoft.com/v1.0/subscriptions', subscription, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            context.log('Graph API response:', JSON.stringify(response.data, null, 2));
            
            return {
                status: 200,
                body: JSON.stringify({
                    message: 'Test completed',
                    sentToGraph: subscription,
                    receivedFromGraph: response.data,
                    clientStateMatch: subscription.clientState === response.data.clientState
                })
            };
            
        } catch (error) {
            context.log.error('Test error:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: error.message,
                    details: error.response?.data
                })
            };
        }
    }
});