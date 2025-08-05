const axios = require('axios');
const { TableClient } = require("@azure/data-tables");

class DeltaTracker {
    constructor(connectionString) {
        this.tableClient = TableClient.fromConnectionString(
            connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING,
            "SharePointDeltaTokens"
        );
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            await this.tableClient.createTable(); // Creates if doesn't exist
            this.initialized = true;
        }
    }

    async getRecentChanges(context, notification, accessToken) {
        await this.initialize();
        
        try {
            // Parse resource to get site and list info
            const resourceParts = notification.resource.split('/');
            const siteId = resourceParts.slice(0, 3).join('/');
            const listId = resourceParts[4];
            
            // Get stored delta token
            const deltaKey = {
                partitionKey: 'delta',
                rowKey: `${siteId}_${listId}`.replace(/[/:]/g, '_')
            };
            
            let deltaUrl;
            try {
                const entity = await this.tableClient.getEntity(deltaKey.partitionKey, deltaKey.rowKey);
                deltaUrl = entity.deltaLink;
                context.log('Using stored delta link');
            } catch (error) {
                // No previous delta token
                deltaUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/delta`;
                context.log('No previous delta token, starting fresh');
            }
            
            // Query for changes
            const response = await axios.get(deltaUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            // Store new delta token
            if (response.data['@odata.deltaLink']) {
                await this.tableClient.upsertEntity({
                    partitionKey: deltaKey.partitionKey,
                    rowKey: deltaKey.rowKey,
                    deltaLink: response.data['@odata.deltaLink'],
                    lastUpdated: new Date().toISOString()
                });
            }
            
            // Return changed items
            return {
                changedItems: response.data.value || [],
                deltaLink: response.data['@odata.deltaLink']
            };
            
        } catch (error) {
            context.error('Delta query failed:', error);
            throw error;
        }
    }
}

module.exports = { DeltaTracker };