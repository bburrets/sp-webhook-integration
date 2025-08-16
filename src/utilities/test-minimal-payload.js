/**
 * Test minimal payload submission to UiPath
 */

const { createUiPathAuth } = require('../shared/uipath-auth');
const axios = require('axios');

async function testMinimalPayload() {
    console.log('Testing Minimal Payload to UiPath');
    console.log('==================================\n');
    
    try {
        // Authenticate
        const auth = createUiPathAuth();
        const token = await auth.authenticate();
        console.log('✅ Authenticated\n');
        
        // Minimal payload - only essential fields
        const minimalPayload = {
            itemData: {
                Name: 'TEST_API',
                Priority: 'High',
                SpecificContent: {
                    ProcessType: 'COSTCO_INLINE_ROUTING',
                    QueueName: 'COSTCO-INLINE-Routing',
                    TriggerSource: 'SharePoint_Webhook',
                    ProcessedAt: new Date().toISOString(),
                    SharePointItemId: '123',
                    ShipDate: '2025-05-13',
                    Style: 'BR007268',
                    PONumber: '2670505363',
                    Status: 'Send Generated Form',
                    Title: 'Test Item',
                    ModifiedDate: new Date().toISOString()
                },
                Reference: `MINIMAL_TEST_${Date.now()}`
            }
        };
        
        console.log('Payload structure:');
        console.log('  - Fields:', Object.keys(minimalPayload.itemData.SpecificContent));
        console.log('  - Field count:', Object.keys(minimalPayload.itemData.SpecificContent).length);
        console.log('  - No email fields');
        console.log('  - No hyperlink fields');
        console.log('  - No fields with @ symbols\n');
        
        // Submit to UiPath
        const orchestratorUrl = process.env.UIPATH_ORCHESTRATOR_URL || 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_';
        const orgUnitId = process.env.UIPATH_ORGANIZATION_UNIT_ID || '376892';
        const url = `${orchestratorUrl}/odata/Queues/UiPathODataSvc.AddQueueItem`;
        
        console.log('Submitting to UiPath...');
        const response = await axios.post(url, minimalPayload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-UIPATH-OrganizationUnitId': orgUnitId,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ SUCCESS! Queue item created');
        console.log('  - ID:', response.data.Id);
        console.log('  - Key:', response.data.Key);
        console.log('  - Reference:', response.data.Reference);
        console.log('  - Status:', response.data.Status);
        
    } catch (error) {
        if (error.response) {
            console.error('❌ FAILED:', error.response.data);
        } else {
            console.error('❌ Error:', error.message);
        }
    }
}

// Set environment variables
process.env.UIPATH_ORCHESTRATOR_URL = 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_';
process.env.UIPATH_TENANT_NAME = 'FAMBrands_RPAOPS_PROD';
process.env.UIPATH_CLIENT_ID = 'cb772a87-0f11-4764-bf71-ff2467f2a75a';
process.env.UIPATH_CLIENT_SECRET = 'V4x70aA$6A)9ijAz6n?QO@CV9#MkR5j9q$EeRUW@PPPV6(HDe@8PN*Ps2$kydb)M';
process.env.UIPATH_ORGANIZATION_UNIT_ID = '376892';

testMinimalPayload().catch(console.error);