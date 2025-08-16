/**
 * Check UiPath queue items in TEST_API queue
 */

const axios = require('axios');

async function checkQueueItems() {
    console.log('📋 Checking Queue Items in TEST_API');
    console.log('=====================================\n');
    
    try {
        // Authenticate
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
        console.log('✅ Authenticated successfully\n');
        
        // Get queue items
        const orchestratorUrl = 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_';
        const organizationUnitId = '376892';
        
        // Get queue items - API might have different filtering syntax
        const response = await axios.get(
            `${orchestratorUrl}/odata/QueueItems`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-UIPATH-OrganizationUnitId': organizationUnitId
                }
            }
        );
        
        console.log(`Found ${response.data.value.length} recent queue items:\n`);
        
        response.data.value.forEach((item, index) => {
            console.log(`${index + 1}. ${item.Reference || 'No Reference'}`);
            console.log(`   - ID: ${item.Id}`);
            console.log(`   - Status: ${item.Status}`);
            console.log(`   - Priority: ${item.Priority}`);
            console.log(`   - Created: ${item.CreationTime}`);
            
            if (item.SpecificContent) {
                console.log('   - Content:');
                const keys = Object.keys(item.SpecificContent).slice(0, 5);
                keys.forEach(key => {
                    console.log(`     • ${key}: ${item.SpecificContent[key]}`);
                });
                if (Object.keys(item.SpecificContent).length > 5) {
                    console.log(`     ... and ${Object.keys(item.SpecificContent).length - 5} more fields`);
                }
            }
            console.log();
        });
        
        // Count by status
        const statusCounts = {};
        response.data.value.forEach(item => {
            statusCounts[item.Status] = (statusCounts[item.Status] || 0) + 1;
        });
        
        console.log('Status Summary:');
        console.log('---------------');
        for (const [status, count] of Object.entries(statusCounts)) {
            console.log(`${status}: ${count}`);
        }
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

checkQueueItems().catch(console.error);