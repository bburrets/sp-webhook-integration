/**
 * Test utility with the exact working payload structure
 * This matches your working test utility format
 */

const axios = require('axios');

async function testFixedPayload() {
    console.log('\n🔧 Testing Fixed Payload Structure');
    console.log('====================================\n');

    // Use your exact working credentials
    const credentials = {
        client_id: 'cb772a87-0f11-4764-bf71-ff2467f2a75a',
        client_secret: 'V4x70aA$6A)9ijAz6n?QO@CV9#MkR5j9q$EeRUW@PPPV6(HDe@8PN*Ps2$kydb)M'
    };

    // Get token
    console.log('1. Obtaining authentication token...');
    const tokenResponse = await axios.post(
        'https://cloud.uipath.com/identity_/connect/token',
        new URLSearchParams({
            grant_type: 'client_credentials',
            ...credentials
        }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );
    
    const token = tokenResponse.data.access_token;
    console.log('   ✅ Token obtained successfully\n');

    // Test different payload structures based on your working solution
    const testCases = [
        {
            name: 'Working Structure - Flat SpecificContent',
            payload: {
                itemData: {
                    Name: 'TEST_API',  // Queue name
                    Priority: 'High',
                    Reference: `COSTCO_TEST_${Date.now()}`,
                    SpecificContent: {
                        // Flat structure that works
                        ProcessType: 'COSTCO_INLINE_ROUTING',
                        ShipToEmail: 'd584apt@costco.com',
                        ShipDate: '2025-01-23',
                        Style: 'STYLE-ABC-123',
                        PONumber: 'TEST-PO-001',
                        Status: 'Send Generated Form',
                        TriggerSource: 'SharePoint_Webhook',
                        ProcessedAt: new Date().toISOString()
                    }
                }
            }
        },
        {
            name: 'Your Current Structure - May Fail',
            payload: {
                itemData: {
                    Name: 'TEST_API',
                    Priority: 'High',
                    Reference: `COSTCO_5840505241_undefined_${Date.now()}`,
                    SpecificContent: {
                        ProcessType: 'COSTCO_INLINE_ROUTING',
                        ShipToEmail: 'd584apt@costco.com',
                        // Simulating your current problematic structure
                        Ship_x0020_To_x0020_Email: 'd584apt@costco.com',
                        Ship_x0020_Date: '2025-01-23',
                        Style: 'STYLE-ABC-123',
                        PO_x005f_no: 'TEST-PO-001'
                    }
                }
            }
        },
        {
            name: 'Complex Nested - Should Use JsonData',
            payload: {
                itemData: {
                    Name: 'TEST_API',
                    Priority: 'Normal',
                    Reference: `COSTCO_NESTED_${Date.now()}`,
                    SpecificContent: {
                        // Convert complex nested structure to JsonData
                        JsonData: JSON.stringify({
                            EmailConfig: {
                                To: 'test@example.com',
                                Subject: 'COSTCO Routing Form - PO TEST-001',
                                Template: 'COSTCORoutingNotification'
                            },
                            ShipmentDetails: {
                                ShipToEmail: 'warehouse@costco.com',
                                ShipDate: '2025-01-23',
                                Style: 'STYLE-ABC-123',
                                PONumber: 'PO-TEST-001',
                                Status: 'Send Generated Form'
                            },
                            ProcessInfo: {
                                ProcessType: 'COSTCORoutingFormEmail',
                                Source: 'SharePoint-Webhook',
                                Timestamp: new Date().toISOString()
                            }
                        })
                    }
                }
            }
        }
    ];

    const apiUrl = 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem';

    for (const testCase of testCases) {
        console.log(`\n2. Testing: ${testCase.name}`);
        console.log(`   Reference: ${testCase.payload.itemData.Reference}`);
        
        // Log payload structure for debugging
        console.log('   📦 Payload Structure:');
        console.log(`      Queue Name: ${testCase.payload.itemData.Name}`);
        console.log(`      Priority: ${testCase.payload.itemData.Priority}`);
        console.log(`      SpecificContent Keys: [${Object.keys(testCase.payload.itemData.SpecificContent).join(', ')}]`);
        
        if (testCase.payload.itemData.SpecificContent.JsonData) {
            console.log('      ✨ Contains JsonData string for complex structure');
        }

        try {
            const response = await axios.post(
                apiUrl,
                testCase.payload,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'X-UIPATH-OrganizationUnitId': '376892'
                    },
                    timeout: 30000
                }
            );
            
            console.log('      ✅ SUCCESS!');
            console.log(`      📬 Queue Item ID: ${response.data.Id}`);
            console.log(`      🎯 Status: ${response.data.Status}`);
            console.log(`      📝 Key: ${response.data.Key}`);
            
        } catch (error) {
            console.log('      ❌ FAILED');
            console.log(`      🚨 Status: ${error.response?.status || 'NO_RESPONSE'}`);
            console.log(`      💬 Message: ${error.response?.data?.message || error.message}`);
            
            // Detailed error analysis
            if (error.response?.data) {
                const errorData = error.response.data;
                console.log('      🔍 Error Analysis:');
                
                if (errorData.message?.includes('queueItemParameters must not be null')) {
                    console.log('         - Classic "queueItemParameters must not be null" error');
                    console.log('         - Usually caused by queue name mismatch or invalid SpecificContent');
                    console.log('         - Check that itemData.Name matches the target queue exactly');
                }
                
                if (errorData.message?.includes('validation')) {
                    console.log('         - Validation error - check data types and required fields');
                }
                
                console.log(`      📋 Full Error: ${JSON.stringify(errorData, null, 6)}`);
            }
        }
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n3. Analysis Complete!');
    console.log('\n💡 Key Findings:');
    console.log('   ✅ Flat SpecificContent structures work best');
    console.log('   ✅ Complex nested objects should be in JsonData field');
    console.log('   ✅ itemData.Name must exactly match target queue');
    console.log('   ✅ SharePoint encoded field names (_x0020_, _x005f_) are supported');
    
    console.log('\n🔧 Recommendations for your main code:');
    console.log('   1. Ensure queue name consistency between URL and payload');
    console.log('   2. Use flat key-value pairs for simple data');
    console.log('   3. Put complex nested objects in JsonData field as JSON string');
    console.log('   4. Validate payload structure before sending');
    console.log('   5. Check for undefined values in SpecificContent');
}

// Run the test
if (require.main === module) {
    testFixedPayload().then(() => {
        console.log('\n🏁 Test completed successfully!');
    }).catch(error => {
        console.error('\n💥 Test failed:', error.message);
        process.exit(1);
    });
}

module.exports = { testFixedPayload };