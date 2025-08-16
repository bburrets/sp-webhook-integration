/**
 * Test with minimal queue item structure
 */

const axios = require('axios');

async function testMinimalQueue() {
    console.log('\n🔧 Testing Minimal Queue Item Submission');
    console.log('========================================\n');
    
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
    
    // Try different payload structures
    const tests = [
        {
            name: 'Method 1: itemData wrapper',
            payload: {
                queueName: 'TEST_API',
                itemData: {
                    Name: 'Test1',
                    Priority: 'Normal',
                    SpecificContent: {
                        Test: 'Value1'
                    }
                }
            }
        },
        {
            name: 'Method 2: Direct properties',
            payload: {
                queueName: 'TEST_API',
                Name: 'Test2',
                Priority: 'Normal',
                SpecificContent: {
                    Test: 'Value2'
                }
            }
        },
        {
            name: 'Method 3: Minimal',
            payload: {
                queueName: 'TEST_API',
                itemData: {
                    SpecificContent: {
                        Test: 'Value3'
                    }
                }
            }
        },
        {
            name: 'Method 4: Without Name',
            payload: {
                queueName: 'TEST_API',
                itemData: {
                    Priority: 'Normal',
                    SpecificContent: {
                        Test: 'Value4'
                    }
                }
            }
        }
    ];
    
    for (const test of tests) {
        console.log(`Testing: ${test.name}`);
        console.log('Payload:', JSON.stringify(test.payload, null, 2));
        
        try {
            const response = await axios.post(
                'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
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
            
            console.log('✅ SUCCESS!');
            console.log('   Item ID:', response.data.Id);
            console.log('   Status:', response.data.Status);
            console.log('   Key:', response.data.Key);
            console.log('\n🎉 This method works! Use this structure.\n');
            break;
            
        } catch (error) {
            console.log('❌ Failed:', error.response?.data?.message || error.message);
        }
        console.log();
    }
}

// Run
testMinimalQueue().catch(console.error);