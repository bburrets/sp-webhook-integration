/**
 * Check SharePoint item fields
 */

const axios = require('axios');

async function checkSharePointItem() {
    console.log('📋 Checking SharePoint Item Fields');
    console.log('=====================================\n');
    
    // Get access token
    const tokenResponse = await axios.post(
        `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
        new URLSearchParams({
            client_id: process.env.AZURE_CLIENT_ID,
            client_secret: process.env.AZURE_CLIENT_SECRET,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials'
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );
    
    const token = tokenResponse.data.access_token;
    
    // Get the COSTCO list items
    const siteId = 'fambrandsllc.sharepoint.com:/sites/COSTCO-INLINE-Trafficking-Routing:';
    const listId = '8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3';
    
    try {
        // Get recent items
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$orderby=lastModifiedDateTime desc&$top=5`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        console.log(`Found ${response.data.value.length} recent items\n`);
        
        // Show the most recently modified item
        if (response.data.value.length > 0) {
            const item = response.data.value[0];
            console.log('Most Recently Modified Item:');
            console.log('-----------------------------');
            console.log(`ID: ${item.id}`);
            console.log(`Last Modified: ${item.lastModifiedDateTime}`);
            console.log('\nFields:');
            console.log('-------');
            
            const fields = item.fields;
            
            // Show all fields
            for (const [key, value] of Object.entries(fields)) {
                // Skip system fields
                if (key.startsWith('@') || key.startsWith('OData') || key === 'id') continue;
                
                let displayValue = value;
                if (value === null) displayValue = 'null';
                else if (value === '') displayValue = '(empty)';
                else if (typeof value === 'object') displayValue = JSON.stringify(value);
                
                console.log(`  ${key}: ${displayValue}`);
            }
            
            console.log('\nChecking Required COSTCO Fields:');
            console.log('---------------------------------');
            const requiredFields = [
                'Ship_x0020_To_x0020_Email',
                'Ship_x0020_Date', 
                'PO_x005f_no',
                'Status'
            ];
            
            for (const field of requiredFields) {
                const value = fields[field];
                const status = value ? '✅' : '❌';
                console.log(`${status} ${field}: ${value || 'MISSING'}`);
            }
            
            // Also check alternate field names
            console.log('\nChecking Alternate Field Names:');
            console.log('--------------------------------');
            const alternates = [
                'ShipToEmail',
                'Ship_To_Email',
                'ShipDate',
                'Ship_Date',
                'PONumber',
                'PO_Number',
                'PO_no'
            ];
            
            for (const field of alternates) {
                if (fields[field]) {
                    console.log(`  Found: ${field} = ${fields[field]}`);
                }
            }
        }
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Set environment variables
process.env.AZURE_CLIENT_ID = 'b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f';
process.env.AZURE_CLIENT_SECRET = 'niS8Q~pUx~ac~0ETeQk1YPFk_pJTVFbn9FZ-Wb0N';
process.env.AZURE_TENANT_ID = 'f6e7449b-d39b-4300-822f-79267def3ab3';

checkSharePointItem().catch(console.error);