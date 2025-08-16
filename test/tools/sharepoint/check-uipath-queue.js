/**
 * Check UiPath TEST_API queue for recent items
 */

const axios = require('axios');

async function checkUiPathQueue() {
    console.log('\n📬 Checking UiPath TEST_API Queue');
    console.log('==================================\n');
    
    try {
        // Get UiPath token
        console.log('Getting UiPath authentication token...');
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
        console.log('✅ Authenticated with UiPath\n');
        
        // Get queue items from TEST_API
        console.log('Fetching queue items from TEST_API...');
        
        // Get items created in the last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        const response = await axios.get(
            `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/QueueItems?$orderby=CreationTime desc&$top=20`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        
        const items = response.data.value || [];
        
        if (items.length === 0) {
            console.log('❌ No queue items found in the last hour\n');
            
            // Try to get any items regardless of time
            const allItemsResponse = await axios.get(
                `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/QueueItems?$filter=QueueDefinitionId eq 72425&$orderby=CreationTime desc&$top=5`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-UIPATH-OrganizationUnitId': '376892'
                    }
                }
            );
            
            const allItems = allItemsResponse.data.value || [];
            if (allItems.length > 0) {
                console.log(`Found ${allItems.length} recent items (any time):\n`);
                allItems.forEach((item, index) => {
                    console.log(`${index + 1}. Queue Item:`);
                    console.log(`   ID: ${item.Id}`);
                    console.log(`   Reference: ${item.Reference || 'None'}`);
                    console.log(`   Status: ${item.Status}`);
                    console.log(`   Priority: ${item.Priority}`);
                    console.log(`   Created: ${item.CreationTime}`);
                    
                    // Check for COSTCO-related content
                    if (item.Reference && item.Reference.includes('COSTCO')) {
                        console.log(`   🎯 COSTCO Item Detected!`);
                    }
                    
                    // Show specific content if available
                    if (item.SpecificContent) {
                        console.log(`   Content Keys: ${Object.keys(item.SpecificContent).slice(0, 5).join(', ')}...`);
                    }
                    console.log();
                });
            } else {
                console.log('No items found in TEST_API queue at all.');
            }
        } else {
            console.log(`✅ Found ${items.length} queue items in the last hour:\n`);
            
            items.forEach((item, index) => {
                console.log(`${index + 1}. Queue Item:`);
                console.log(`   ID: ${item.Id}`);
                console.log(`   Reference: ${item.Reference || 'None'}`);
                console.log(`   Status: ${item.Status}`);
                console.log(`   Priority: ${item.Priority}`);
                console.log(`   Created: ${item.CreationTime}`);
                
                // Check for COSTCO-related content
                if (item.Reference && item.Reference.includes('COSTCO')) {
                    console.log(`   🎯 COSTCO Webhook Item!`);
                }
                
                // Show specific content if available
                if (item.SpecificContent) {
                    const keys = Object.keys(item.SpecificContent);
                    console.log(`   Content Keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
                    
                    // Check for SharePoint-related fields
                    if (item.SpecificContent.ListName || item.SpecificContent.ItemId) {
                        console.log(`   SharePoint Source: ${item.SpecificContent.ListName || 'Unknown'} - Item ${item.SpecificContent.ItemId || 'Unknown'}`);
                    }
                }
                console.log();
            });
        }
        
    } catch (error) {
        console.error('❌ Error checking queue:', error.response?.data || error.message);
    }
}

// Run the check
checkUiPathQueue().catch(console.error);