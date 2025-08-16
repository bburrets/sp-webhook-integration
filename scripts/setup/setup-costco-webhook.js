/**
 * Setup webhook for COSTCO US INLINE Routing Tracker PROD list
 * This webhook will monitor for status changes and trigger UiPath queue items
 */

const axios = require('axios');

// COSTCO List Details from user's URL:
// https://fambrandsllc.sharepoint.com/sites/COSTCO-INLINE-Trafficking-Routing/Lists/COSTCO%20US%20INLINE%20Routing%20Tracker%20PROD/AllItems.aspx
const COSTCO_CONFIG = {
    siteUrl: 'https://fambrandsllc.sharepoint.com/sites/COSTCO-INLINE-Trafficking-Routing',
    listName: 'COSTCO US INLINE Routing Tracker PROD',
    listPath: 'Lists/COSTCO US INLINE Routing Tracker PROD',
    // We'll need to discover the actual list ID
    webhookUrl: process.env.WEBHOOK_HANDLER_URL || 'https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler',
    clientState: 'uipath:TEST_API;costco:routing'
};

async function getAccessToken() {
    console.log('Getting access token...');
    
    const tokenUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
    
    const response = await axios.post(tokenUrl, new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
    }), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    
    return response.data.access_token;
}

async function discoverListId(token) {
    console.log('\n📋 Discovering COSTCO list ID...');
    
    try {
        // First, get the site ID
        const siteResponse = await axios.get(
            'https://graph.microsoft.com/v1.0/sites/fambrandsllc.sharepoint.com:/sites/COSTCO-INLINE-Trafficking-Routing',
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        const siteId = siteResponse.data.id;
        console.log('   Site ID:', siteId);
        
        // Now get all lists in the site
        const listsResponse = await axios.get(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/lists`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        // Find the COSTCO list
        const costcoList = listsResponse.data.value.find(list => 
            list.displayName === COSTCO_CONFIG.listName ||
            list.name === COSTCO_CONFIG.listName
        );
        
        if (costcoList) {
            console.log('   ✅ Found COSTCO list!');
            console.log('   - Display Name:', costcoList.displayName);
            console.log('   - List ID:', costcoList.id);
            console.log('   - Web URL:', costcoList.webUrl);
            return {
                siteId,
                listId: costcoList.id,
                listDetails: costcoList
            };
        } else {
            console.log('   ❌ COSTCO list not found');
            console.log('   Available lists:');
            listsResponse.data.value.forEach(list => {
                console.log(`     - ${list.displayName} (${list.id})`);
            });
            return null;
        }
        
    } catch (error) {
        console.error('Error discovering list:', error.response?.data || error.message);
        throw error;
    }
}

async function checkExistingWebhooks(token, siteId, listId) {
    console.log('\n🔍 Checking existing webhooks...');
    
    try {
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/subscriptions`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        const webhooks = response.data.value || [];
        
        if (webhooks.length > 0) {
            console.log(`   Found ${webhooks.length} existing webhook(s):`);
            webhooks.forEach((webhook, index) => {
                console.log(`   ${index + 1}. Webhook Details:`);
                console.log(`      - ID: ${webhook.id}`);
                console.log(`      - URL: ${webhook.notificationUrl}`);
                console.log(`      - Expires: ${webhook.expirationDateTime}`);
                console.log(`      - Client State: ${webhook.clientState || 'None'}`);
            });
            
            // Check if our webhook already exists
            const ourWebhook = webhooks.find(w => 
                w.notificationUrl === COSTCO_CONFIG.webhookUrl
            );
            
            if (ourWebhook) {
                console.log('\n   ⚠️  Our webhook already exists!');
                return ourWebhook;
            }
        } else {
            console.log('   No existing webhooks found');
        }
        
        return null;
        
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('   No webhooks found (404)');
            return null;
        }
        throw error;
    }
}

async function createWebhook(token, siteId, listId) {
    console.log('\n🚀 Creating new webhook for COSTCO list...');
    
    // Calculate expiration (3 days from now - SharePoint maximum)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 3);
    
    const webhookPayload = {
        resource: `sites/${siteId}/lists/${listId}`,
        changeType: 'updated',
        notificationUrl: COSTCO_CONFIG.webhookUrl,
        expirationDateTime: expirationDate.toISOString(),
        clientState: COSTCO_CONFIG.clientState
    };
    
    console.log('   Webhook Configuration:');
    console.log('   - Notification URL:', webhookPayload.notificationUrl);
    console.log('   - Change Type:', webhookPayload.changeType);
    console.log('   - Expiration:', webhookPayload.expirationDateTime);
    console.log('   - Client State:', webhookPayload.clientState);
    
    try {
        const response = await axios.post(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/subscriptions`,
            webhookPayload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('\n   ✅ Webhook created successfully!');
        console.log('   - Subscription ID:', response.data.id);
        console.log('   - Expires:', response.data.expirationDateTime);
        
        return response.data;
        
    } catch (error) {
        console.error('\n   ❌ Failed to create webhook');
        console.error('   Error:', error.response?.data || error.message);
        
        if (error.response?.status === 400) {
            console.log('\n   💡 Troubleshooting tips:');
            console.log('   1. Ensure webhook handler is accessible publicly');
            console.log('   2. Webhook handler must respond to validation requests');
            console.log('   3. Check Azure Function logs for validation attempts');
        }
        
        throw error;
    }
}

async function updateWebhook(token, siteId, listId, subscriptionId) {
    console.log('\n🔄 Updating existing webhook...');
    
    // Calculate new expiration
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 3);
    
    try {
        const response = await axios.patch(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/subscriptions/${subscriptionId}`,
            {
                expirationDateTime: expirationDate.toISOString()
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('   ✅ Webhook updated successfully!');
        console.log('   - New expiration:', response.data.expirationDateTime);
        
        return response.data;
        
    } catch (error) {
        console.error('   ❌ Failed to update webhook:', error.response?.data || error.message);
        throw error;
    }
}

async function setupCostcoWebhook() {
    console.log('=====================================');
    console.log('🎯 COSTCO Webhook Setup Utility');
    console.log('=====================================\n');
    
    console.log('Target List: COSTCO US INLINE Routing Tracker PROD');
    console.log('Site: COSTCO-INLINE-Trafficking-Routing');
    console.log('Trigger: Status = "Send Generated Form"');
    console.log('UiPath Queue: TEST_API\n');
    
    try {
        // Check required environment variables
        const required = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:', missing.join(', '));
            console.log('\nPlease set these in your local.settings.json or environment');
            return;
        }
        
        // Get access token
        const token = await getAccessToken();
        console.log('✅ Authentication successful\n');
        
        // Discover list ID
        const discovery = await discoverListId(token);
        if (!discovery) {
            console.error('\n❌ Could not find COSTCO list. Please verify the list name and site.');
            return;
        }
        
        const { siteId, listId } = discovery;
        
        // Check existing webhooks
        const existingWebhook = await checkExistingWebhooks(token, siteId, listId);
        
        if (existingWebhook) {
            console.log('\n📝 Webhook already exists. Would you like to update its expiration?');
            console.log('   (Webhooks expire after 3 days and need renewal)');
            
            // For now, we'll update it
            await updateWebhook(token, siteId, listId, existingWebhook.id);
        } else {
            // Create new webhook
            await createWebhook(token, siteId, listId);
        }
        
        console.log('\n=====================================');
        console.log('✅ COSTCO Webhook Setup Complete!');
        console.log('=====================================\n');
        
        console.log('Next Steps:');
        console.log('1. Make a change to an item in the COSTCO list');
        console.log('2. Set Status to "Send Generated Form"');
        console.log('3. Check UiPath Orchestrator TEST_API queue for new item');
        console.log('4. Monitor Azure Function logs for webhook activity\n');
        
    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        if (error.stack && process.env.NODE_ENV === 'development') {
            console.error(error.stack);
        }
    }
}

// Check if running directly
if (require.main === module) {
    // Load environment variables from local.settings.json if available
    try {
        const settings = require('../../local.settings.json');
        Object.assign(process.env, settings.Values);
    } catch (err) {
        console.log('Note: Using existing environment variables');
    }
    
    setupCostcoWebhook().catch(console.error);
}

module.exports = { setupCostcoWebhook };