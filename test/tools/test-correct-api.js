/**
 * Test with correct UiPath API endpoint structure
 */

const axios = require('axios');

async function testCorrectAPI() {
    console.log('\n🔍 Testing Correct UiPath API Structure');
    console.log('=======================================\n');
    
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
    
    // First, get the queue definition details
    console.log('1. Getting queue definition for TEST_API...');
    try {
        const queuesResponse = await axios.get(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/QueueDefinitions?$filter=Name eq \'TEST_API\'',
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-UIPATH-TenantName': 'FAMBrands_RPAOPS_PROD',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        
        if (queuesResponse.data.value && queuesResponse.data.value.length > 0) {
            const queue = queuesResponse.data.value[0];
            console.log('   Queue found:');
            console.log('   - Name:', queue.Name);
            console.log('   - ID:', queue.Id);
            console.log('   - Key:', queue.Key);
            console.log();
            
            // Try different API formats
            const tests = [
                {
                    name: 'Method 1: Using AddQueueItem with queue name',
                    url: 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
                    payload: {
                        queueName: 'TEST_API',
                        itemData: {
                            Priority: 'Normal',
                            SpecificContent: {
                                TestMessage: 'Using queue name',
                                Timestamp: new Date().toISOString()
                            }
                        }
                    }
                },
                {
                    name: 'Method 2: Using Key instead of ID',
                    url: `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues('${queue.Key}')/UiPathODataSvc.AddQueueItem`,
                    payload: {
                        itemData: {
                            Priority: 'Normal',
                            SpecificContent: {
                                TestMessage: 'Using queue key',
                                Timestamp: new Date().toISOString()
                            }
                        }
                    }
                },
                {
                    name: 'Method 3: Direct QueueItems with QueueDefinitionId',
                    url: 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/QueueItems',
                    payload: {
                        QueueDefinitionId: queue.Id,
                        Priority: 'Normal',
                        SpecificContent: {
                            TestMessage: 'Direct QueueItems',
                            Timestamp: new Date().toISOString()
                        }
                    }
                }
            ];
            
            for (const test of tests) {
                console.log(`Testing: ${test.name}`);
                console.log('   URL:', test.url);
                
                try {
                    const response = await axios.post(
                        test.url,
                        test.payload,
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                                'X-UIPATH-TenantName': 'FAMBrands_RPAOPS_PROD',
                                'X-UIPATH-OrganizationUnitId': '376892'
                            }
                        }
                    );
                    
                    console.log('   ✅ SUCCESS!');
                    console.log('   - Item ID:', response.data.Id);
                    console.log('   - Status:', response.data.Status);
                    console.log('   - Key:', response.data.Key);
                    console.log('\n🎉 Working method found! Use this structure.\n');
                    return;
                    
                } catch (error) {
                    console.log('   ❌ Failed:', error.response?.status, error.response?.data?.message || error.message);
                    if (error.response?.data?.error) {
                        console.log('      Error details:', error.response.data.error);
                    }
                }
                console.log();
            }
            
        } else {
            console.log('❌ TEST_API queue not found');
        }
        
    } catch (error) {
        console.error('Error getting queue:', error.response?.status, error.response?.data || error.message);
    }
    
    // Check if we have the right permissions
    console.log('2. Checking available endpoints...');
    try {
        const metadataResponse = await axios.get(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/$metadata',
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-UIPATH-TenantName': 'FAMBrands_RPAOPS_PROD',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        
        // Check if AddQueueItem action exists
        if (metadataResponse.data.includes('AddQueueItem')) {
            console.log('   ✅ AddQueueItem action is available');
        } else {
            console.log('   ⚠️ AddQueueItem action not found in metadata');
        }
        
    } catch (error) {
        console.log('   Could not fetch metadata:', error.response?.status);
    }
}

// Run
testCorrectAPI().catch(console.error);