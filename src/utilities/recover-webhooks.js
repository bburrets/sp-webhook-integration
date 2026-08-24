/**
 * Webhook recovery after Azure AD client-secret expiry.
 *
 * Reads the SharePoint tracking list for the exact resource + clientState of each
 * webhook, recreates the (expired) Graph subscriptions, and writes the new
 * subscription IDs back to the tracking list with clientState preserved.
 *
 * Requires AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID in env.
 *
 *   DRY RUN (default): node recover-webhooks.js
 *   EXECUTE:           node recover-webhooks.js --execute
 */
const axios = require('axios');

const EXECUTE = process.argv.includes('--execute');
const GRAPH = 'https://graph.microsoft.com/v1.0';
const TRACKING_SITE = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
const TRACKING_LIST = '82a105da-8206-4bd0-851b-d3f2260043f4';
const NOTIFY_URL = 'https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler';

// Ground truth captured 2026-08-18 while the system was healthy.
// Used to verify what we read from the tracking list, not to replace it.
const EXPECTED = {
    'cf16bc07-2238-4f6b-b76c-4bb21f929987': {
        label: 'Accounting_Research',
        clientState: 'destination:uipath|handler:document|queue:FIN_SCAN_Rename_And_Storage|tenant:PROD|folder:606837|changeDetection:enabled'
    },
    '023a2ed7-c5c3-4b85-bf76-24a1baf30474': {
        label: 'COSTCO US INLINE Routing Tracker',
        clientState: 'destination:uipath|handler:costco|queue:Trafficking_Request_Email_Trigger_Queue|tenant:PROD|folder:376892'
    }
};

async function token() {
    const p = new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
    });
    const r = await axios.post(
        `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
        p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return r.data.access_token;
}

(async () => {
    console.log(EXECUTE ? '*** EXECUTE MODE — will write to production ***\n' : '--- DRY RUN (pass --execute to apply) ---\n');

    const t = await token();
    const H = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
    console.log('[1/5] Graph auth OK\n');

    // --- What subscriptions exist right now? ---
    const subs = (await axios.get(`${GRAPH}/subscriptions`, { headers: H })).data.value || [];
    console.log(`[2/5] Live Graph subscriptions: ${subs.length}`);
    subs.forEach(s => console.log(`        ${s.id}  expires ${s.expirationDateTime}`));
    const liveIds = new Set(subs.map(s => s.id));

    // --- Tracking list rows carry resource + clientState ---
    const items = (await axios.get(
        `${GRAPH}/sites/${TRACKING_SITE}/lists/${TRACKING_LIST}/items?$expand=fields&$top=200`,
        { headers: H })).data.value || [];
    const rows = items.filter(i => i.fields?.Status === 'Active');
    console.log(`\n[3/5] Tracking list rows marked Active: ${rows.length}`);

    const plan = [];
    for (const row of rows) {
        const f = row.fields;
        const oldId = f.SubscriptionId;
        const resource = `${f.SiteUrl}/lists/${f.ListId}`;
        const clientState = f.ClientState || '';
        const expected = EXPECTED[oldId];

        console.log(`\n  row ${row.id}  ${f.Title || ''}`);
        console.log(`    old subscriptionId : ${oldId}  ${liveIds.has(oldId) ? '(STILL LIVE — will skip)' : '(gone/expired)'}`);
        console.log(`    resource           : ${resource}`);
        console.log(`    clientState        : ${clientState || '(EMPTY!)'}`);
        if (expected) {
            const match = clientState === expected.clientState;
            console.log(`    matches 08-18 value: ${match ? 'yes' : 'NO — will use the tracking-list value, review this'}`);
        }
        if (!clientState) {
            console.log('    !! REFUSING: no clientState. Recreating would silently drop every document.');
            continue;
        }
        if (liveIds.has(oldId)) continue;
        plan.push({ rowId: row.id, oldId, resource, clientState, title: f.Title });
    }

    console.log(`\n[4/5] Subscriptions to recreate: ${plan.length}`);
    if (!plan.length) { console.log('  nothing to do'); return; }

    if (!EXECUTE) {
        plan.forEach(p => console.log(`  WOULD create for ${p.resource}`));
        console.log('\nRe-run with --execute to apply.');
        return;
    }

    // --- Recreate ---
    const expiration = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    for (const p of plan) {
        try {
            const body = {
                changeType: 'updated',
                notificationUrl: NOTIFY_URL,
                resource: p.resource,
                expirationDateTime: expiration,
                clientState: p.clientState
            };
            const created = (await axios.post(`${GRAPH}/subscriptions`, body, { headers: H })).data;
            console.log(`  created ${created.id} for ${p.title}  expires ${created.expirationDateTime}`);

            await axios.patch(
                `${GRAPH}/sites/${TRACKING_SITE}/lists/${TRACKING_LIST}/items/${p.rowId}`,
                { fields: {
                    SubscriptionId: created.id,
                    ExpirationDateTime: created.expirationDateTime,
                    Status: 'Active',
                    ClientState: p.clientState
                } },
                { headers: H });
            console.log(`    tracking row ${p.rowId} updated (clientState preserved)`);
        } catch (e) {
            console.log(`  FAILED for ${p.title}: ${e.response?.status} ${JSON.stringify(e.response?.data?.error || e.message).slice(0, 300)}`);
        }
    }

    // --- Verify ---
    const after = (await axios.get(`${GRAPH}/subscriptions`, { headers: H })).data.value || [];
    console.log(`\n[5/5] Live subscriptions now: ${after.length}`);
    after.forEach(s => console.log(`        ${s.id}  ${s.resource}  expires ${s.expirationDateTime}`));
})().catch(e => {
    console.error('FATAL', e.response?.status, JSON.stringify(e.response?.data || e.message).slice(0, 400));
    process.exit(1);
});
