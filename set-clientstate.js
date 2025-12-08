const axios = require('axios');
const { getAccessToken } = require('./src/shared/auth');
const config = require('./src/shared/config');

async function setClientState() {
    try {
        const context = { log: console.log, error: console.error };
        const accessToken = await getAccessToken(context);

        const listId = config.sharepoint.lists.webhookManagement;
        const sitePath = config.sharepoint.primarySite.sitePath;
        const itemId = 103;

        const clientState = 'processor:uipath;processor:document;uipath:test_webhook;env:DEV;folder:277500;config:AccountingResearch';

        console.log('Setting ClientState in SharePoint tracking list...\n');
        console.log('ClientState:', clientState);

        const url = `${config.api.graph.baseUrl}/sites/${sitePath}/lists/${listId}/items/${itemId}`;
        await axios.patch(url, {
            fields: { ClientState: clientState }
        }, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('\n✅ ClientState set successfully!');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

setClientState();
