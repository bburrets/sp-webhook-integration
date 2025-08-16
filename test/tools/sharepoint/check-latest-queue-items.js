/**
 * Check latest items in UiPath queue
 */

const axios = require('axios');
const { createUiPathAuth } = require('../../../src/shared/uipath-auth');

async function checkLatestQueueItems() {
    console.log('🔍 Checking Latest UiPath Queue Items');
    console.log('=====================================\n');
    
    try {
        // Authenticate
        const auth = createUiPathAuth();
        console.log('Authenticating with UiPath...');
        const token = await auth.authenticate();
        console.log('✅ Authenticated\n');
        
        // Get queue items
        const orchestratorUrl = process.env.UIPATH_ORCHESTRATOR_URL || 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_';
        const orgUnitId = process.env.UIPATH_ORGANIZATION_UNIT_ID || '376892';
        
        // First get the queue definition
        const queueUrl = `${orchestratorUrl}/odata/QueueDefinitions?$filter=Name eq 'TEST_API'`;
        const queueResponse = await axios.get(queueUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-UIPATH-OrganizationUnitId': orgUnitId
            }
        });
        
        if (!queueResponse.data.value || queueResponse.data.value.length === 0) {
            console.log('❌ TEST_API queue not found');
            return;
        }
        
        const queueId = queueResponse.data.value[0].Id;
        console.log(`Found TEST_API queue (ID: ${queueId})\n`);
        
        // Now get items from this specific queue
        const url = `${orchestratorUrl}/odata/QueueItems?$filter=QueueDefinitionId eq ${queueId}&$top=10&$orderby=CreationTime desc`;
        
        console.log('Fetching latest queue items...');
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-UIPATH-OrganizationUnitId': orgUnitId
            }
        });
        
        const items = response.data.value;
        console.log(`Found ${items.length} recent items\n`);
        
        items.forEach((item, index) => {
            console.log(`Item ${index + 1}:`);
            console.log(`  ID: ${item.Id}`);
            console.log(`  Reference: ${item.Reference || 'N/A'}`);
            console.log(`  Status: ${item.Status}`);
            console.log(`  Priority: ${item.Priority}`);
            console.log(`  Created: ${item.CreationTime}`);
            
            // Check if SpecificContent or JsonData
            if (item.SpecificContent && Object.keys(item.SpecificContent).length > 0) {
                console.log(`  ✅ Has SpecificContent with ${Object.keys(item.SpecificContent).length} fields`);
                // Show first few fields
                const fields = Object.keys(item.SpecificContent).slice(0, 5);
                fields.forEach(field => {
                    const value = item.SpecificContent[field];
                    const displayValue = typeof value === 'string' && value.length > 50 
                        ? value.substring(0, 50) + '...' 
                        : value;
                    console.log(`     - ${field}: ${displayValue}`);
                });
                if (Object.keys(item.SpecificContent).length > 5) {
                    console.log(`     ... and ${Object.keys(item.SpecificContent).length - 5} more fields`);
                }
            } else if (item.SpecificContent && item.SpecificContent.JsonData) {
                console.log(`  ⚠️ Data in JsonData field (not properly structured)`);
                try {
                    const jsonData = JSON.parse(item.SpecificContent.JsonData);
                    console.log(`     Contains ${Object.keys(jsonData).length} fields in JSON string`);
                } catch (e) {
                    console.log(`     JsonData: ${item.SpecificContent.JsonData.substring(0, 100)}...`);
                }
            } else {
                console.log(`  ❌ No SpecificContent`);
            }
            console.log('');
        });
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Set environment variables if running locally
if (!process.env.UIPATH_CLIENT_ID) {
    require('dotenv').config({ path: 'local.settings.json' });
    
    // Parse the values from local.settings.json format
    try {
        const fs = require('fs');
        const settings = JSON.parse(fs.readFileSync('local.settings.json', 'utf8'));
        if (settings.Values) {
            Object.assign(process.env, settings.Values);
        }
    } catch (e) {
        console.log('Could not load local.settings.json');
    }
}

checkLatestQueueItems().catch(console.error);