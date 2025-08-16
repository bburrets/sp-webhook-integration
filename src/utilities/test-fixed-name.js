/**
 * Test with corrected Name field
 */

const axios = require('axios');

async function testFixedName() {
    console.log('\n✅ Testing with Correct Name Field');
    console.log('===================================\n');
    
    // Get token
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
    console.log('✅ Token obtained\n');
    
    // The Name field in itemData should be the queue name!
    const payload = {
        itemData: {
            Name: 'TEST_API',  // This should be the queue name
            Priority: 'Normal',
            SpecificContent: {
                EmailConfig: {
                    To: 'test@example.com',
                    Subject: 'COSTCO Routing Form - Test',
                    Template: 'COSTCORoutingNotification'
                },
                ShipmentDetails: {
                    ShipDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    Style: 'TEST-STYLE-123',
                    PONumber: 'TEST-PO-001',
                    Status: 'Send Generated Form'
                },
                Attachment: {
                    DocumentUrl: 'https://sharepoint.com/test/document.pdf',
                    FileName: 'RoutingForm_TEST-PO-001.pdf'
                },
                ProcessInfo: {
                    ProcessType: 'COSTCORoutingFormEmail',
                    Source: 'SharePoint-Webhook',
                    Timestamp: new Date().toISOString()
                }
            },
            Reference: `COSTCO_TEST_${Date.now()}`
        }
    };
    
    console.log('Testing with corrected payload...');
    console.log('Queue Name in itemData.Name:', payload.itemData.Name);
    console.log('Reference:', payload.itemData.Reference);
    
    try {
        const response = await axios.post(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        
        console.log('\n🎉 SUCCESS! Queue item added to TEST_API');
        console.log('=====================================');
        console.log('Queue Item Details:');
        console.log('  ID:', response.data.Id);
        console.log('  Key:', response.data.Key);
        console.log('  Status:', response.data.Status);
        console.log('  Priority:', response.data.Priority);
        console.log('  Reference:', response.data.Reference);
        console.log('  Created:', response.data.CreationTime);
        console.log('\n✅ The item is now in your UiPath Orchestrator TEST_API queue!');
        console.log('   View it at: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_');
        
    } catch (error) {
        console.log('\n❌ Failed to add queue item');
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data?.message || error.response?.data || error.message);
        
        if (error.response?.data?.errorCode === 1002) {
            console.log('\n💡 Error 1002 means the queue name in itemData.Name does not exist.');
            console.log('   Make sure "TEST_API" queue exists in folder 376892');
        }
    }
}

// Run
testFixedName().catch(console.error);