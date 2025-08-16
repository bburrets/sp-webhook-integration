/**
 * Test Graph API field names from actual webhook processing
 */

const axios = require('axios');
const { getAccessToken } = require('../shared/auth');

async function testGraphFieldNames() {
    console.log('Testing Graph API field names...\n');
    
    // Get access token
    const accessToken = await getAccessToken();
    
    // Test fetching a specific item from the COSTCO list
    // For SharePoint subsites, the format is different
    const siteId = 'fambrandsllc.sharepoint.com,84040bfe-b8f4-4774-805f-7fd933e96531,55bb27db-e29f-4f9e-ba2b-f3e5aa9bcd4d';
    const listId = 'a347ee9b-51b8-4ae2-bdb3-ebdfae5683ae';
    
    // First get the list of items to find a valid one
    const listUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=3`;
    
    console.log('Fetching list items from Graph API...');
    console.log('URL:', listUrl);
    
    try {
        const response = await axios.get(listUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
        
        const items = response.data.value;
        
        if (!items || items.length === 0) {
            console.log('No items found in list');
            return;
        }
        
        console.log(`Found ${items.length} items\n`);
        
        // Analyze the first item
        const item = items[0];
        
        console.log('\n=== Item Structure ===');
        console.log('Top-level keys:', Object.keys(item));
        console.log('Item ID:', item.id);
        
        if (item.fields) {
            console.log('\n=== Fields Object ===');
            console.log('All field names:', Object.keys(item.fields));
            
            // Show relevant field values
            console.log('\n=== Checking for Expected Fields ===');
            const expectedFields = [
                'ShiptoEmail', 'ShipToEmail', 'Ship_x0020_To_x0020_Email',
                'ShipDate', 'Ship_x0020_Date',
                'PO_No', 'PO_x005f_no', 'PONumber', 
                'Style', 'Status', 'GeneratedRoutingFormURL'
            ];
            
            for (const field of expectedFields) {
                if (item.fields[field] !== undefined) {
                    console.log(`  ✓ ${field}: ${JSON.stringify(item.fields[field])}`);
                }
            }
            
            // Check what fields actually exist with "ship" or "po"
            console.log('\n=== Actual Fields containing "Ship" or "PO" ===');
            for (const [key, value] of Object.entries(item.fields)) {
                if (key.toLowerCase().includes('ship') || key.toLowerCase().includes('po')) {
                    console.log(`  ${key}: ${JSON.stringify(value)}`);
                }
            }
            
            // Check fields containing underscore
            console.log('\n=== Fields with underscores ===');
            for (const [key, value] of Object.entries(item.fields)) {
                if (key.includes('_')) {
                    console.log(`  ${key}: ${JSON.stringify(value)}`);
                }
            }
        }
        
        // Test what happens when we merge fields
        console.log('\n=== After merging fields into item (as done in uipath-dispatcher) ===');
        const mergedItem = { ...item };
        if (mergedItem.fields) {
            Object.assign(mergedItem, mergedItem.fields);
        }
        
        console.log('item.fields still exists?', !!mergedItem.fields);
        console.log('Can access ShiptoEmail?', mergedItem['ShiptoEmail']);
        console.log('Can access Ship_x002d_toEmail?', mergedItem['Ship_x002d_toEmail']);
        console.log('Can access PO_x005f_No?', mergedItem['PO_x005f_No']);
        console.log('Can access ShipDate?', mergedItem['ShipDate']);
        console.log('Can access Status?', mergedItem['Status']);
        
        // Show what the COSTCO template would see
        console.log('\n=== What COSTCO Template Checks ===');
        console.log('item.fields?.ShiptoEmail:', item.fields?.ShiptoEmail);
        console.log('item.fields?.PO_No:', item.fields?.PO_No);
        console.log('item.fields?.ShipDate:', item.fields?.ShipDate);
        console.log('item.fields?.Style:', item.fields?.Style);
        console.log('item.fields?.Status:', item.fields?.Status);
        
    } catch (error) {
        console.error('Error fetching items:', error.response?.data || error.message);
    }
}

testGraphFieldNames().catch(console.error);