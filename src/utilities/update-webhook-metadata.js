/**
 * Update webhook metadata in SharePoint tracking list
 */

const axios = require('axios');

async function updateWebhookMetadata() {
    console.log('🔧 Updating Webhook Metadata');
    console.log('============================\n');
    
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
        // Get all items and find the COSTCO webhook
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        // Filter in memory
        response.data.value = response.data.value.filter(item => 
            item.fields.SubscriptionId === '0e955659-b3a9-412b-a1b2-e095ec64bcba'
        );
        
        if (response.data.value && response.data.value.length > 0) {
            const item = response.data.value[0];
            console.log('Found COSTCO webhook item:');
            console.log('  Item ID:', item.id);
            console.log('  Current Title:', item.fields.Title);
            console.log('  Current ClientState:', item.fields.ClientState || 'None');
            
            // Update the item with correct metadata
            const updateUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${item.id}`;
            
            const updateData = {
                fields: {
                    Title: 'List - COSTCO Routing → TEST_API',
                    ClientState: 'uipath:TEST_API;costco:routing',
                    ListName: 'COSTCO US INLINE Routing Tracker (PROD) → TEST_API',
                    NotificationUrl: 'https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler',
                    IsProxy: 'No',
                    ForwardingUrl: ''
                }
            };
            
            console.log('\nUpdating with:');
            console.log('  New Title:', updateData.fields.Title);
            console.log('  New ClientState:', updateData.fields.ClientState);
            console.log('  New ListName:', updateData.fields.ListName);
            
            const updateResponse = await axios.patch(updateUrl, updateData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('\n✅ Webhook metadata updated successfully!');
            console.log('  Response status:', updateResponse.status);
            
        } else {
            console.log('❌ COSTCO webhook not found in tracking list');
        }
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Set environment variables
process.env.AZURE_CLIENT_ID = 'b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f';
process.env.AZURE_CLIENT_SECRET = 'niS8Q~pUx~ac~0ETeQk1YPFk_pJTVFbn9FZ-Wb0N';
process.env.AZURE_TENANT_ID = 'f6e7449b-d39b-4300-822f-79267def3ab3';

updateWebhookMetadata().catch(console.error);