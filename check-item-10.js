const axios = require('axios');

async function checkItem10() {
    console.log('Checking SharePoint Item 10...\n');
    
    // Get access token
    const tokenResponse = await axios.post(
        'https://login.microsoftonline.com/f6e7449b-d39b-4300-822f-79267def3ab3/oauth2/v2.0/token',
        new URLSearchParams({
            client_id: 'b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f',
            client_secret: 'niS8Q~pUx~ac~0ETeQk1YPFk_pJTVFbn9FZ-Wb0N',
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials'
        })
    );
    
    const token = tokenResponse.data.access_token;
    
    // Get item 10
    const response = await axios.get(
        'https://graph.microsoft.com/v1.0/sites/fambrandsllc.sharepoint.com:/sites/COSTCO-INLINE-Trafficking-Routing:/lists/8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3/items/10?$expand=fields',
        {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }
    );
    
    const fields = response.data.fields;
    console.log('Item 10 Fields:');
    console.log('--------------');
    console.log('ShiptoEmail:', fields.ShiptoEmail || 'MISSING');
    console.log('ShipDate:', fields.ShipDate || 'MISSING');
    console.log('PO_No:', fields.PO_No || 'MISSING');
    console.log('Style:', fields.Style || 'MISSING');
    console.log('Status:', fields.Status || 'MISSING');
    console.log('\nAll field names:');
    console.log(Object.keys(fields).filter(k => !k.startsWith('@') && !k.startsWith('OData')));
}

checkItem10().catch(console.error);
