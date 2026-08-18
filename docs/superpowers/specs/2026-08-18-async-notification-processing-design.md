# Async Notification Processing — Design

**Date:** 2026-08-18
**Status:** Approved for planning
**Branch:** `fix/async-notification-processing`

## Problem

`webhook-handler` performs all notification work — Graph fetches, deduplication, and every
UiPath queue submission — before returning a response to Microsoft Graph
(`src/functions/webhook-handler.js:82-84`). Response time therefore scales linearly with the
number of items in a burst.

Microsoft Graph's documented requirements for a webhook endpoint:

- Return 2xx within **3 seconds**, or the notification is treated as undelivered.
- If >10% of responses exceed 3s in a 10-minute window, the endpoint is marked **"slow"** and
  new notifications are delayed 10 minutes.
- If >15% of responses exceed the 10s retry timeout, the endpoint is marked **"drop"** and
  notifications are **dropped for 10 minutes**.
- Prescribed pattern: persist the notification and return `202 Accepted` immediately.

### Measured evidence (2026-08-18, read-only reconciliation)

Per-submission cost measured across 175 real submission bursts in the PROD queue:
**p50 = 365 ms**, p90 = 458 ms. Validated against observed 20-item bursts, which took
7.0–8.4 s versus 7.3 s predicted.

| Batch size | Handler time | Graph threshold |
|---|---|---|
| 10 | 3.6 s | past 3 s "slow" |
| 20 (current cap) | 7.3 s | past 3 s "slow" |
| 50 | 18.3 s | past 10 s "drop" |
| 100 | 36.5 s | 3.6× past "drop" |

Bursts of exactly 20 submissions have occurred **48 times**, so the `$top=20` ceiling is
binding and the handler already operates past the 3-second threshold.

Delivery reconciliation over the clean window 2026-07-27 → 2026-08-12: 1,715 library
documents modified, 1,709 reached the queue, **6 never arrived** (0.35%). All six were lost
in a single 2026-07-28 incident where the gap between the last upload and the next processed
notification was **10.4 minutes** — matching the documented 10-minute throttle penalty. The
300-second lookback could not reach back across that gap. Correlation is exact (6/6 missing
before the cutoff, 5/5 delivered after), but no logs survive to confirm the mechanism;
App Insights retains only ~25 minutes of traces.

### Why raising `$top` alone is not the fix

The `$top=20` cap currently acts as an unintended circuit breaker bounding how much work one
invocation can take on. Removing it without decoupling would push a 100-item burst to ~36 s,
deep into "drop" territory, and would likely increase loss.

## Goals

1. Handler response time becomes constant and independent of batch size.
2. No loss of existing functionality; the two active PROD webhooks keep working throughout.
3. Every change is individually reversible.

## Non-goals

- Migrating to delta query (`src/shared/delta-tracker.js` exists but is unused). Larger change,
  tracked separately.
- Changing UiPath processors, templates, or queue payload shape.

## Architecture

```
Graph ──POST──> webhook-handler ──enqueue──> [webhook-notifications]
                     │ 202 in <1s                      │
                     ▼                                 ▼
                   Graph                        notification-worker
                                                       │
                                    enrich → fetch → dedup → UiPath
```

### Stays in the handler (no network I/O)

- `validationToken` handshake — must continue returning HTTP 200, `text/plain`, body = token.
  This is the subscription-creation path; breaking it prevents new webhooks from being created.
- JSON parse and `validateWebhookNotification`
- Enqueue one message per notification
- Return `202 Accepted`

### Moves to the worker

- clientState enrichment (`enrichNotificationsWithClientState`) — currently a full tracking-list
  fetch from Graph on **every** notification, on the request path
- `fetchSharePointItem` / `getRecentItems`
- Deduplication (Azure Table Storage)
- UiPath submissions (N × 365 ms)
- Notification-count and forwarding-stats updates
- Enhanced forwarding

## Components

### Queue

`webhook-notifications` on the existing `AzureWebJobsStorage` account. One message per
notification rather than per batch: keeps messages small and makes retries per-notification.

Message payload: the raw notification object plus a `receivedAt` timestamp. A few hundred
bytes against the 64 KB Storage Queue limit.

### Handler output binding (Node v4)

```js
const { app, output } = require('@azure/functions');

const queueOutput = output.storageQueue({
    queueName: 'webhook-notifications',
    connection: 'AzureWebJobsStorage'
});

// app.http('webhook-handler', { ..., extraOutputs: [queueOutput], handler: ... })
const receivedAt = new Date().toISOString();
context.extraOutputs.set(queueOutput, notifications.map(n => JSON.stringify({ ...n, receivedAt })));
return { status: 202, body: 'Accepted' };
```

