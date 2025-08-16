/**
 * Check available UiPath queues
 */

const axios = require('axios');

async function checkUiPathQueues() {
    console.log('📋 Checking UiPath Queues');
    console.log('=========================\n');
    
    // Get UiPath token
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
    console.log('✅ Authenticated with UiPath\n');
    
    // List queues
    const orchestratorUrl = 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_';
    const organizationUnitId = '376892';
    
    try {
        const response = await axios.get(
            `${orchestratorUrl}/odata/QueueDefinitions`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-UIPATH-OrganizationUnitId': organizationUnitId
                }
            }
        );
        
        console.log(`Found ${response.data.value.length} queues:\n`);
        
        response.data.value.forEach((queue, index) => {
            console.log(`${index + 1}. ${queue.Name}`);
            console.log(`   - ID: ${queue.Id}`);
            console.log(`   - Description: ${queue.Description || 'No description'}`);
            console.log(`   - Max Retries: ${queue.MaxNumberOfRetries}`);
            console.log(`   - Accept Auto Retry: ${queue.AcceptAutomaticallyRetry}`);
            console.log();
        });
        
        // Check if TEST_API exists
        const testApiQueue = response.data.value.find(q => q.Name === 'TEST_API');
        if (testApiQueue) {
            console.log('✅ TEST_API queue exists!');
        } else {
            console.log('❌ TEST_API queue NOT found!');
            console.log('\nAvailable queue names:');
            response.data.value.forEach(q => console.log(`  - ${q.Name}`));
        }
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        if (error.response?.status === 404) {
            console.log('\n❌ QueueDefinitions endpoint not found. Trying alternate endpoint...\n');
            
            // Try alternate endpoint
            try {
                const altResponse = await axios.get(
                    `${orchestratorUrl}/odata/Queues`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'X-UIPATH-OrganizationUnitId': organizationUnitId
                        }
                    }
                );
                
                console.log('Using Queues endpoint. Found items:', altResponse.data.value?.length || 0);
            } catch (altError) {
                console.error('Alternate endpoint also failed:', altError.response?.data || altError.message);
            }
        }
    }
}

checkUiPathQueues().catch(console.error);