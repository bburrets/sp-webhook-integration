/**
 * Test UiPath queue submission directly
 */

const axios = require('axios');

async function testUiPathSubmission() {
    console.log('🧪 Testing UiPath Queue Submission');
    console.log('====================================\n');
    
    try {
        // Step 1: Authenticate
        console.log('Step 1: Authenticating...');
        const authResponse = await axios.post(
            'https://cloud.uipath.com/identity_/connect/token',
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: 'cb772a87-0f11-4764-bf71-ff2467f2a75a',
                client_secret: 'V4x70aA$6A)9ijAz6n?QO@CV9#MkR5j9q$EeRUW@PPPV6(HDe@8PN*Ps2$kydb)M',
                scope: 'OR.Queues.Write OR.Queues.Read'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        const token = authResponse.data.access_token;
        console.log('✅ Authenticated successfully\n');
        
        // Step 2: Create queue item payload
        console.log('Step 2: Creating queue item payload...');
        const queueItemPayload = {
            queueItemParameters: {
                Name: 'TEST_API',
                Priority: 'High',
                Reference: `TEST_${Date.now()}`,
                SpecificContent: {
                    ProcessType: 'COSTCO_INLINE_ROUTING',
                    QueueName: 'TEST_API',
                    TriggerSource: 'SharePoint Webhook',
                    ProcessedAt: new Date().toISOString(),
                    SharePointItemId: '11',
                    ShipToEmail: 'd962apt@costco.com',
                    ShipDate: '5/15/2025',
                    Style: 'BR007270',
                    PONumber: '9600505460, 9600505461',
                    Status: 'Send Generated Form',
                    TestNote: 'Direct API test from utility script'
                }
            }
        };
        
        console.log('Payload:', JSON.stringify(queueItemPayload, null, 2));
        console.log();
        
        // Step 3: Submit to queue
        console.log('Step 3: Submitting to UiPath queue...');
        const orchestratorUrl = 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_';
        const organizationUnitId = '376892';
        
        // Try with itemData wrapper as UiPath API might expect
        const apiPayload = {
            itemData: queueItemPayload.queueItemParameters
        };
        
        console.log('API Payload:', JSON.stringify(apiPayload, null, 2));
        
        const response = await axios.post(
            `${orchestratorUrl}/odata/Queues/UiPathODataSvc.AddQueueItem`,
            apiPayload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-UIPATH-OrganizationUnitId': organizationUnitId
                }
            }
        );
        
        console.log('✅ Queue item created successfully!');
        console.log('\nQueue Item Details:');
        console.log('-------------------');
        console.log(`ID: ${response.data.Id}`);
        console.log(`Key: ${response.data.Key}`);
        console.log(`Status: ${response.data.Status}`);
        console.log(`Priority: ${response.data.Priority}`);
        console.log(`Reference: ${response.data.Reference}`);
        console.log(`Created: ${response.data.CreationTime}`);
        console.log();
        
        // Step 4: Verify by fetching the item
        console.log('Step 4: Verifying queue item...');
        const verifyResponse = await axios.get(
            `${orchestratorUrl}/odata/QueueItems(${response.data.Id})`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-UIPATH-OrganizationUnitId': organizationUnitId
                }
            }
        );
        
        console.log('✅ Queue item verified:');
        console.log(`Status: ${verifyResponse.data.Status}`);
        console.log(`Queue Name: ${verifyResponse.data.QueueDefinitionId}`);
        
        // Check specific content
        if (verifyResponse.data.SpecificContent) {
            console.log('\nSpecific Content:');
            for (const [key, value] of Object.entries(verifyResponse.data.SpecificContent)) {
                console.log(`  ${key}: ${value}`);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Error occurred:');
        console.error('Status:', error.response?.status);
        console.error('Message:', error.response?.data?.message || error.message);
        console.error('Error details:', error.response?.data || error.message);
        
        if (error.response?.data?.validationErrors) {
            console.error('\nValidation Errors:');
            for (const err of error.response.data.validationErrors) {
                console.error(`  - ${err.memberNames?.join(', ')}: ${err.errorMessage}`);
            }
        }
    }
}

testUiPathSubmission().catch(console.error);