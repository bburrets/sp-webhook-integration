const { app } = require('@azure/functions');
const axios = require('axios');
const EnhancedForwarder = require('../../src/shared/enhanced-forwarder');

// Test enhanced forwarding directly
app.http('test-enhanced-forward', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Testing enhanced forwarding');
        
        try {
            const body = await request.json();
            const { targetUrl, mode = 'withChanges' } = body;
            
            // Get access token
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
            
            // Create test notification
            const testNotification = {
                subscriptionId: 'test-enhanced-' + Date.now(),
                clientState: `forward:${targetUrl};mode:${mode}`,
                resource: 'sites/fambrandsllc.sharepoint.com:/sites/DWI:/lists/9e35f709-48be-4995-8b28-79730ad12b89',
                tenantId: 'f6e7449b-d39b-4300-822f-79267def3ab3',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.ListItem'
                },
                changeType: 'updated'
            };
            
            // Create forwarder
            const forwarder = new EnhancedForwarder(context, accessToken);
            
            // Parse config
            const config = forwarder.parseClientState(testNotification.clientState);
            context.log('Parsed config:', config);
            
            // Build enhanced payload
            const payload = await forwarder.buildEnhancedPayload(testNotification, config);
            context.log('Enhanced payload built, size:', JSON.stringify(payload).length);
            
            // Try forwarding
            const result = await forwarder.forward(testNotification, targetUrl, config);
            
            return {
                body: JSON.stringify({
                    success: result.success,
                    result: result,
                    config: config,
                    payloadPreview: {
                        timestamp: payload.timestamp,
                        source: payload.source,
                        mode: config.mode,
                        hasCurrentState: !!payload.currentState,
                        hasChanges: !!payload.changes,
                        hasPreviousState: !!payload.previousState
                    },
                    targetUrl: targetUrl
                }, null, 2),
                headers: { 'Content-Type': 'application/json' }
            };
            
        } catch (error) {
            context.error('Test failed:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Test failed',
                    message: error.message,
                    stack: error.stack
                })
            };
        }
    }
});