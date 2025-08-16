/**
 * Check webhook management list in SharePoint
 */

const axios = require('axios');

async function checkWebhookList() {
    console.log('📋 Checking Webhook Management List');
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
    
    // Get webhook management list items
    const listId = '82a105da-8206-4bd0-851b-d3f2260043f4';
    const sitePath = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
    
    try {
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=10`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        console.log(`Found ${response.data.value.length} webhooks in tracking list:\n`);
        
        response.data.value.forEach((item, index) => {
            const fields = item.fields;
            console.log(`${index + 1}. ${fields.Title || 'No Title'}`);
            console.log(`   - ID: ${fields.SubscriptionId}`);
            console.log(`   - List Name: ${fields.ListName || 'Unknown'}`);
            console.log(`   - Status: ${fields.Status}`);
            console.log(`   - Client State: ${fields.ClientState || 'None'}`);
            console.log(`   - UiPath Queue: ${fields.ClientState?.includes('uipath:') ? fields.ClientState.match(/uipath:([^;]+)/)?.[1] : 'N/A'}`);
            console.log(`   - Expires: ${fields.ExpirationDateTime}`);
            console.log();
        });
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Set environment variables
process.env.AZURE_CLIENT_ID = 'b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f';
process.env.AZURE_CLIENT_SECRET = 'niS8Q~pUx~ac~0ETeQk1YPFk_pJTVFbn9FZ-Wb0N';
process.env.AZURE_TENANT_ID = 'f6e7449b-d39b-4300-822f-79267def3ab3';

checkWebhookList().catch(console.error);