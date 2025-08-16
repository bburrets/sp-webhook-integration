/**
 * Test using the format from Swagger documentation
 */

const axios = require('axios');

async function testSwaggerFormat() {
    console.log('\n📚 Testing with Swagger API Format');
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
    
    // Based on Swagger, the endpoint is /odata/Queues/UiPathODataSvc.AddQueueItem
    // The body should have itemData structure
    
    const payload = {
        itemData: {
            Name: `Test_${Date.now()}`,
            Priority: 'Normal',
            SpecificContent: {
                EmailConfig: {
                    To: 'test@example.com',
                    Subject: 'Test from API',
                    Template: 'TestTemplate'
                },
                ProcessInfo: {
                    ProcessType: 'APITest',
                    Source: 'SharePoint-Webhook-Test',
                    Timestamp: new Date().toISOString()
                }
            },
            Reference: `REF_${Date.now()}`
        }
    };
    
    console.log('Testing AddQueueItem endpoint...');
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    try {
        const response = await axios.post(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-UIPATH-OrganizationUnitId': '376892'
                },
                params: {
                    queueName: 'TEST_API'
                }
            }
        );
        
        console.log('\n✅ SUCCESS!');
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.log('\n❌ Failed with params in URL');
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data?.message || error.response?.data || error.message);
        
        // Try with queueName in body
        console.log('\n2. Trying with queueName in request body...');
        
        try {
            const bodyPayload = {
                queueName: 'TEST_API',
                itemData: payload.itemData
            };
            
            const response2 = await axios.post(
                'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
                bodyPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'X-UIPATH-OrganizationUnitId': '376892'
                    }
                }
            );
            
            console.log('\n✅ SUCCESS with queueName in body!');
            console.log('Response:', JSON.stringify(response2.data, null, 2));
            
        } catch (error2) {
            console.log('❌ Also failed with queueName in body');
            console.log('Status:', error2.response?.status);
            console.log('Error:', error2.response?.data?.message || error2.response?.data || error2.message);
            
            // Check error details
            if (error2.response?.data) {
                console.log('\nFull error response:', JSON.stringify(error2.response.data, null, 2));
            }
        }
    }
}

// Run
testSwaggerFormat().catch(console.error);