### Worker

```js
app.storageQueue('notification-worker', {
    queueName: 'webhook-notifications',
    connection: 'AzureWebJobsStorage',
    handler: async (message, context) => { /* delegates to existing processNotification */ }
});
```

`processNotification` is reused unchanged; this is a relocation, not a rewrite.

## Concurrency: serialize

`host.json` gains:

```json
"extensions": { "queues": { "batchSize": 1, "newBatchThreshold": 0, "maxDequeueCount": 5 } }
```

Rationale: the deduplicator is check-then-act — `wasRecentlyProcessed` runs, then
`recordProcessed` only after submission completes (`src/shared/processing-deduplicator.js:85,148`).
Under the default `batchSize: 16`, two workers can both pass the check for the same item and
both submit. 82 repeat submissions already exist in the queue; concurrency would multiply them.

Serialization costs nothing: ~400 documents/day at 365 ms is ~2.5 minutes of work per day.
A 100-item burst takes ~36 s in the background where nothing waits on it.

If throughput ever becomes a constraint, the correct fix is claim-before-submit using Table
Storage `createEntity` (409 = another worker owns the item), **not** raising `batchSize`.

## Error handling

Today a failed UiPath submission is logged and lost. The queue trigger adds real recovery:

- **Handler**: if the enqueue fails, return 500 — Graph retries for up to 4 hours.
- **Worker**: throw on failure so the message retries; after `maxDequeueCount: 5` it lands in
  `webhook-notifications-poison`, where it is visible and replayable.
- Re-submission on retry is safe because the deduplicator suppresses already-sent items.

## Removal: in-memory loop-prevention map

`src/functions/webhook-handler.js:102-120` keeps a module-level `Map` keyed
`subscriptionId-resource` that drops any notification arriving within 10 seconds of the
previous one. During a burst — precisely when SharePoint fires most often — this silently
discards processing passes.

It is superseded by the Table Storage deduplicator, which is correct where this is not: it
works per-item rather than per-subscription, and it survives across instances. **Delete it**
rather than carry it into the worker. (Approved.)

## Rollback

Verified facts underpinning this plan:

- The Function App runs on a **Consumption (Dynamic) plan** — deployment slots are unavailable.
- Deployment uses `WEBSITE_RUN_FROM_PACKAGE` pointing at an immutable blob in the
  `function-releases` container of `webhookstorageacct002`.
- Current package: `20260105174917-9806a121-fca5-4e37-bf07-fb0be0b429c5.zip`
- That package's `src/` was diffed against repo HEAD and **matches exactly** (only `__tests__/`
  and `utilities/` differ, both excluded by `.funcignore`). Production == commit `945b958`.

### Layer 1 — config toggle (seconds, no redeploy) — DEGRADED FALLBACK, NOT A RESTORE

`ASYNC_PROCESSING` app setting gates the split. When `false`, the handler processes inline.
Default **false** on first deploy.

**This does not restore pre-branch behavior, and the original wording ("exactly as today") is
no longer true.** Layer 1 reverts async dispatch only. It does *not* revert the shared-path
changes that shipped on this branch: the in-memory loop-prevention map was deleted, and the
1500 s lookback plus `$top=200` live on the SHARED code path used by both the inline and the
async route. With the flag off, a 5-notification batch can expand to 5 x up to 200 items
processed inline in a single HTTP request — potentially **worse** than the pre-branch baseline
it is meant to restore, and at real risk of exceeding Graph's 3-second response deadline.

**Layer 1 now also surrenders the retry guarantee.** The queue's retry/poison behavior exists
only on the async path. With the flag off, `processNotification`'s return value is discarded by
the inline loop: a failed UiPath dispatch is logged and execution continues, Graph receives its
200, and the notification is gone with no retry. This is newly true as of the C1 fix (failed
dispatches now propagate rather than reporting success), so flipping the flag off trades away
failure retry, not just async dispatch.

Use Layer 1 when the fault is in the async machinery (worker, queue, poison behavior). When the
fault is inline processing volume, latency, or duplicate submissions, Layer 1 will not help and
may make things worse — go straight to Layer 2.

Both code paths therefore coexist during rollout: the existing inline path is retained behind
the flag rather than deleted. The `notification-worker` is deployed regardless and simply idles
while the flag is `false`, since nothing is being enqueued. Deleting the inline path and the
flag is a follow-up cleanup once the async path has run stably, so the code does not carry two
paths indefinitely.

