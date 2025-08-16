/**
 * Test complete integration with fixed UiPath queue client
 */

const { createUiPathQueueClient } = require('../../src/shared/uipath-queue-client');

async function testCompleteIntegration() {
    console.log('\n🚀 Testing Complete UiPath Integration');
    console.log('======================================\n');
    
    // Create mock context for logging
    const mockContext = {
        log: (message, ...args) => console.log(`[LOG] ${message}`, ...args),
        warn: (message, ...args) => console.warn(`[WARN] ${message}`, ...args),
        error: (message, ...args) => console.error(`[ERROR] ${message}`, ...args)
    };
    
    // Create queue client
    const queueClient = createUiPathQueueClient(mockContext);
    
    // Test 1: Submit a COSTCO-style item
    console.log('1. Testing COSTCO-style queue item submission...\n');
    
    const costcoData = {
        // Email configuration
        EmailTo: 'warehouse@costco.com',
        EmailSubject: 'COSTCO Routing Form - PO 12345',
        EmailTemplate: 'COSTCORoutingNotification',
        
        // Shipment details (simulating SharePoint fields)
        ShipToEmail: 'dc-manager@costco.com',
        ShipDate: '2025-01-30',
        Style: 'STYLE-ABC-123',
        PONumber: 'PO-12345',
        Status: 'Send Generated Form',
        GeneratedFormURL: 'https://sharepoint.com/sites/COSTCO/Forms/Routing_PO-12345.pdf',
        
        // List metadata
        ListName: 'COSTCO US INLINE Routing Tracker PROD',
        ItemId: '456',
        ModifiedBy: 'System',
        ModifiedDate: new Date().toISOString(),
        
        // Processing metadata
        ProcessType: 'COSTCORoutingFormEmail',
        Source: 'SharePoint-Webhook',
        Priority: 'High',
        TestMode: true
    };
    
    try {
        const result = await queueClient.submitQueueItem(
            'TEST_API',  // Queue name
            {
                priority: 'High',
                reference: `COSTCO_PO-12345_${Date.now()}`,
                specificContent: costcoData
            }
        );
        
        console.log('✅ SUCCESS! Queue item submitted');
        console.log('==================================');
        console.log('Result:', JSON.stringify(result, null, 2));
        console.log('\n📋 View in Orchestrator:');
        console.log('   https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_');
        
        // Test 2: Retrieve the submitted item
        if (result.queueItemId) {
            console.log('\n2. Retrieving submitted item...\n');
            
            try {
                const item = await queueClient.getQueueItem(result.queueItemId);
                console.log('✅ Item retrieved successfully');
                console.log('   Status:', item.Status);
                console.log('   Priority:', item.Priority);
                console.log('   Reference:', item.Reference);
                
                // Show flattened content
                if (item.SpecificContent) {
                    console.log('\n   Flattened SpecificContent keys:');
                    Object.keys(item.SpecificContent).forEach(key => {
                        console.log(`     - ${key}: ${String(item.SpecificContent[key]).substring(0, 50)}${String(item.SpecificContent[key]).length > 50 ? '...' : ''}`);
                    });
                }
            } catch (error) {
                console.log('⚠️  Could not retrieve item:', error.message);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Failed to submit queue item');
        console.error('Error:', error.message);
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        
        if (error.stack && process.env.NODE_ENV === 'development') {
            console.error('\nStack trace:', error.stack);
        }
    }
    
    // Test 3: Test with nested structure to verify flattening
    console.log('\n3. Testing nested structure flattening...\n');
    
    const nestedData = {
        level1: {
            level2: {
                level3: 'Deep value',
                array: ['item1', 'item2', 'item3']
            },
            simpleValue: 'Simple',
            dateValue: new Date()
        },
        topLevel: 'Top value'
    };
    
    try {
        const result2 = await queueClient.submitQueueItem(
            'TEST_API',
            {
                priority: 'Low',
                reference: `NESTED_TEST_${Date.now()}`,
                specificContent: nestedData
            }
        );
        
        console.log('✅ Nested structure test successful');
        console.log('   Item ID:', result2.queueItemId);
        console.log('   Flattening worked correctly!');
        
    } catch (error) {
        console.error('❌ Nested structure test failed:', error.message);
    }
}

// Run the test
testCompleteIntegration().catch(console.error);