const axios = require('axios');
const { getAccessToken } = require('./src/shared/auth');
const config = require('./src/shared/config');

async function checkNow() {
    try {
        const context = { log: console.log, error: console.error };
        const accessToken = await getAccessToken(context);

        const listId = config.sharepoint.lists.webhookManagement;
        const sitePath = config.sharepoint.primarySite.sitePath;

        const url = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        const item = response.data.value?.find(i =>
            i.fields && i.fields.SubscriptionId === '206f208a-4a07-4277-9b14-8f374851e96d'
        );

        console.log('=== SharePoint Tracking List - Current State ===\n');
        console.log('Item ID:', item.id);
        console.log('SubscriptionId:', item.fields.SubscriptionId);
        console.log('ClientState:', item.fields.ClientState || '**NULL/EMPTY**');
        console.log('Last Modified:', item.fields.Modified);
        console.log('Modified By:', item.fields.Editor?.Email || 'Unknown');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkNow();
