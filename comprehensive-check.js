const axios = require('axios');
const { getAccessToken } = require('./src/shared/auth');
const { createUiPathAuth } = require('./src/shared/uipath-auth');
const config = require('./src/shared/config');

async function comprehensiveCheck() {
    try {
        const context = { log: console.log, error: console.error };

        // Check SharePoint notification count
        const accessToken = await getAccessToken(context);
        const listId = config.sharepoint.lists.webhookManagement;
        const sitePath = config.sharepoint.primarySite.sitePath;

        const trackingUrl = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
        const trackingResponse = await axios.get(trackingUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        const webhookItem = trackingResponse.data.value?.find(i =>
            i.fields && i.fields.SubscriptionId === '206f208a-4a07-4277-9b14-8f374851e96d'
        );

        console.log('=== SharePoint Webhook Status ===');
        console.log('Notification Count:', webhookItem?.fields.NotificationCount);
        console.log('Last Modified:', webhookItem?.fields.Modified);
        console.log('');

        // Check UiPath queue
        const auth = createUiPathAuth(context);
        const client = await auth.getAuthenticatedClient();
        const queueResponse = await client.get('/odata/QueueItems');

        if (queueResponse.data.value && queueResponse.data.value.length > 0) {
            const latest = queueResponse.data.value
                .sort((a, b) => new Date(b.CreationTime) - new Date(a.CreationTime))[0];

            const createdAt = new Date(latest.CreationTime);
            const now = new Date();
            const minutesAgo = (now - createdAt) / (1000 * 60);

            console.log('=== Latest UiPath Queue Item ===');
            console.log('ID:', latest.Id);
            console.log('Reference:', latest.Reference);
            console.log('Created:', latest.CreationTime);
            console.log('Age:', minutesAgo.toFixed(2), 'minutes ago');
            console.log('');

            if (minutesAgo < 2) {
                console.log('✅ NEW QUEUE ITEM CREATED!');
                console.log('The webhook → UiPath flow is WORKING!');
            } else {
                console.log('⚠️  No recent queue items (last one is', minutesAgo.toFixed(1), 'minutes old)');
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

comprehensiveCheck();
