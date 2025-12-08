#!/usr/bin/env node
const axios = require('axios');
const { getAccessToken } = require('./src/shared/auth');
const config = require('./src/shared/config');

async function discoverResources() {
    const context = { log: console.log, error: console.error };

    console.log('🔍 Discovering SharePoint Resources...\n');

    try {
        const accessToken = await getAccessToken(context);

        // Get the site information
        const siteUrl = config.sharepoint.primarySite.siteUrl;
        const sitePath = config.sharepoint.primarySite.sitePath;

        console.log('Site URL:', siteUrl);
        console.log('Site Path:', sitePath);
        console.log('');

        // Get lists in the site
        const listsUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists?$select=id,displayName,webUrl,createdDateTime,lastModifiedDateTime`;
        const listsResponse = await axios.get(listsUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        console.log('📋 Available Lists/Libraries:');
        console.log('═════════════════════════════\n');

        const lists = listsResponse.data.value || [];
        lists.forEach((list, index) => {
            console.log(`${index + 1}. ${list.displayName}`);
            console.log(`   ID: ${list.id}`);
            console.log(`   Web URL: ${list.webUrl}`);
            console.log(`   Created: ${list.createdDateTime}`);
            console.log(`   Modified: ${list.lastModifiedDateTime}`);

            // Construct the resource string for webhook subscription
            const resource = `sites/${sitePath}/lists/${list.id}`;
            console.log(`   Resource String: ${resource}`);
            console.log('');
        });

        // Look for document libraries specifically
        console.log('📁 Document Libraries (filtered):');
        console.log('═════════════════════════════════\n');

        const docLibs = lists.filter(list =>
            list.displayName.toLowerCase().includes('document') ||
            list.displayName.toLowerCase().includes('accounting') ||
            list.displayName.toLowerCase().includes('research') ||
            list.webUrl.includes('Shared%20Documents')
        );

        if (docLibs.length > 0) {
            docLibs.forEach(lib => {
                console.log(`• ${lib.displayName}`);
                console.log(`  Resource: sites/${sitePath}/lists/${lib.id}`);
            });
        } else {
            console.log('  No document libraries found with common names.');
        }

        console.log('\n💡 To create a webhook subscription for document processing:');
        console.log('════════════════════════════════════════════════════════════\n');
        console.log('curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_FUNCTION_KEY>" \\');
        console.log('  -H "Content-Type: application/json" \\');
        console.log('  -d \'{');
        console.log('    "resource": "sites/YOUR_SITE_PATH/lists/YOUR_LIST_ID",');
        console.log('    "changeType": "updated",');
        console.log('    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",');
        console.log('    "clientState": "processor:uipath;processor:document;uipath:test_webhook;env:DEV;folder:277500"');
        console.log('  }\'');

    } catch (error) {
        console.error('\n❌ Error discovering resources');
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

// Set environment variables
process.env.AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || "b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f";
process.env.AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || "<YOUR_AZURE_CLIENT_SECRET>";
process.env.AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || "f6e7449b-d39b-4300-822f-79267def3ab3";
process.env.SHAREPOINT_SITE_URL = process.env.SHAREPOINT_SITE_URL || "https://fambrandsllc.sharepoint.com/sites/sphookmanagement";
process.env.WEBHOOK_LIST_ID = process.env.WEBHOOK_LIST_ID || "82a105da-8206-4bd0-851b-d3f2260043f4";

// Run discovery
discoverResources().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});