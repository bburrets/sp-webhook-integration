/**
 * Working solution - SpecificContent must be stringified
 */

const axios = require('axios');

async function testWorkingSolution() {
    console.log('\n🚀 Testing Working Solution');
    console.log('===========================\n');
    
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
    
    // Complex data must be stringified for SpecificContent
    const specificContentData = {
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
            Status: 'Send Generated Form',
            GeneratedFormURL: 'https://sharepoint.com/sites/COSTCO/Forms/Routing_PO-TEST-001.pdf'
        },
        ProcessInfo: {
            ProcessType: 'COSTCORoutingFormEmail',
            Source: 'SharePoint-Webhook',
            ListName: 'COSTCO US INLINE Routing Tracker PROD',
            ItemId: 'TEST-123',
            Timestamp: new Date().toISOString()
        }
    };
    
    const payload = {
        itemData: {
            Name: 'TEST_API',  // Queue name
            Priority: 'Normal',
            SpecificContent: specificContentData,  // Try as object first
            Reference: `COSTCO_PO-TEST-001_${Date.now()}`
        }
    };
    
    console.log('1. Testing with object SpecificContent...');
    
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
        
        console.log('✅ SUCCESS with object format!');
        console.log('Queue Item ID:', response.data.Id);
        
    } catch (error) {
        console.log('❌ Failed with object:', error.response?.data?.message?.substring(0, 50) + '...');
        
        // Try with stringified content
        console.log('\n2. Testing with stringified SpecificContent...');
        
        payload.itemData.SpecificContent = JSON.stringify(specificContentData);
        
        try {
            const response2 = await axios.post(
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
            
            console.log('\n🎉 SUCCESS with stringified SpecificContent!');
            console.log('=====================================');
            console.log('Queue Item Details:');
            console.log('  ID:', response2.data.Id);
            console.log('  Key:', response2.data.Key);
            console.log('  Status:', response2.data.Status);
            console.log('  Priority:', response2.data.Priority);
            console.log('  Reference:', response2.data.Reference);
            console.log('  Created:', response2.data.CreationTime);
            console.log('\n✅ Solution: SpecificContent must be JSON.stringify() for complex data');
            console.log('   The item is now in your TEST_API queue!');
            
        } catch (error2) {
            console.log('❌ Also failed with string:', error2.response?.data?.message);
            
            // Try with simple key-value pairs
            console.log('\n3. Testing with simple key-value pairs...');
            
            payload.itemData.SpecificContent = {
                ShipToEmail: 'warehouse@costco.com',
                ShipDate: '2025-01-23',
                Style: 'STYLE-ABC-123',
                PONumber: 'PO-TEST-001',
                Status: 'Send Generated Form',
                GeneratedFormURL: 'https://sharepoint.com/forms/test.pdf',
                ProcessType: 'COSTCORoutingFormEmail',
                Source: 'SharePoint-Webhook'
            };
            
            try {
                const response3 = await axios.post(
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
                
                console.log('\n🎉 SUCCESS with flat key-value pairs!');
                console.log('=====================================');
                console.log('Queue Item Details:');
                console.log('  ID:', response3.data.Id);
                console.log('  Key:', response3.data.Key);
                console.log('  Status:', response3.data.Status);
                console.log('  Priority:', response3.data.Priority);
                console.log('  Reference:', response3.data.Reference);
                console.log('  Created:', response3.data.CreationTime);
                console.log('\n✅ Solution: Use flat key-value pairs in SpecificContent');
                console.log('   Nested objects are not allowed!');
                
            } catch (error3) {
                console.log('❌ Failed with flat structure:', error3.response?.data?.message);
            }
        }
    }
}

// Run
testWorkingSolution().catch(console.error);