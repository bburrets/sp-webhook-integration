const axios = require('axios');

class EnhancedForwarder {
    constructor(context, accessToken) {
        this.context = context;
        this.accessToken = accessToken;
    }
    
    // Parse enhanced clientState format
    parseClientState(clientState) {
        if (!clientState) return null;
        
        const parts = clientState.split(';');
        const config = {
            forwardUrl: null,
            mode: 'simple', // simple, withData, withChanges
            includeFields: null,
            excludeFields: null
        };
        
        parts.forEach(part => {
            const colonIndex = part.indexOf(':');
            if (colonIndex === -1) return;
            
            const key = part.substring(0, colonIndex);
            const value = part.substring(colonIndex + 1);
            
            switch(key) {
                case 'forward':
                    config.forwardUrl = value;
                    break;
                case 'mode':
                    config.mode = value; // simple, withData, withChanges
                    break;
                case 'includeFields':
                    config.includeFields = value.split(',');
                    break;
                case 'excludeFields':
                    config.excludeFields = value.split(',');
                    break;
            }
        });
        
        return config.forwardUrl ? config : null;
    }
    
    // Get current item data
    async getItemData(resource, itemId) {
        try {
            // If itemId is provided, get specific item
            if (itemId) {
                const itemUrl = `https://graph.microsoft.com/v1.0/${resource}/items/${itemId}?$expand=fields`;
                const response = await axios.get(itemUrl, {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                return response.data;
            }
            
            // Otherwise get recent items
            const listUrl = `https://graph.microsoft.com/v1.0/${resource}/items?$expand=fields&$orderby=lastModifiedDateTime desc&$top=5`;
            const response = await axios.get(listUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            // Return most recently modified item
            return response.data.value[0] || null;
        } catch (error) {
            this.context.error('Failed to get item data:', error.message);
            return null;
        }
    }
    
    // Get previous version if available
    async getPreviousVersion(resource, itemId) {
        try {
            // Try to get from Azure Table Storage if we're tracking states
            const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
            if (connectionString) {
                const { TableClient } = require('@azure/data-tables');
                const stateTable = TableClient.fromConnectionString(connectionString, 'SharePointItemStates');
                
                const partitionKey = resource.replace(/[/:]/g, '_');
                const rowKey = `item_${itemId}`;
                
                try {
                    const entity = await stateTable.getEntity(partitionKey, rowKey);
                    return JSON.parse(entity.previousState || '{}');
                } catch {
                    // No previous state found
                }
            }
            
            return null;
        } catch (error) {
            this.context.warn('Could not get previous version:', error.message);
            return null;
        }
    }
    
    // Compare two versions and identify changes
    compareVersions(current, previous) {
        const changes = {
            added: {},
            modified: {},
            removed: {}
        };
        
        if (!current || !previous) {
            return changes;
        }
        
        const currentFields = current.fields || {};
        const previousFields = previous.fields || {};
        
        // Check for added or modified fields
        for (const [key, value] of Object.entries(currentFields)) {
            if (!(key in previousFields)) {
                changes.added[key] = value;
            } else if (JSON.stringify(value) !== JSON.stringify(previousFields[key])) {
                changes.modified[key] = {
                    old: previousFields[key],
                    new: value
                };
            }
        }
        
        // Check for removed fields
        for (const key of Object.keys(previousFields)) {
            if (!(key in currentFields)) {
                changes.removed[key] = previousFields[key];
            }
        }
        
        return changes;
    }
    
    // Filter fields based on include/exclude lists
    filterFields(fields, includeFields, excludeFields) {
        if (!fields) return {};
        
        let filtered = { ...fields };
        
        // Apply include filter
        if (includeFields && includeFields.length > 0) {
            filtered = {};
            includeFields.forEach(field => {
                if (field in fields) {
                    filtered[field] = fields[field];
                }
            });
        }
        
        // Apply exclude filter
        if (excludeFields && excludeFields.length > 0) {
            excludeFields.forEach(field => {
                delete filtered[field];
            });
        }
        
        return filtered;
    }
    
    // Build enhanced payload based on mode
    async buildEnhancedPayload(notification, config) {
        const basePayload = {
            timestamp: new Date().toISOString(),
            source: 'SharePoint-Webhook-Proxy-Enhanced',
            notification: notification,
            metadata: {
                processedBy: process.env.WEBSITE_HOSTNAME || 'webhook-handler',
                forwardingMode: config.mode
            }
        };
        
        // Simple mode - just forward the notification
        if (config.mode === 'simple') {
            return basePayload;
        }
        
        // Get current item data
        const currentData = await this.getItemData(notification.resource);
        if (!currentData) {
            this.context.warn('Could not fetch current data, falling back to simple mode');
            return basePayload;
        }
        
        // Filter fields if configured
        const filteredFields = this.filterFields(
            currentData.fields,
            config.includeFields,
            config.excludeFields
        );
        
        // WithData mode - include current state
        if (config.mode === 'withData') {
            return {
                ...basePayload,
                currentState: {
                    id: currentData.id,
                    lastModified: currentData.lastModifiedDateTime,
                    webUrl: currentData.webUrl,
                    fields: filteredFields
                }
            };
        }
        
        // WithChanges mode - include current state and changes
        if (config.mode === 'withChanges') {
            const previousData = await this.getPreviousVersion(notification.resource, currentData.id);
            const changes = this.compareVersions(currentData, previousData);
            
            // Store current state for next comparison
            await this.storeCurrentState(notification.resource, currentData);
            
            return {
                ...basePayload,
                currentState: {
                    id: currentData.id,
                    lastModified: currentData.lastModifiedDateTime,
                    webUrl: currentData.webUrl,
                    fields: filteredFields
                },
                changes: {
                    summary: {
                        addedFields: Object.keys(changes.added).length,
                        modifiedFields: Object.keys(changes.modified).length,
                        removedFields: Object.keys(changes.removed).length
                    },
                    details: changes
                },
                previousState: previousData ? {
                    lastModified: previousData.lastModifiedDateTime,
                    fields: this.filterFields(
                        previousData.fields,
                        config.includeFields,
                        config.excludeFields
                    )
                } : null
            };
        }
        
        return basePayload;
    }
    
    // Store current state for future comparisons
    async storeCurrentState(resource, itemData) {
        try {
            const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
            if (!connectionString) return;
            
            const { TableClient } = require('@azure/data-tables');
            const stateTable = TableClient.fromConnectionString(connectionString, 'SharePointItemStates');
            
            const partitionKey = resource.replace(/[/:]/g, '_');
            const rowKey = `item_${itemData.id}`;
            
            const entity = {
                partitionKey,
                rowKey,
                resource,
                itemId: itemData.id,
                lastModified: itemData.lastModifiedDateTime,
                previousState: JSON.stringify(itemData),
                timestamp: new Date().toISOString()
            };
            
            await stateTable.upsertEntity(entity, 'Replace');
        } catch (error) {
            this.context.warn('Could not store item state:', error.message);
        }
    }
    
    // Main forwarding method
    async forward(notification, targetUrl, config) {
        try {
            const startTime = Date.now();
            
            // Build payload based on mode
            const payload = await this.buildEnhancedPayload(notification, config);
            
            // Log payload size
            const payloadSize = JSON.stringify(payload).length;
            this.context.log(`Forwarding enhanced payload (${payloadSize} bytes) to ${targetUrl}`);
            
            // Forward the enhanced payload
            const response = await axios.post(targetUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-SharePoint-Webhook': 'true',
                    'X-Forwarding-Mode': config.mode
                },
                timeout: 10000,
                validateStatus: () => true
            });
            
            const duration = Date.now() - startTime;
            
            this.context.log(`Enhanced forwarding completed in ${duration}ms with mode: ${config.mode}, status: ${response.status}`);
            
            // Log response details for debugging
            if (response.status !== 200) {
                this.context.warn(`Forwarding returned status ${response.status}: ${response.statusText}`);
            }
            
            return {
                success: response.status >= 200 && response.status < 300,
                status: response.status,
                duration,
                mode: config.mode,
                payloadSize
            };
            
        } catch (error) {
            this.context.error('Enhanced forwarding failed:', error);
            return {
                success: false,
                error: error.message,
                mode: config.mode
            };
        }
    }
}

module.exports = EnhancedForwarder;