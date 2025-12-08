const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function checkWebhooksLocal() {
    try {
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║              Active SharePoint Webhooks Check                 ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');

        // Load local.settings.json
        const settingsPath = path.join(__dirname, 'local.settings.json');
        if (!fs.existsSync(settingsPath)) {
            console.error('❌ Error: local.settings.json not found');
            console.log('\nTo check active webhooks, you need to:');
            console.log('1. Copy local.settings.json.example to local.settings.json');
            console.log('2. Fill in your Azure AD credentials:');
            console.log('   - AZURE_TENANT_ID');
            console.log('   - AZURE_CLIENT_ID');
            console.log('   - AZURE_CLIENT_SECRET\n');
            return;
        }

        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const values = settings.Values || {};

        // Check if credentials are present
        if (!values.AZURE_TENANT_ID || !values.AZURE_CLIENT_ID || !values.AZURE_CLIENT_SECRET) {
            console.error('❌ Error: Azure AD credentials not configured in local.settings.json');
            console.log('\nRequired settings:');
            console.log('   AZURE_TENANT_ID:', values.AZURE_TENANT_ID ? '✅ Set' : '❌ Missing');
            console.log('   AZURE_CLIENT_ID:', values.AZURE_CLIENT_ID ? '✅ Set' : '❌ Missing');
            console.log('   AZURE_CLIENT_SECRET:', values.AZURE_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
            console.log('\n💡 Tip: Check CLAUDE.md or WORKING_CONFIGURATION.md for configuration details\n');
            return;
        }

        console.log('🔐 Authenticating with Azure AD...');

        // Get access token
        const tokenUrl = `https://login.microsoftonline.com/${values.AZURE_TENANT_ID}/oauth2/v2.0/token`;
        const tokenResponse = await axios.post(tokenUrl, new URLSearchParams({
            'client_id': values.AZURE_CLIENT_ID,
            'client_secret': values.AZURE_CLIENT_SECRET,
            'scope': 'https://graph.microsoft.com/.default',
            'grant_type': 'client_credentials'
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const accessToken = tokenResponse.data.access_token;
        console.log('✅ Authentication successful\n');

        // SharePoint configuration
        const sitePath = values.SHAREPOINT_SITE_PATH || 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
        const listId = values.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';

        console.log('📊 Querying SharePoint Webhook Tracking List...');
        console.log(`   Site: ${sitePath}`);
        console.log(`   List ID: ${listId}\n`);

        const url = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=100`;

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        const webhooks = response.data.value || [];

        // Filter for active webhooks
        const activeWebhooks = webhooks.filter(item =>
            item.fields &&
            item.fields.Status === 'Active' &&
            item.fields.SubscriptionId
        );

        console.log(`📈 Total Webhooks Found: ${webhooks.length}`);
        console.log(`✅ Active Webhooks: ${activeWebhooks.length}`);
        console.log(`❌ Inactive/Deleted: ${webhooks.length - activeWebhooks.length}\n`);

        if (activeWebhooks.length === 0) {
            console.log('⚠️  No active webhooks found in the tracking list.\n');

            // Show any deleted webhooks as reference
            const deletedWebhooks = webhooks.filter(item =>
                item.fields && item.fields.Status === 'Deleted'
            );

            if (deletedWebhooks.length > 0) {
                console.log('Recently Deleted Webhooks:');
                deletedWebhooks.forEach(w => {
                    console.log(`   - ${w.fields.Title || w.fields.SubscriptionId} (Deleted)`);
                });
                console.log('');
            }
            return;
        }

        console.log('=' .repeat(70));
        console.log('ACTIVE WEBHOOK DETAILS');
        console.log('=' .repeat(70));

        activeWebhooks.forEach((webhook, index) => {
            const fields = webhook.fields;
            const expirationDate = fields.ExpirationDateTime ? new Date(fields.ExpirationDateTime) : null;
            const now = new Date();
            const daysUntilExpiry = expirationDate ? Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24)) : null;

            console.log(`\n📍 Webhook ${index + 1}:`);
            console.log('-'.repeat(50));
            console.log(`   ID: ${fields.SubscriptionId}`);
            console.log(`   Title: ${fields.Title || 'N/A'}`);
            console.log(`   List: ${fields.ListName || 'N/A'}`);

            // Parse ClientState for details
            if (fields.ClientState) {
                if (fields.ClientState.includes('processor:uipath')) {
                    console.log('   Type: 🤖 UiPath Integration');

                    const queueMatch = fields.ClientState.match(/uipath:([^;]+)/);
                    if (queueMatch) {
                        console.log(`   Queue: ${queueMatch[1]}`);
                    }

                    const envMatch = fields.ClientState.match(/env:([^;]+)/);
                    if (envMatch) {
                        console.log(`   Environment: ${envMatch[1]}`);
                    }
                } else if (fields.ClientState.includes('forward:')) {
                    console.log('   Type: 📡 Forwarding Proxy');
                }
            }

            console.log(`   Notifications: ${fields.NotificationCount || 0}`);

            if (daysUntilExpiry !== null) {
                if (daysUntilExpiry <= 0) {
                    console.log(`   Status: ❌ EXPIRED`);
                } else if (daysUntilExpiry <= 7) {
                    console.log(`   Status: ⚠️  Expires in ${daysUntilExpiry} days`);
                } else {
                    console.log(`   Status: ✅ Valid for ${daysUntilExpiry} days`);
                }
            }
        });

        console.log('\n' + '='.repeat(70));
        console.log('\n✨ Check completed successfully!\n');

    } catch (error) {
        console.error('\n❌ Error checking webhooks:');

        if (error.response) {
            console.error('   HTTP Status:', error.response.status);
            if (error.response.status === 401) {
                console.error('   Authentication failed. Check your Azure AD credentials.');
            } else if (error.response.status === 404) {
                console.error('   SharePoint list not found. Check the site path and list ID.');
            } else {
                console.error('   Error:', error.response.data?.error?.message || error.message);
            }
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            console.error('   Network error. Check your internet connection.');
        } else {
            console.error('   ', error.message);
        }

        console.log('\n💡 Troubleshooting tips:');
        console.log('   1. Verify Azure AD credentials in local.settings.json');
        console.log('   2. Ensure the Azure AD app has SharePoint permissions');
        console.log('   3. Check that the webhook tracking list exists');
        console.log('   4. Try running: node validate-system.js\n');
    }
}

// Run the check
checkWebhooksLocal();