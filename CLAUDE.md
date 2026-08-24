# CLAUDE.md - AI Assistant Context

## Project: SharePoint to UiPath Webhook Integration

Azure Functions middleware. SharePoint fires a content-free webhook → this app works out what
changed via Graph → submits items to UiPath Orchestrator queues.

**Last verified against production: 2026-08-18** (every fact below was checked, not assumed).

---

## Active Webhooks — BOTH PRODUCTION

| Subscription | Site | Queue | Folder |
|---|---|---|---|
| `cf16bc07-2238-4f6b-b76c-4bb21f929987` | Accounting_Research (doc library) | `FIN_SCAN_Rename_And_Storage` | 606837 |
| `023a2ed7-c5c3-4b85-bf76-24a1baf30474` | COSTCO US INLINE Routing Tracker | `Trafficking_Request_Email_Trigger_Queue` | 376892 |

Tenant for both: `FAMBrands_RPAOPS_PROD`. There is no active DEV webhook.

Webhooks expire after 3 days; `webhook-sync-timer` renews hourly (`0 0 * * * *`) when <24h remain.
README says 30 minutes — that is wrong.

**Never trust webhook IDs or expiry dates written in docs.** They rotate. Read the tracking list
(`sphookmanagement`, list `82a105da-8206-4bd0-851b-d3f2260043f4`) for ground truth.

---

## clientState — the routing DSL

Live format is **pipe-delimited**:

```
destination:uipath|handler:document|queue:FIN_SCAN_Rename_And_Storage|tenant:PROD|folder:606837
```

Legacy semicolon format still parses (`processor:uipath;processor:document;uipath:Q;env:PROD;folder:N`).
Separator is auto-detected: `|` if present, else `;`.

**A handler token is mandatory.** `handler:document` / `handler:costco` (or legacy
`processor:document` / `processor:costco`). Without one, `resolveProcessor` returns NULL and the
item is silently never dispatched — no error, no queue item. Registry checks costco first, then
generic-document.

Graph does NOT return clientState in notifications. It is stored in the SharePoint tracking list
and re-attached per notification by `enrichNotificationsWithClientState`.

---

## Architecture (async since 2026-08-18)

```
Graph ──POST──> webhook-handler ──enqueue──> [webhook-notifications] ──> notification-worker
                  202 in ~0.4s                                            enrich→fetch→dedup→UiPath
```

- `ASYNC_PROCESSING=true` app setting enables this. `false` reverts to inline processing.
- Graph requires a 2xx within **3 seconds**; >15% over 10s and it DROPS notifications for 10 min.
  Never put network I/O back on the handler's request path.
- Failures rethrow in the worker → retry (8 × 3min) → `webhook-notifications-poison`.
- Lookback for "which item changed" is 1500s, deliberately under the 30-min dedup window.

---

## Gotchas that will cost you hours

- **`src/shared/constants.js` is an ES module** (`export const`, no `module.exports`) in an
  otherwise CommonJS codebase. Jest CANNOT require it — `SyntaxError: Unexpected token 'export'`.
  Every test suite must `jest.mock('../shared/constants')`. It loads at runtime only via
  `require(esm)`, so **Node >= 20.19 is required** or the app will not start at all.
- **Never set `transform: {}` in `jest.config.js`.** It disables babel-jest, which silently stops
  `jest.mock()` hoisting — mocks declared after a `require()` then never apply and the real module
  loads instead. Symptom: tests failing for reasons that make no sense.
- **No deployment slots** (Consumption plan). Rollback = repoint `WEBSITE_RUN_FROM_PACKAGE` to a
  prior blob in `function-releases` + restart. Drain the queue first or in-flight messages strand.
- **App Insights is workspace-based; retention is 30 days** (the workspace governs, not the
  component's `retentionInDays: 90`). An idle app looks like "no data": Consumption scales to
  zero and emits telemetry only while invoked, so a quiet library means empty queries — that is
  not evidence of a logging failure.
- `local.settings.json` lacks `AZURE_CLIENT_ID/SECRET/TENANT_ID`. Pull creds from the Function App:
  `az functionapp config appsettings list --name webhook-functions-sharepoint-002 --resource-group rg-sharepoint-webhooks -o json`
- `uipath-queue-client.js` `getQueueItems()` filters on `QueueDefinitionName`, which Orchestrator
  rejects with HTTP 400. The valid property is `QueueDefinitionId`. (Known broken, diagnostics only.)

### API quirks (verified empirically)

- Graph **does** honor `$orderby=lastModifiedDateTime desc` on SharePoint listItems, despite the
  published reference listing only `$filter` and `$expand`. Much depends on this.
- Graph `$filter` on `lastModifiedDateTime` returns **400**. Time filtering must stay client-side.
- UiPath OData: `$top` max is **100** for QueueItems; `CreationTime` is **not** allowed in `$orderby`.
- UiPath queue retention is ~27 days — older items are purged, limiting reconciliation windows.

---

## Commands

```bash
# Deploy (func publish)
npm run deploy

# Tests — 179 passing, 10 suites
npm test

# Rollback layer 1 (seconds): revert async dispatch only, NOT the shared-path changes
az functionapp config appsettings set --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks --settings ASYNC_PROCESSING=false

# Queue depth / poison
az storage message peek --queue-name webhook-notifications \
  --account-name webhookstorageacct002 --auth-mode key --num-messages 10 -o table
```

Full rollback procedure: `docs/superpowers/plans/rollback-state-2026-08-18.md`

---

## Known open items

- Deduplicator fails **open** on transient Table Storage errors → can duplicate a submission.
- `$top=200` was justified against the old 300s window; occupancy over 1500s is unmeasured.
- Forwarding (`forward:`) failures are still swallowed — retry is UiPath-only. No live webhook
  uses `forward:` today.
- Converting `constants.js` to CommonJS would remove the Node floor and let Jest load it for real.

---

## Credentials — this took the system down for 5 days

The Azure AD client secret on app registration `b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f` expired
**2026-08-19**. Graph auth died → the hourly renewal timer failed → both subscriptions expired
2026-08-21 → every notification stopped. Nothing alerted. Current secret expires **2027-08-24**.

The timer **catches and logs** its errors (`webhook-sync.js:88`), so the Function App still
reports success while completely broken. Never rely on function-failure signals here.

Recovery is scripted: `node src/utilities/recover-webhooks.js` (dry run) then `--execute`. It reads
each webhook's resource and clientState from the tracking list, recreates the expired
subscriptions, and writes the new IDs back with clientState preserved. It refuses to recreate a
subscription whose clientState is empty. Expired subscriptions **cannot be renewed** — they must
be recreated, and they come back with new IDs.

## Alerting (resource group `rg-sharepoint-webhooks`, action group `sp-webhook-alerts`)

| Rule | Fires when |
|---|---|
| `sp-webhook-auth-or-renewal-failure` (Sev1) | Graph auth or renewal error in 15 min |
| `sp-webhook-renewal-heartbeat-missing` (Sev2) | timer silent for 3 h |
| `sp-webhook-worker-failing` (Sev2) | ≥3 worker failures in 30 min |

Use `contains`, not `has`, when matching `AADSTS` — `has` is term-based and will **not** match
`AADSTS7000222`. That mistake silently disarms the alert.

**Infra:** Function App `webhook-functions-sharepoint-002`, RG `rg-sharepoint-webhooks`,
storage `webhookstorageacct002`, East US, Node 20 (Azure reports EOL).
