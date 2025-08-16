/**
 * Check SharePoint item 14 fields
 */

const axios = require('axios');

async function checkItem14() {
    console.log('📋 Checking SharePoint Item 14');
    console.log('================================\n');
    
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
    
    // Get specific item
    const siteId = 'fambrandsllc.sharepoint.com:/sites/COSTCO-INLINE-Trafficking-Routing:';
    const listId = '8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3';
    
    try {
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/14?$expand=fields`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        const item = response.data;
        console.log('Item 14 Details:');
        console.log('----------------');
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
        
        console.log('\nRequired COSTCO Fields Check:');
        console.log('------------------------------');
        const requiredFields = [
            'ShiptoEmail',
            'ShipDate', 
            'PO_No',
            'Style',
            'Status'
        ];
        
        for (const field of requiredFields) {
            const value = fields[field];
            const status = value ? '✅' : '❌';
            console.log(`${status} ${field}: ${value || 'MISSING'}`);
        }
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Set environment variables
process.env.AZURE_CLIENT_ID = 'b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f';
process.env.AZURE_CLIENT_SECRET = 'niS8Q~pUx~ac~0ETeQk1YPFk_pJTVFbn9FZ-Wb0N';
process.env.AZURE_TENANT_ID = 'f6e7449b-d39b-4300-822f-79267def3ab3';

checkItem14().catch(console.error);