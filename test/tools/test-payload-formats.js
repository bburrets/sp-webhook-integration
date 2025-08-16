/**
 * Test different UiPath payload formats to find the correct structure
 */

const axios = require('axios');

async function testPayloadFormats() {
    console.log('🧪 Testing UiPath Payload Formats');
    console.log('===================================\n');
    
    // Authenticate first
    const authResponse = await axios.post(
        'https://cloud.uipath.com/identity_/connect/token',
        new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: 'cb772a87-0f11-4764-bf71-ff2467f2a75a',
            client_secret: 'V4x70aA$6A)9ijAz6n?QO@CV9#MkR5j9q$EeRUW@PPPV6(HDe@8PN*Ps2$kydb)M',
            scope: 'OR.Queues.Write OR.Queues.Read'
        })
    );
    
    const token = authResponse.data.access_token;
    console.log('✅ Authenticated\n');
    
    const orchestratorUrl = 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_';
    const organizationUnitId = '376892';
    
    // Test different payload formats
    const payloads = [
        {
            name: 'Format 1: itemData wrapper',
            data: {
                itemData: {
                    Name: 'TEST_API',
                    Priority: 'High',
                    Reference: `FORMAT1_${Date.now()}`,
                    SpecificContent: {
                        TestField: 'Value1',
                        ProcessType: 'TEST'
                    }
                }
            }
        },
        {
            name: 'Format 2: queueItemParameters wrapper',
            data: {
                queueItemParameters: {
                    Name: 'TEST_API',
                    Priority: 'High',
                    Reference: `FORMAT2_${Date.now()}`,
                    SpecificContent: {
                        TestField: 'Value2',
                        ProcessType: 'TEST'
                    }
                }
            }
        },
        {
            name: 'Format 3: Direct properties',
            data: {
                Name: 'TEST_API',
                Priority: 'High',
                Reference: `FORMAT3_${Date.now()}`,
                SpecificContent: {
                    TestField: 'Value3',
                    ProcessType: 'TEST'
                }
            }
        }
    ];
    
    for (const payload of payloads) {
        console.log(`Testing ${payload.name}...`);
        console.log('Payload:', JSON.stringify(payload.data, null, 2));
        
        try {
            const response = await axios.post(
                `${orchestratorUrl}/odata/Queues/UiPathODataSvc.AddQueueItem`,
                payload.data,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'X-UIPATH-OrganizationUnitId': organizationUnitId
                    }
                }
            );
            
            console.log(`✅ SUCCESS! Queue item created: ${response.data.Id}`);
            console.log(`   Reference: ${response.data.Reference}`);
            console.log(`   Status: ${response.data.Status}\n`);
            
        } catch (error) {
            console.log(`❌ FAILED: ${error.response?.data?.message || error.message}`);
            if (error.response?.data) {
                console.log('   Error details:', JSON.stringify(error.response.data, null, 2));
            }
            console.log();
        }
    }
}

testPayloadFormats().catch(console.error);