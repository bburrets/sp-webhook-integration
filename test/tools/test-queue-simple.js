/**
 * Simple test for UiPath queue submission
 */

const axios = require('axios');

async function testQueueSubmission() {
    console.log('\n📬 Testing UiPath Queue Submission to TEST_API');
    console.log('==============================================\n');
    
    // Get token first
    console.log('1. Getting authentication token...');
    const tokenResponse = await axios.post(
        'https://cloud.uipath.com/identity_/connect/token',
        new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: 'cb772a87-0f11-4764-bf71-ff2467f2a75a',
            client_secret: 'V4x70aA$6A)9ijAz6n?QO@CV9#MkR5j9q$EeRUW@PPPV6(HDe@8PN*Ps2$kydb)M'
        }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );
    
    const token = tokenResponse.data.access_token;
    console.log('✅ Token obtained successfully\n');
    
    // Prepare queue item
    const queueItem = {
        itemData: {
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
        }
    };
    
    console.log('2. Queue Item Details:');
    console.log('   Name:', queueItem.itemData.Name);
    console.log('   Priority:', queueItem.itemData.Priority);
    console.log('   Reference:', queueItem.itemData.Reference);
    console.log('   Email To:', queueItem.itemData.SpecificContent.EmailConfig.To);
    console.log('   PO Number:', queueItem.itemData.SpecificContent.ShipmentDetails.PONumber);
    console.log();
    
    try {
        console.log('3. Submitting to TEST_API queue...');
        
        const response = await axios.post(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
            {
                queueName: 'TEST_API',
                ...queueItem
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-UIPATH-TenantName': 'FAMBrands_RPAOPS_PROD',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        
        console.log('\n✅ SUCCESS! Queue item added');
        console.log('   Queue Item ID:', response.data.Id);
        console.log('   Status:', response.data.Status);
        console.log('   Created:', response.data.CreationTime);
        console.log('\n🎉 The item should now be visible in your UiPath Orchestrator TEST_API queue!');
        
    } catch (error) {
        console.error('\n❌ Failed to add queue item:');
        console.error('   Status:', error.response?.status);
        console.error('   Error:', error.response?.data || error.message);
        
        if (error.response?.status === 404) {
            console.log('\n💡 Troubleshooting tips:');
            console.log('   1. Verify the queue "TEST_API" exists in folder 376892');
            console.log('   2. Check that the External Application has access to this folder');
            console.log('   3. Ensure the queue is active and not deleted');
        }
    }
}

// Run the test
testQueueSubmission().catch(console.error);