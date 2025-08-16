/**
 * Test using queue ID instead of name
 */

const axios = require('axios');

async function testQueueById() {
    console.log('\n🎯 Testing Queue Submission by ID');
    console.log('==================================\n');
    
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
    
    // TEST_API Queue ID from previous listing: 72425
    const queueId = 72425;
    
    console.log('Using Queue ID:', queueId, '(TEST_API)\n');
    
    // Method 1: Try with queue ID in URL
    console.log('Method 1: Using queue ID in AddQueueItem...');
    try {
        const response = await axios.post(
            `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues(${queueId})/UiPathODataSvc.AddQueueItem`,
            {
                itemData: {
                    Priority: 'Normal',
                    SpecificContent: {
                        Message: 'Test using queue ID',
                        Timestamp: new Date().toISOString()
                    }
                }
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
        
        console.log('✅ SUCCESS with queue ID!');
        console.log('   Item ID:', response.data.Id);
        console.log('   Status:', response.data.Status);
        return;
        
    } catch (error) {
        console.log('❌ Failed:', error.response?.status, error.response?.data?.message || error.message);
    }
    
    // Method 2: Try different API structure
    console.log('\nMethod 2: Using QueueItems endpoint directly...');
    try {
        const response = await axios.post(
            `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/QueueItems`,
            {
                QueueDefinitionId: queueId,
                Priority: 'Normal',
                SpecificContent: JSON.stringify({
                    Message: 'Test via QueueItems endpoint',
                    Timestamp: new Date().toISOString()
                }),
                Status: 'New'
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
        
        console.log('✅ SUCCESS with QueueItems endpoint!');
        console.log('   Item ID:', response.data.Id);
        console.log('   Status:', response.data.Status);
        return;
        
    } catch (error) {
        console.log('❌ Failed:', error.response?.status, error.response?.data?.message || error.message);
    }
    
    // Method 3: Check permissions
    console.log('\nMethod 3: Checking user/robot permissions...');
    try {
        const response = await axios.get(
            `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Sessions`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-UIPATH-TenantName': 'FAMBrands_RPAOPS_PROD',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        
        console.log('Current sessions:', response.data['@odata.count'] || 0);
        
    } catch (error) {
        console.log('Could not check sessions:', error.response?.status);
    }
    
    // Method 4: Try with different folder context
    console.log('\nMethod 4: Without Organization Unit header...');
    try {
        const response = await axios.post(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
            {
                queueName: 'TEST_API',
                itemData: {
                    Priority: 'Normal',
                    SpecificContent: {
                        Test: 'Without org unit'
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-UIPATH-TenantName': 'FAMBrands_RPAOPS_PROD'
                    // No Organization Unit header
                }
            }
        );
        
        console.log('✅ SUCCESS without org unit header!');
        console.log('   Item ID:', response.data.Id);
        console.log('   Status:', response.data.Status);
        
    } catch (error) {
        console.log('❌ Failed:', error.response?.data?.message || error.message);
    }
}

// Run
testQueueById().catch(console.error);