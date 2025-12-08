#!/usr/bin/env node
const axios = require('axios');
const { getAccessToken } = require('./src/shared/auth');
const { createUiPathAuth } = require('./src/shared/uipath-auth');
const config = require('./src/shared/config');

async function validateSystem() {
    const context = { log: console.log, error: console.error };

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║   SharePoint → UiPath Webhook Integration Validation Report   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    try {
        // 1. Check Azure Function Configuration
        console.log('📋 1. AZURE FUNCTION CONFIGURATION');
        console.log('   Environment: Development');
        console.log('   UiPath Tenant:', process.env.UIPATH_TENANT_NAME);
        console.log('   UiPath Folder:', process.env.UIPATH_ORGANIZATION_UNIT_ID);
        console.log('   UiPath Queue:', process.env.UIPATH_DEFAULT_QUEUE);
        console.log('   UiPath Enabled:', process.env.UIPATH_ENABLED);
        console.log('');

        // 2. Test Azure AD Authentication
        console.log('🔐 2. AZURE AD AUTHENTICATION');
        const accessToken = await getAccessToken(context);
        console.log('   ✅ Successfully authenticated with Azure AD');
        console.log('');

        // 3. Check SharePoint Tracking List
        console.log('📊 3. SHAREPOINT WEBHOOK TRACKING LIST');
        const listId = config.sharepoint.lists.webhookManagement;
        const sitePath = config.sharepoint.primarySite.sitePath;

        const trackingUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
        const trackingResponse = await axios.get(trackingUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        const webhooks = trackingResponse.data.value || [];
        console.log(`   Total webhooks in tracking list: ${webhooks.length}`);

        if (webhooks.length > 0) {
            webhooks.forEach((webhook, index) => {
                const fields = webhook.fields;
                console.log(`\n   Webhook ${index + 1}:`);
                console.log(`     Subscription ID: ${fields.SubscriptionId}`);
                console.log(`     Resource: ${fields.Resource || 'N/A'}`);
                console.log(`     Client State: ${fields.ClientState || 'EMPTY'}`);
                console.log(`     Notification Count: ${fields.NotificationCount || 0}`);
                console.log(`     Status: ${fields.Status || 'Active'}`);
                console.log(`     Expires: ${fields.ExpirationDateTime || 'N/A'}`);
                console.log(`     Last Modified: ${fields.Modified || 'N/A'}`);

                // Check if expired
                if (fields.ExpirationDateTime) {
                    const expiresAt = new Date(fields.ExpirationDateTime);
                    const now = new Date();
                    if (expiresAt < now) {
                        console.log(`     ⚠️  EXPIRED ${Math.floor((now - expiresAt) / (1000 * 60 * 60))} hours ago`);
                    } else {
                        const hoursUntilExpiry = Math.floor((expiresAt - now) / (1000 * 60 * 60));
                        console.log(`     ✅ Expires in ${hoursUntilExpiry} hours`);
                    }
                }
            });
        }
        console.log('');

        // 4. Check Microsoft Graph Active Subscriptions
        console.log('🌐 4. MICROSOFT GRAPH ACTIVE SUBSCRIPTIONS');
        const graphUrl = `${config.api.graph.baseUrl}/subscriptions`;
        const graphResponse = await axios.get(graphUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        const activeSubscriptions = graphResponse.data.value || [];
        console.log(`   Active subscriptions in Microsoft Graph: ${activeSubscriptions.length}`);

        if (activeSubscriptions.length > 0) {
            activeSubscriptions.forEach((sub, index) => {
                console.log(`\n   Subscription ${index + 1}:`);
                console.log(`     ID: ${sub.id}`);
                console.log(`     Resource: ${sub.resource}`);
                console.log(`     Change Type: ${sub.changeType}`);
                console.log(`     Expires: ${sub.expirationDateTime}`);
            });
        } else {
            console.log('   ⚠️  NO ACTIVE SUBSCRIPTIONS FOUND IN MICROSOFT GRAPH');
            console.log('   This means webhooks have expired and need to be recreated!');
        }
        console.log('');

        // 5. Test UiPath Connection
        console.log('🤖 5. UIPATH ORCHESTRATOR CONNECTION');
        try {
            const auth = createUiPathAuth(context);
            const client = await auth.getAuthenticatedClient();
            console.log('   ✅ Successfully connected to UiPath Orchestrator');

            // Get queue items
            const queueResponse = await client.get('/odata/QueueItems', {
                params: {
                    $top: 5,
                    $orderby: 'CreationTime desc'
                }
            });

            const queueItems = queueResponse.data.value || [];
            console.log(`   Recent queue items: ${queueItems.length}`);

            if (queueItems.length > 0) {
                const latest = queueItems[0];
                const createdAt = new Date(latest.CreationTime);
                const now = new Date();
                const minutesAgo = Math.floor((now - createdAt) / (1000 * 60));

                console.log(`\n   Latest Queue Item:`);
                console.log(`     ID: ${latest.Id}`);
                console.log(`     Reference: ${latest.Reference}`);
                console.log(`     Queue: ${latest.QueueDefinition?.Name || 'Unknown'}`);
                console.log(`     Created: ${latest.CreationTime}`);
                console.log(`     Age: ${minutesAgo} minutes ago`);

                if (minutesAgo < 60) {
                    console.log('     ✅ Recent activity detected!');
                } else if (minutesAgo < 1440) {
                    console.log(`     ⚠️  Last activity was ${Math.floor(minutesAgo / 60)} hours ago`);
                } else {
                    console.log(`     ❌ Last activity was ${Math.floor(minutesAgo / 1440)} days ago`);
                }
            }
        } catch (uiPathError) {
            console.log('   ❌ Failed to connect to UiPath Orchestrator');
            console.log('   Error:', uiPathError.message);
        }
        console.log('');

        // 6. Summary & Recommendations
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📝 VALIDATION SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════\n');

        const issues = [];
        const warnings = [];

        if (activeSubscriptions.length === 0) {
            issues.push('No active webhook subscriptions in Microsoft Graph');
        }

        if (webhooks.length > 0 && activeSubscriptions.length === 0) {
            issues.push('SharePoint tracking list has webhooks, but they are not active in Microsoft Graph');
        }

        if (webhooks.length === 0 && activeSubscriptions.length === 0) {
            issues.push('No webhooks configured at all - system is not operational');
        }

        // Check for expiration
        const expiredWebhooks = webhooks.filter(w => {
            if (!w.fields.ExpirationDateTime) return false;
            return new Date(w.fields.ExpirationDateTime) < new Date();
        });

        if (expiredWebhooks.length > 0) {
            warnings.push(`${expiredWebhooks.length} webhook(s) have expired`);
        }

        if (issues.length === 0 && warnings.length === 0) {
            console.log('✅ SYSTEM STATUS: HEALTHY');
            console.log('   All components are functioning correctly.\n');
        } else {
            if (issues.length > 0) {
                console.log('❌ CRITICAL ISSUES FOUND:');
                issues.forEach(issue => console.log(`   • ${issue}`));
                console.log('');
            }

            if (warnings.length > 0) {
                console.log('⚠️  WARNINGS:');
                warnings.forEach(warning => console.log(`   • ${warning}`));
                console.log('');
            }
        }

        // Recommendations
        console.log('💡 RECOMMENDATIONS:\n');

        if (activeSubscriptions.length === 0) {
            console.log('   1. Create new webhook subscriptions using subscription-manager');
            console.log('      Example for UiPath integration:');
            console.log('      curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>" \\');
            console.log('        -H "Content-Type: application/json" \\');
            console.log('        -d \'{');
            console.log('          "resource": "sites/...",');
            console.log('          "changeType": "updated",');
            console.log('          "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",');
            console.log('          "clientState": "processor:uipath;uipath:YOUR_QUEUE_NAME;env:DEV;folder:277500"');
            console.log('        }\'');
            console.log('');
        }

        if (webhooks.length > activeSubscriptions.length) {
            console.log('   2. Run webhook-sync to clean up orphaned tracking list entries');
            console.log('      curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<KEY>"');
            console.log('');
        }

        console.log('   3. Monitor the system regularly using this validation script');
        console.log('      node validate-system.js\n');

        console.log('═══════════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ VALIDATION FAILED');
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('\nStack trace:', error.stack);
        process.exit(1);
    }
}

// Run validation
validateSystem().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
