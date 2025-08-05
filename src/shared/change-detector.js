const { TableClient } = require("@azure/data-tables");

class ChangeDetector {
    constructor(connectionString) {
        this.tableClient = TableClient.fromConnectionString(
            connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING,
            "SharePointItemStates"
        );
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            await this.tableClient.createTable(); // Creates if doesn't exist
            this.initialized = true;
        }
    }

    async detectChanges(context, notification, currentItem) {
        await this.initialize();
        
        try {
            // Build storage key
            const partitionKey = `${notification.siteId || 'unknown'}_${notification.resource}`.replace(/[/:]/g, '_');
            const rowKey = String(notification.resourceData?.id || notification.subscriptionId);
            
            // Get previous state
            let previousState = null;
            try {
                const entity = await this.tableClient.getEntity(partitionKey, rowKey);
                previousState = JSON.parse(entity.itemState);
            } catch (error) {
                // No previous state exists
                context.log(`No previous state for item ${rowKey}`);
            }

            // Calculate changes
            const changes = this.compareStates(previousState, currentItem);
            
            // Save current state
            await this.saveState(partitionKey, rowKey, currentItem);
            
            return {
                hasChanges: changes.length > 0,
                changes: changes,
                previousVersion: previousState?.fields?._UIVersionString,
                currentVersion: currentItem.fields?._UIVersionString,
                isNewItem: !previousState
            };
            
        } catch (error) {
            context.error('Change detection failed:', error);
            return {
                hasChanges: false,
                changes: [],
                error: error.message
            };
        }
    }

    compareStates(previous, current) {
        const changes = [];
        
        if (!previous || !previous.fields) {
            return [{
                field: '_new_item',
                type: 'created',
                new: current.fields?.Title || 'New Item'
            }];
        }

        const previousFields = previous.fields;
        const currentFields = current.fields;

        // Compare each field
        for (const field in currentFields) {
            // Skip system fields
            if (field.startsWith('_') && field !== '_UIVersionString') continue;
            if (field.includes('@odata')) continue;
            
            const oldValue = previousFields[field];
            const newValue = currentFields[field];
            
            if (oldValue !== newValue) {
                changes.push({
                    field: field,
                    old: oldValue,
                    new: newValue,
                    type: this.getFieldType(field)
                });
            }
        }

        return changes;
    }

    getFieldType(fieldName) {
        // Determine field type based on name/value
        if (fieldName.toLowerCase().includes('date')) return 'date';
        if (fieldName.toLowerCase().includes('lookupid')) return 'lookup';
        if (fieldName === 'Title') return 'text';
        if (fieldName === '_UIVersionString') return 'version';
        return 'unknown';
    }

    async saveState(partitionKey, rowKey, item) {
        const entity = {
            partitionKey: partitionKey,
            rowKey: rowKey,
            itemState: JSON.stringify(item),
            lastModified: item.lastModifiedDateTime || new Date().toISOString(),
            version: item.fields?._UIVersionString || '1.0'
        };

        await this.tableClient.upsertEntity(entity);
    }

    async getStoredState(partitionKey, rowKey) {
        try {
            const entity = await this.tableClient.getEntity(partitionKey, rowKey);
            return JSON.parse(entity.itemState);
        } catch (error) {
            return null;
        }
    }

    async cleanupOldStates(daysToKeep = 30) {
        // Optional cleanup method
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const filter = `Timestamp lt datetime'${cutoffDate.toISOString()}'`;
        const iterator = this.tableClient.listEntities({ queryOptions: { filter } });
        
        for await (const entity of iterator) {
            await this.tableClient.deleteEntity(entity.partitionKey, entity.rowKey);
        }
    }
}

module.exports = { ChangeDetector };