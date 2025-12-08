#!/usr/bin/env node
const axios = require('axios');
const { getAccessToken } = require('./src/shared/auth');
const config = require('./src/shared/config');

// Set environment variables
process.env.AZURE_CLIENT_ID = "b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f";
process.env.AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || "<YOUR_AZURE_CLIENT_SECRET>";
process.env.AZURE_TENANT_ID = "f6e7449b-d39b-4300-822f-79267def3ab3";
process.env.SHAREPOINT_SITE_URL = "https://fambrandsllc.sharepoint.com/sites/sphookmanagement";
process.env.WEBHOOK_LIST_ID = "82a105da-8206-4bd0-851b-d3f2260043f4";

async function checkDeletedWebhook() {
    const context = { log: console.log, error: console.error };

    try {
        const accessToken = await getAccessToken(context);
        const listId = config.sharepoint.lists.webhookManagement;
        const sitePath = config.sharepoint.primarySite.sitePath;

        // Get ALL items from the tracking list, including deleted ones
        const url = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=100`;
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        console.log('📋 SharePoint Webhook Tracking List Contents');
        console.log('═════════════════════════════════════════════\n');

        const items = response.data.value || [];
        console.log(`Total items in tracking list: ${items.length}\n`);

        items.forEach((item, index) => {
            const fields = item.fields;
            console.log(`Item ${index + 1}:`);
            console.log('  ID:', item.id);
            console.log('  Subscription ID:', fields.SubscriptionId);
            console.log('  Resource:', fields.Resource || 'NOT STORED');
            console.log('  Status:', fields.Status);
            console.log('  Client State:', fields.ClientState);
            console.log('  Notification Count:', fields.NotificationCount);
            console.log('  Expires:', fields.ExpirationDateTime);
            console.log('  Modified:', fields.Modified);

            // Show ALL fields to find any hidden resource information
            console.log('\n  All Available Fields:');
            Object.keys(fields).forEach(key => {
                if (!['SubscriptionId', 'Resource', 'Status', 'ClientState', 'NotificationCount', 'ExpirationDateTime', 'Modified'].includes(key)) {
                    console.log(`    ${key}:`, fields[key]);
                }
            });
            console.log('  ─────────────────────────────────────────');
        });

        // Look for recently deleted webhook
        const deletedWebhook = items.find(item =>
            item.fields.Status === 'Deleted' &&
            item.fields.SubscriptionId === '206f208a-4a07-4277-9b14-8f374851e96d'
        );

        if (deletedWebhook) {
            console.log('\n🔍 Found Recently Deleted Webhook:');
            console.log('════════════════════════════════════');
            console.log('Subscription ID:', deletedWebhook.fields.SubscriptionId);
            console.log('Resource:', deletedWebhook.fields.Resource || 'NOT AVAILABLE');
            console.log('Client State:', deletedWebhook.fields.ClientState);

            if (!deletedWebhook.fields.Resource) {
                console.log('\n⚠️  PROBLEM: The Resource field is empty!');
                console.log('This means the SharePoint list/library path was not saved.');
                console.log('We cannot recreate the exact same webhook without knowing which resource to monitor.\n');

                // Try to guess from the clientState
                const clientState = deletedWebhook.fields.ClientState || '';
                if (clientState.includes('AccountingResearch')) {
                    console.log('💡 The clientState mentions "AccountingResearch" - this might be a clue.');
                    console.log('We need to find a SharePoint list or library related to Accounting Research.\n');
                }
            }
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

checkDeletedWebhook().catch(console.error);