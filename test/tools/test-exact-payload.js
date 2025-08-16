/**
 * Test the exact payload from the logs
 */

const axios = require('axios');

async function testExactPayload() {
    console.log('Testing exact payload from webhook logs...\n');
    
    // Authenticate
    const authResponse = await axios.post(
        'https://cloud.uipath.com/identity_/connect/token',
        new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: 'cb772a87-0f11-4764-bf71-ff2467f2a75a',
            client_secret: 'V4x70aA$6A)9ijAz6n?QO@CV9#MkR5j9q$EeRUW@PPPV6(HDe@8PN*Ps2$kydb)M',
            scope: 'OR.Queues.Write'
        })
    );
    
    const token = authResponse.data.access_token;
    console.log('✅ Authenticated\n');
    
    // Test 1: Simplified payload
    console.log('Test 1: Simplified payload (no Additional fields)...');
    const payload1 = {
        itemData: {
            Name: 'TEST_API',
            Priority: 'High',
            SpecificContent: {
                ProcessType: 'COSTCO_INLINE_ROUTING',
                ShipToEmail: 'd179apt@costco.com',
                PONumber: '1790505344, 1790505346',
                Style: 'BR007268',
                Status: 'Send Generated Form'
            },
            Reference: `COSTCO_SIMPLE_${Date.now()}`
        }
    };
    
    try {
        const response = await axios.post(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
            payload1,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        console.log(`✅ SUCCESS! ID: ${response.data.Id}\n`);
    } catch (error) {
        console.log(`❌ FAILED: ${error.response?.data?.message}\n`);
    }
    
    // Test 2: With problematic Reference field (commas)
    console.log('Test 2: Reference with commas...');
    const payload2 = {
        itemData: {
            Name: 'TEST_API',
            Priority: 'High',
            SpecificContent: {
                ProcessType: 'TEST',
                TestField: 'Value'
            },
            Reference: 'COSTCO_1790505344, 1790505346_5_1755334132776'
        }
    };
    
    try {
        const response = await axios.post(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
            payload2,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        console.log(`✅ SUCCESS! ID: ${response.data.Id}\n`);
    } catch (error) {
        console.log(`❌ FAILED: ${error.response?.data?.message}\n`);
    }
    
    // Test 3: With string "false" value
    console.log('Test 3: With string "false" in SpecificContent...');
    const payload3 = {
        itemData: {
            Name: 'TEST_API',
            Priority: 'High',
            SpecificContent: {
                ProcessType: 'TEST',
                Attachments: 'false',  // String false
                TestField: 'Value'
            },
            Reference: `TEST_STRING_FALSE_${Date.now()}`
        }
    };
    
    try {
        const response = await axios.post(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
            payload3,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        console.log(`✅ SUCCESS! ID: ${response.data.Id}\n`);
    } catch (error) {
        console.log(`❌ FAILED: ${error.response?.data?.message}\n`);
    }
}

testExactPayload().catch(console.error);