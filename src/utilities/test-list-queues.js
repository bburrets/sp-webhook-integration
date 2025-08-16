/**
 * List all available queues to find the correct name and structure
 */

const axios = require('axios');

async function listQueues() {
    console.log('\n📋 Listing UiPath Queues in PROD Environment');
    console.log('============================================\n');
    
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
    console.log('✅ Authenticated successfully\n');
    
    try {
        // Get all queues
        const response = await axios.get(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/QueueDefinitions',
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-UIPATH-TenantName': 'FAMBrands_RPAOPS_PROD',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        
        console.log(`Found ${response.data.value.length} queues:\n`);
        
        response.data.value.forEach((queue, index) => {
            console.log(`${index + 1}. Queue Details:`);
            console.log(`   Name: ${queue.Name}`);
            console.log(`   ID: ${queue.Id}`);
            console.log(`   Description: ${queue.Description || 'No description'}`);
            console.log(`   Max Retries: ${queue.MaxNumberOfRetries}`);
            console.log(`   Accept Automatically Retry: ${queue.AcceptAutomaticallyRetry}`);
            console.log(`   Enforce Unique Reference: ${queue.EnforceUniqueReference}`);
            console.log(`   Created: ${queue.CreationTime}`);
            console.log();
        });
        
        // Find TEST_API queue specifically
        const testApiQueue = response.data.value.find(q => q.Name === 'TEST_API');
        if (testApiQueue) {
            console.log('✅ TEST_API Queue Found!');
            console.log('   Use this exact name for queue submissions: TEST_API');
            console.log('   Queue ID:', testApiQueue.Id);
            
            // Try to add a simple test item
            console.log('\n📬 Attempting to add a test item to TEST_API...');
            
            const testItem = {
                itemData: {
                    Name: `SimpleTest_${Date.now()}`,
                    Priority: 'Normal',
                    SpecificContent: {
                        Message: 'Test from SharePoint webhook integration',
                        Timestamp: new Date().toISOString()
                    }
                }
            };
            
            const addResponse = await axios.post(
                'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
                {
                    queueName: 'TEST_API',
                    ...testItem
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
            
            console.log('✅ Test item added successfully!');
            console.log('   Item ID:', addResponse.data.Id);
            console.log('   Status:', addResponse.data.Status);
            
        } else {
            console.log('⚠️  TEST_API queue not found in this folder');
            console.log('   Available queue names:');
            response.data.value.forEach(q => console.log(`     - ${q.Name}`));
        }
        
    } catch (error) {
        console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    }
}

// Run
listQueues().catch(console.error);