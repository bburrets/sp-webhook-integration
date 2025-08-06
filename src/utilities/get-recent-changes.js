const { app } = require('@azure/functions');
const { DeltaTracker } = require('../shared/delta-tracker');
const { ChangeDetector } = require('../shared/change-detector');
const axios = require('axios');

// Separate endpoint to query recent changes without triggering webhooks
app.http('get-recent-changes', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Getting recent changes for list');
        
        try {
            const listId = request.query.get('listId');
            const minutes = parseInt(request.query.get('minutes') || '5');
            
            if (!listId) {
                return {
                    status: 400,
                    body: JSON.stringify({ error: 'listId parameter is required' })
                };
            }
            
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
            
            // Create mock notification object for delta tracker
            const mockNotification = {
                resource: `sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/${listId}`
            };
            
            // Use delta tracker to get recent changes
            const deltaTracker = new DeltaTracker();
            const result = await deltaTracker.getRecentChanges(context, mockNotification, accessToken);
            
            // Filter to only recently changed items
            const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
            const recentChanges = result.changedItems.filter(item => {
                const modifiedDate = new Date(item.lastModifiedDateTime);
                return modifiedDate > cutoffTime;
            });
            
            // For each item, try to detect what changed
            const changesWithDetails = [];
            const detector = new ChangeDetector();
            
            for (const item of recentChanges) {
                try {
                    const changeResult = await detector.detectChanges(
                        context,
                        { ...mockNotification, resourceData: { id: item.id } },
                        item
                    );
                    
                    changesWithDetails.push({
                        item: item,
                        changes: changeResult
                    });
                } catch (error) {
                    context.error('Failed to detect changes for item:', item.id);
                    changesWithDetails.push({
                        item: item,
                        changes: { error: error.message }
                    });
                }
            }
            
            return {
                body: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    listId: listId,
                    timeWindow: `${minutes} minutes`,
                    totalChanges: recentChanges.length,
                    changes: changesWithDetails
                }, null, 2),
                headers: { 'Content-Type': 'application/json' }
            };
            
        } catch (error) {
            context.error('Failed to get recent changes:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Failed to get recent changes',
                    message: error.message
                })
            };
        }
    }
});