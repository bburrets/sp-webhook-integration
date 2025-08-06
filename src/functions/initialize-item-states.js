const { app } = require('@azure/functions');
const axios = require('axios');
const { TableClient } = require('@azure/data-tables');

// Initialize states for all items in a list
app.http('initialize-item-states', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Initializing item states');
        
        try {
            const body = await request.json();
            const { resource } = body;
            
            if (!resource) {
                return {
                    status: 400,
                    body: JSON.stringify({ error: 'Resource parameter required' })
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
            
            // Get all items from the list
            const listUrl = `https://graph.microsoft.com/v1.0/${resource}/items?$expand=fields&$top=999`;
            const response = await axios.get(listUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            const items = response.data.value || [];
            context.log(`Found ${items.length} items to initialize`);
            
            // Initialize Azure Table Storage
            const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
            if (!connectionString) {
                return {
                    status: 500,
                    body: JSON.stringify({ error: 'Azure Storage not configured' })
                };
            }
            
            const stateTable = TableClient.fromConnectionString(connectionString, 'SharePointItemStates');
            
            // Create table if it doesn't exist
            try {
                await stateTable.createTable();
                context.log('Created SharePointItemStates table');
            } catch (error) {
                if (error.statusCode !== 409) { // Table already exists
                    throw error;
                }
            }
            
            // Store state for each item
            let initialized = 0;
            for (const item of items) {
                try {
                    const partitionKey = resource.replace(/[/:]/g, '_');
                    const rowKey = `item_${item.id}`;
                    
                    // Check if state already exists
                    try {
                        await stateTable.getEntity(partitionKey, rowKey);
                        context.log(`State already exists for item ${item.id}, skipping`);
                        continue;
                    } catch (error) {
                        // State doesn't exist, proceed to create
                    }
                    
                    const entity = {
                        partitionKey,
                        rowKey,
                        resource,
                        itemId: item.id,
                        lastModified: item.lastModifiedDateTime,
                        previousState: JSON.stringify(item),
                        timestamp: new Date().toISOString()
                    };
                    
                    await stateTable.createEntity(entity);
                    initialized++;
                    context.log(`Initialized state for item ${item.id}`);
                } catch (error) {
                    context.error(`Failed to initialize state for item ${item.id}:`, error.message);
                }
            }
            
            return {
                body: JSON.stringify({
                    success: true,
                    message: `Initialized states for ${initialized} items out of ${items.length} total`,
                    resource: resource
                }, null, 2),
                headers: { 'Content-Type': 'application/json' }
            };
            
        } catch (error) {
            context.error('Initialization failed:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Failed to initialize states',
                    message: error.message
                })
            };
        }
    }
});