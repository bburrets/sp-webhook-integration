/**
 * Test utility for UiPath queue submission
 * Use this to verify queue item submission is working correctly
 */

const { UiPathQueueClient } = require('../../../src/shared/uipath-queue-client');
const { config } = require('../../../src/shared/config');
const { createLogger } = require('../../../src/shared/logger');

async function testQueueSubmission(queueName = null, testData = null) {
    const mockContext = {
        log: console.log,
        log: { 
            error: console.error,
            warn: console.warn,
            info: console.log,
            verbose: console.log,
            metric: (name, value, properties) => {
                console.log(`METRIC: ${name} = ${value}`, properties);
            }
        }
    };

    const logger = createLogger(mockContext);

    console.log('\n📬 Testing UiPath Queue Submission');
    console.log('=====================================');

    const client = new UiPathQueueClient(mockContext);
    
    // Use provided queue name or default
    const targetQueue = queueName || config.uipath?.defaultQueue || 'COSTCORoutingForms';
    
    console.log(`\n🎯 Target Queue: ${targetQueue}`);

    // Prepare test data
    const testItem = testData || {
        Name: `Test_SharePoint_${Date.now()}`,
        Priority: 'Normal',
        SpecificContent: {
            // COSTCO-specific test data
            EmailConfig: {
                To: 'test@example.com',
                Subject: 'Test COSTCO Routing Form - PO TEST-001',
                Template: 'COSTCORoutingNotification'
            },
            ShipmentDetails: {
                ShipDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
                Style: 'TEST-STYLE-123',
                PONumber: 'TEST-PO-001',
                Status: 'Send Generated Form'
            },
            Attachment: {
                DocumentUrl: 'https://sharepoint.com/test/document.pdf',
                FileName: 'RoutingForm_PO_TEST-001.pdf',
                RequiresDownload: true
            },
            ProcessingInfo: {
                ProcessType: 'COSTCORoutingFormEmail',
                Priority: 'Normal',
                Source: 'SharePoint-Test',
                Timestamp: new Date().toISOString(),
                TestMode: true
            }
        },
        Reference: `TEST_${Date.now()}`
    };

    console.log('\n📦 Test Item Details:');
    console.log('  Name:', testItem.Name);
    console.log('  Priority:', testItem.Priority);
    console.log('  Reference:', testItem.Reference);
    console.log('  Email To:', testItem.SpecificContent.EmailConfig.To);
    console.log('  PO Number:', testItem.SpecificContent.ShipmentDetails.PONumber);

    try {
        console.log('\n⏳ Submitting to queue...');
        const startTime = Date.now();
        
        const result = await client.addQueueItem(targetQueue, testItem);
        
        const duration = Date.now() - startTime;
        
        console.log(`\n✅ Queue item added successfully! (${duration}ms)`);
        console.log('  Queue Item ID:', result.itemId);
        console.log('  Status:', result.status);
        
        // Try to retrieve the item back
        console.log('\n🔍 Retrieving submitted item...');
        try {
            const retrievedItem = await client.getQueueItem(targetQueue, result.itemId);
            
            if (retrievedItem) {
                console.log('  ✅ Item retrieved successfully!');
                console.log('  Item Status:', retrievedItem.Status);
                console.log('  Processing Status:', retrievedItem.ProcessingStatus || 'New');
            }
        } catch (error) {
            console.log('  ⚠️  Could not retrieve item (this is normal for some queue configurations)');
        }
        
        // Test COSTCO-specific submission
        console.log('\n🏭 Testing COSTCO-specific submission...');
        const costcoData = {
            fields: {
                Status: 'Send Generated Form',
                Ship_x0020_To_x0020_Email: 'costco.test@example.com',
                Ship_x0020_Date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                Style: 'COSTCO-STYLE-456',
                PO_x005f_no: 'COSTCO-PO-002',
                Generated_x0020_Routing_x0020_Form_x0020_URL: 'https://sharepoint.com/costco/routing.pdf'
            },
            id: 'test-item-123',
            listId: 'test-list-456'
        };
        
        const costcoResult = await client.submitCostcoItem(costcoData);
        
        if (costcoResult.success) {
            console.log('  ✅ COSTCO item submitted successfully!');
            console.log('  Queue Item ID:', costcoResult.itemId);
        }
        
        console.log('\n✅ All queue submission tests passed!');
        
        // Display queue information
        console.log('\n📊 Queue Information:');
        console.log(`  Queue Name: ${targetQueue}`);
        console.log(`  Orchestrator URL: ${client.orchestratorUrl}`);
        console.log(`  Tenant: ${client.tenantName}`);
        console.log(`  Organization Unit: ${client.organizationUnitId}`);
        
        return result;
        
    } catch (error) {
        console.error('\n❌ Queue submission failed:', error.message);
        
        if (error.response) {
            console.error('\nError details:');
            console.error('  Status:', error.response.status);
            console.error('  Data:', JSON.stringify(error.response.data, null, 2));
        }
        
        console.log('\n🔍 Troubleshooting tips:');
        console.log(`  1. Verify the queue "${targetQueue}" exists in UiPath Orchestrator`);
        console.log('  2. Check that your credentials have permission to add queue items');
        console.log('  3. Ensure the Organization Unit ID is correct');
        console.log('  4. Verify the queue is in the correct folder/organization unit');
        console.log('  5. Check the queue item schema matches your Specific Content structure');
        
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    // Get queue name from command line arguments
    const queueName = process.argv[2];
    
    if (process.argv.includes('--help')) {
        console.log('Usage: node test-uipath-queue.js [queue-name]');
        console.log('Example: node test-uipath-queue.js COSTCORoutingForms');
        process.exit(0);
    }
    
    testQueueSubmission(queueName).then(() => {
        console.log('\n✅ Test complete!');
    }).catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testQueueSubmission };