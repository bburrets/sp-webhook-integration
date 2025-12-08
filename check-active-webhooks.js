const axios = require('axios');
const { getAccessToken } = require('./src/shared/auth');
const config = require('./src/shared/config');

async function checkActiveWebhooks() {
    try {
        const context = {
            log: console.log,
            error: console.error
        };

        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║              Active SharePoint Webhooks Report                ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');

        // Get access token for Graph API
        console.log('🔐 Authenticating with Azure AD...');
        const accessToken = await getAccessToken(context);
        console.log('✅ Authentication successful\n');

        // Query SharePoint webhook tracking list
        const listId = config.sharepoint.lists.webhookManagement;
        const sitePath = config.sharepoint.primarySite.sitePath;

        console.log('📊 Querying SharePoint Webhook Tracking List...');
        console.log(`   Site: ${sitePath}`);
        console.log(`   List ID: ${listId}\n`);

        const url = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=100`;

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
            console.log(`   Subscription ID: ${fields.SubscriptionId}`);
            console.log(`   Title: ${fields.Title || 'N/A'}`);
            console.log(`   Status: ${fields.Status}`);
            console.log(`   Site URL: ${fields.SiteUrl || 'N/A'}`);
            console.log(`   List Name: ${fields.ListName || 'N/A'}`);
            console.log(`   Change Type: ${fields.ChangeType || 'updated'}`);

            // Parse ClientState for configuration details
            if (fields.ClientState) {
                console.log(`   Client State: ${fields.ClientState}`);

                // Parse processor type
                if (fields.ClientState.includes('processor:uipath')) {
                    console.log('   🤖 Processor: UiPath Integration');

                    // Extract queue name if present
                    const queueMatch = fields.ClientState.match(/uipath:([^;]+)/);
                    if (queueMatch) {
                        console.log(`   📥 Target Queue: ${queueMatch[1]}`);
                    }

                    // Extract environment
                    const envMatch = fields.ClientState.match(/env:([^;]+)/);
                    if (envMatch) {
                        console.log(`   🌍 Environment: ${envMatch[1]}`);
                    }

                    // Extract folder ID
                    const folderMatch = fields.ClientState.match(/folder:([^;]+)/);
                    if (folderMatch) {
                        console.log(`   📁 Folder ID: ${folderMatch[1]}`);
                    }
                } else if (fields.ClientState.includes('forward:')) {
                    console.log('   📡 Type: Forwarding Proxy');
                    const forwardMatch = fields.ClientState.match(/forward:([^;]+)/);
                    if (forwardMatch) {
                        console.log(`   🔗 Forward URL: ${forwardMatch[1]}`);
                    }
                }
            }

            console.log(`   Notification URL: ${fields.NotificationUrl || 'N/A'}`);
            console.log(`   Notification Count: ${fields.NotificationCount || 0}`);

            if (expirationDate) {
                console.log(`   Expires: ${expirationDate.toLocaleString()}`);
                if (daysUntilExpiry <= 0) {
                    console.log(`   ⚠️  STATUS: EXPIRED`);
                } else if (daysUntilExpiry <= 7) {
                    console.log(`   ⚠️  EXPIRES SOON: ${daysUntilExpiry} days`);
                } else {
                    console.log(`   ✅ Valid for: ${daysUntilExpiry} days`);
                }
            }

            console.log(`   Auto-Renew: ${fields.AutoRenew || 'No'}`);
            console.log(`   Last Modified: ${fields.Modified || 'N/A'}`);

            if (fields.LastForwardedDateTime) {
                console.log(`   Last Forwarded: ${fields.LastForwardedDateTime}`);
            }
        });

        console.log('\n' + '='.repeat(70));
        console.log('\n📋 SUMMARY:');
        console.log(`   • Active Webhooks: ${activeWebhooks.length}`);

        const expiringWebhooks = activeWebhooks.filter(w => {
            const exp = w.fields.ExpirationDateTime ? new Date(w.fields.ExpirationDateTime) : null;
            const days = exp ? Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)) : null;
            return days && days <= 7 && days > 0;
        });

        const expiredWebhooks = activeWebhooks.filter(w => {
            const exp = w.fields.ExpirationDateTime ? new Date(w.fields.ExpirationDateTime) : null;
            const days = exp ? Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)) : null;
            return days && days <= 0;
        });

        if (expiringWebhooks.length > 0) {
            console.log(`   • ⚠️  Expiring Soon (≤7 days): ${expiringWebhooks.length}`);
        }

        if (expiredWebhooks.length > 0) {
            console.log(`   • ❌ Expired: ${expiredWebhooks.length}`);
        }

        const uipathWebhooks = activeWebhooks.filter(w =>
            w.fields.ClientState && w.fields.ClientState.includes('processor:uipath')
        );

        const forwardingWebhooks = activeWebhooks.filter(w =>
            w.fields.ClientState && w.fields.ClientState.includes('forward:')
        );

        if (uipathWebhooks.length > 0) {
            console.log(`   • 🤖 UiPath Integrations: ${uipathWebhooks.length}`);
        }

        if (forwardingWebhooks.length > 0) {
            console.log(`   • 📡 Forwarding Proxies: ${forwardingWebhooks.length}`);
        }

        console.log('\n✨ Report generated successfully!\n');

    } catch (error) {
        console.error('\n❌ Error checking webhooks:');
        console.error('   ', error.message);

        if (error.response) {
            console.error('   Response Status:', error.response.status);
            console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
        }

        console.log('\n💡 Troubleshooting tips:');
        console.log('   1. Ensure Azure AD app has SharePoint permissions');
        console.log('   2. Check that environment variables are properly set');
        console.log('   3. Verify the webhook tracking list ID is correct');
        console.log('   4. Run "npm install" if dependencies are missing\n');
    }
}

// Run the check
checkActiveWebhooks();