### Layer 2 — package rollback (minutes) — THE ONLY TRUE RESTORE

Repoint `WEBSITE_RUN_FROM_PACKAGE` to
`20260105174917-9806a121-fca5-4e37-bf07-fb0be0b429c5.zip` and restart. Returns to
byte-identical pre-branch production code (commit `945b958`), including the shared-path
behavior that Layer 1 leaves in place. This is the only lever that actually restores pre-branch
behavior.

**Ordering requirement:** flip `ASYNC_PROCESSING=false` first and wait for queue depth to reach
zero before rolling back the package. Rolling back the package removes the worker function, and
any in-flight messages would be stranded until a forward deploy.

### Layer 3 — git

All work on `fix/async-notification-processing`. No direct commits to `main`.

### Pre-change capture (required before any deploy)

- App settings snapshot to a local file
- Current `WEBSITE_RUN_FROM_PACKAGE` URL (recorded above)
- Active webhook subscription IDs and clientStates:
  - `cf16bc07-2238-4f6b-b76c-4bb21f929987` — Accounting_Research →
    `destination:uipath|handler:document|queue:FIN_SCAN_Rename_And_Storage|tenant:PROD|folder:606837|changeDetection:enabled`
  - `023a2ed7-c5c3-4b85-bf76-24a1baf30474` — COSTCO Routing Tracker →
    `destination:uipath|handler:costco|queue:Trafficking_Request_Email_Trigger_Queue|tenant:PROD|folder:376892`
- Baseline coverage metric: 1,709 / 1,715 for 2026-07-27 → 2026-08-12

## Rollout sequence

1. Deploy with `ASYNC_PROCESSING=false`. Verify behavior is unchanged (handler still inline).
2. Flip `ASYNC_PROCESSING=true`. Verify: handler duration < 1 s, queue drains, library count
   equals queue count for the window.
3. Only after step 2 is stable, ship the follow-ons as separate commits.

## Follow-ons unlocked (separate commits, after verification)

- Lookback `300s` → `1800s` in `getRecentItems`. Would have caught the entire 2026-07-28
  incident. Safe because the 30-minute deduplicator absorbs the wider overlap.
  **Superseded:** the value now shipped is `1500s`, not `1800s`. At 1800s the lookback equalled
  the dedup window exactly, leaving zero margin — elapsed time inside a 200-item batch loop can
  push an item's dedup check past the 30-minute boundary, causing a resubmission and a duplicate
  financial document. The 300s gap absorbs that per-item check latency.
- `$top` `20` → `200` in `src/shared/enhanced-forwarder.js:63,96`. Max observed occupancy in a
  300 s window is 100, so a single page covers it; `@odata.nextLink` pagination becomes optional
  insurance rather than a requirement.

Verified against the live library: Graph **does** honor `$orderby=lastModifiedDateTime desc` on
SharePoint listItems (contrary to the published reference, which lists only `$filter` and
`$expand`), and `$top=200` is honored with `@odata.nextLink` present. `$filter` on
`lastModifiedDateTime` returns HTTP 400, so time filtering must remain client-side.

## Testing

In scope (approved): fix the 14 currently failing tests across
`src/shared/__tests__/uipath-dynamic-queue-client.test.js`,
`src/templates/__tests__/generic-document-processor.test.js`, and
`src/functions/__tests__/uipath-dispatcher-dynamic.test.js`. These cover the dispatcher and
queue-client code this change touches; they must be green to serve as a safety net.

New coverage:

- Handler returns 202 and populates the queue output with one message per notification
- Handler still returns 200 + `text/plain` for `validationToken` (regression guard)
- Handler with `ASYNC_PROCESSING=false` behaves as today
- Worker delegates to `processNotification` and rethrows on failure so retries engage

Production validation: upload a burst to the Accounting_Research library, confirm handler
duration stays under a second and that library count equals queue count for the window.

## Known related defects (not in scope, recorded)

- `src/shared/uipath-queue-client.js:590` — `getQueueItems()` filters on `QueueDefinitionName`,
  which Orchestrator rejects with HTTP 400. The valid property is `QueueDefinitionId`.
  Diagnostics-only, so it has been failing unnoticed.
- 13 queue items sit in `Failed` status (robot-side, not delivery).
- App Insights retains only ~25 minutes of traces, so post-hoc incident diagnosis is not
  currently possible.
- UiPath queue retention is ~27 days, so delivery loss before 2026-07-16 cannot be assessed.
