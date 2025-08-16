/**
 * Discovery utility for COSTCO US INLINE Routing Tracker PROD list
 * This script helps identify the exact list ID and field names for the COSTCO list
 */

const axios = require('axios');
const { getAccessToken } = require('../shared/auth');
const { createLogger } = require('../shared/logger');

async function discoverCostcoList() {
    const mockContext = {
        log: console.log,
        log: { 
            error: console.error,
            warn: console.warn,
            info: console.log,
            verbose: console.log
        }
    };

    const logger = createLogger(mockContext);

    try {
        logger.info('Starting COSTCO list discovery...');
        
        const token = await getAccessToken(mockContext);
        
        // The COSTCO site IDs
        const siteId = 'fambrandsllc.sharepoint.com,84040bfe-b8f4-4774-805f-7fd933e96531,d4d47fda-0c90-452e-a9e0-ffbbc99edba8';
        
        logger.info('Fetching all lists in the COSTCO-INLINE site...');
        
        // Get all lists in the site
        const listsResponse = await axios.get(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/lists`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            }
        );

        // Find the COSTCO list
        const costcoList = listsResponse.data.value.find(list => 
            list.displayName?.includes('COSTCO US INLINE Routing Tracker') ||
            list.displayName?.includes('COSTCO') && list.displayName?.includes('Routing')
        );

        if (costcoList) {
            console.log('\n✅ Found COSTCO List:');
            console.log('=====================================');
            console.log('  List ID:', costcoList.id);
            console.log('  Display Name:', costcoList.displayName);
            console.log('  Web URL:', costcoList.webUrl);
            console.log('  Created:', costcoList.createdDateTime);
            
            // Get column details
            logger.info('Fetching column information...');
            const columnsResponse = await axios.get(
                `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${costcoList.id}/columns`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }
            );

            console.log('\n📋 Relevant Columns for UiPath Integration:');
            console.log('=====================================');
            
            const relevantColumns = [
                'Status', 
                'Ship To Email', 
                'Ship Date', 
                'Style', 
                'PO_no',
                'PO Number',
                'Generated Routing Form URL',
                'Routing Form',
                'Email',
                'Ship'
            ];
            
            const foundColumns = {};
            
            columnsResponse.data.value.forEach(column => {
                relevantColumns.forEach(searchTerm => {
                    if (column.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        column.name?.toLowerCase().includes(searchTerm.toLowerCase().replace(/\s/g, ''))) {
                        foundColumns[searchTerm] = column;
                        console.log(`\n  ${searchTerm} Column:`);
                        console.log(`    Display Name: ${column.displayName}`);
                        console.log(`    Internal Name: ${column.name}`);
                        console.log(`    Type: ${column.type || column['@odata.type']}`);
                        if (column.choice) {
                            console.log(`    Choices: ${column.choice.choices.join(', ')}`);
                        }
                    }
                });
            });

            // Get a sample item to see actual field values
            logger.info('Fetching sample item...');
            try {
                const itemsResponse = await axios.get(
                    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${costcoList.id}/items?$top=1&$expand=fields`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/json'
                        }
                    }
                );

                if (itemsResponse.data.value && itemsResponse.data.value.length > 0) {
                    console.log('\n📄 Sample Item Fields:');
                    console.log('=====================================');
                    const fields = itemsResponse.data.value[0].fields;
                    
                    // Show relevant fields from the sample
                    Object.keys(fields).forEach(key => {
                        if (relevantColumns.some(col => 
                            key.toLowerCase().includes(col.toLowerCase().replace(/\s/g, '')) ||
                            col.toLowerCase().includes(key.toLowerCase())
                        )) {
                            console.log(`  ${key}: ${JSON.stringify(fields[key])}`);
                        }
                    });
                }
            } catch (error) {
                logger.warn('Could not fetch sample item:', error.message);
            }

            // Generate configuration
            console.log('\n🔧 Configuration for webhook creation:');
            console.log('=====================================');
            console.log('Resource string for webhook:');
            console.log(`sites/${siteId}/lists/${costcoList.id}`);
            
            console.log('\nClientState for UiPath processing:');
            console.log('processor:uipath;queue:COSTCORoutingForms;template:costcoInlineRouting');

            // Save to file for reference
            const fs = require('fs');
            const configData = {
                siteId: siteId,
                listId: costcoList.id,
                listName: costcoList.displayName,
                webUrl: costcoList.webUrl,
                resourceString: `sites/${siteId}/lists/${costcoList.id}`,
                clientState: 'processor:uipath;queue:COSTCORoutingForms;template:costcoInlineRouting',
                columns: Object.keys(foundColumns).reduce((acc, key) => {
                    const col = foundColumns[key];
                    if (col) {
                        acc[key] = {
                            displayName: col.displayName,
                            internalName: col.name,
                            type: col.type
                        };
                    }
                    return acc;
                }, {})
            };

            fs.writeFileSync(
                'costco-list-config.json',
                JSON.stringify(configData, null, 2)
            );
            
            console.log('\n✅ Configuration saved to costco-list-config.json');

            return configData;

        } else {
            console.log('❌ COSTCO list not found. Available lists:');
            listsResponse.data.value.forEach(list => {
                console.log(`  - ${list.displayName} (${list.id})`);
            });
        }

    } catch (error) {
        logger.error('Error discovering list:', error.message);
        if (error.response) {
            logger.error('Response data:', error.response.data);
        }
    }
}

// Run if executed directly
if (require.main === module) {
    discoverCostcoList().then(() => {
        console.log('\n✅ Discovery complete!');
    }).catch(error => {
        console.error('❌ Discovery failed:', error);
        process.exit(1);
    });
}

module.exports = { discoverCostcoList };