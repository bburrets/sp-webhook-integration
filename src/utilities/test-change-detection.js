const { app } = require('@azure/functions');
const axios = require('axios');

// Test endpoint to verify change detection setup
app.http('test-change-detection', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Testing change detection configuration');
        
        const results = {
            timestamp: new Date().toISOString(),
            tests: []
        };
        
        // Test 1: Check environment variables
        results.tests.push({
            name: 'Environment Variables',
            storageConfigured: !!process.env.AZURE_STORAGE_CONNECTION_STRING,
            functionApp: process.env.WEBSITE_HOSTNAME || 'unknown'
        });
        
        // Test 2: Test parseClientState function
        const testClientStates = [
            'forward:https://webhook.site/test-123',
            'forward:https://webhook.site/test-123;detectChanges:true',
            'forward:https://webhook.site/test-123;detectChanges:true;fields:Title,Status'
        ];
        
        results.tests.push({
            name: 'ClientState Parsing',
            results: testClientStates.map(cs => {
                const parsed = parseClientState(cs);
                return {
                    input: cs,
                    parsed: parsed
                };
            })
        });
        
        // Test 3: Try to connect to Azure Table Storage
        if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
            try {
                const { TableClient } = require("@azure/data-tables");
                const tableClient = TableClient.fromConnectionString(
                    process.env.AZURE_STORAGE_CONNECTION_STRING,
                    "SharePointItemStates"
                );
                
                // Try to query the table
                const iterator = tableClient.listEntities({ maxPageSize: 1 });
                let count = 0;
                for await (const entity of iterator) {
                    count++;
                    break; // Just check if we can connect
                }
                
                results.tests.push({
                    name: 'Azure Table Storage',
                    connected: true,
                    tableName: 'SharePointItemStates'
                });
            } catch (error) {
                results.tests.push({
                    name: 'Azure Table Storage',
                    connected: false,
                    error: error.message
                });
            }
        }
        
        return {
            body: JSON.stringify(results, null, 2),
            headers: { 'Content-Type': 'application/json' }
        };
    }
});

// Helper function copied from webhook-handler
function parseClientState(clientState) {
    const options = {
        forwardUrl: '',
        detectChanges: false,
        fields: []
    };
    
    const parts = clientState.split(';');
    
    for (const part of parts) {
        const colonIndex = part.indexOf(':');
        if (colonIndex === -1) continue;
        
        const key = part.substring(0, colonIndex);
        const value = part.substring(colonIndex + 1);
        
        if (key === 'forward') {
            options.forwardUrl = value;
        } else if (key === 'detectChanges') {
            options.detectChanges = value === 'true';
        } else if (key === 'fields') {
            options.fields = value.split(',').map(f => f.trim());
        }
    }
    
    return options;
}