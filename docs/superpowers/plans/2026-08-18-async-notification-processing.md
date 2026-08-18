# Async Notification Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `webhook-handler` return `202 Accepted` to Microsoft Graph in under a second by moving all notification processing to an Azure Storage Queue worker, eliminating the throttle-induced notification loss measured in production.

**Architecture:** `webhook-handler` validates and enqueues one message per notification, then returns 202. A new `notification-worker` storage-queue trigger performs clientState enrichment, SharePoint fetches, deduplication, and UiPath submission by reusing the existing `processNotification` unchanged. The split is gated behind an `ASYNC_PROCESSING` app setting so the inline path remains available for instant rollback.

**Tech Stack:** Node.js 18+, Azure Functions v4 programming model (`@azure/functions` 4.7.2-preview), Azure Storage Queues, Azure Table Storage, Jest 30.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-async-notification-processing-design.md`
- Branch: `fix/async-notification-processing`. Never commit to `main`.
- The `validationToken` handshake MUST keep returning HTTP **200**, `Content-Type: text/plain`, body = the raw token. This is the subscription-creation path.
- Do NOT change UiPath processors, templates, or queue payload shape.
- Do NOT change the `SPDOC_` reference format — live queue items already use it.
- `ASYNC_PROCESSING` defaults to **absent/false**; behavior with the flag off must be byte-for-byte today's behavior through Task 6. Task 7 intentionally changes shared behavior and is sequenced after production verification for exactly that reason.
- Queue name: `webhook-notifications`. Connection setting: `AzureWebJobsStorage`.
- Rollback package (current production): `20260105174917-9806a121-fca5-4e37-bf07-fb0be0b429c5.zip` in container `function-releases` of storage account `webhookstorageacct002`.
- Production currently runs commit `945b958`; the deployed `src/` was diffed against repo HEAD and matches exactly.

---

## File Structure

| File | Responsibility |
|---|---|
| `jest.config.js` | Modify — remove `transform: {}` so `jest.mock` hoisting works |
| `src/functions/__tests__/uipath-dispatcher-dynamic.test.js` | Modify — fix wrong mock path |
| `src/templates/__tests__/generic-document-processor.test.js` | Modify — correct `buildReference` expectation |
| `src/shared/uipath-dynamic-queue-client.js` | Modify — store `this.context` |
| `src/functions/webhook-handler.js` | Modify — queue output binding, `ASYNC_PROCESSING` branch, 202, export helpers; loop map removed in Task 7 |
| `src/functions/notification-worker.js` | Create — storage-queue trigger delegating to `processNotification` |
| `src/functions/__tests__/webhook-handler.test.js` | Create — handler unit tests |
| `src/functions/__tests__/notification-worker.test.js` | Create — worker unit tests |
| `host.json` | Modify — queue extension config (serial processing) |
| `src/shared/enhanced-forwarder.js` | Modify (Task 9) — `$top` ceiling |
| `src/functions/uipath-dispatcher.js` | Modify (Task 8) — lookback window |
| `src/shared/config.js` | Modify (Task 7) — drop orphaned `loopPreventionWindow` |

---

### Task 1: Restore a green test suite

The suite currently has 14 failures. Root cause: `jest.config.js` sets `transform: {}`, which disables `babel-jest`. Without it `jest.mock()` calls are **not hoisted**, so every mock declared *after* a `require()` never applies and the real module loads instead. Three suites do this.

**Files:**
- Modify: `jest.config.js:28-29`
- Modify: `src/functions/__tests__/uipath-dispatcher-dynamic.test.js:58`
- Modify: `src/templates/__tests__/generic-document-processor.test.js:168`
- Modify: `src/shared/uipath-dynamic-queue-client.js:12-16`

**Interfaces:**
- Consumes: nothing
- Produces: a green `npm test` baseline that later tasks rely on as a safety net

- [ ] **Step 1: Confirm the current failure count**

Run: `npx jest 2>&1 | tail -5`
Expected: `Tests: 14 failed, 131 passed, 145 total`

- [ ] **Step 2: Remove the transform override**

In `jest.config.js`, replace the line `    transform: {},` with:

```js
    // (no transform override — jest default babel-jest is required for jest.mock hoisting)
```

- [ ] **Step 3: Re-run and confirm most failures clear**

Run: `npx jest 2>&1 | tail -5`
Expected: `Tests: 2 failed, 143 passed, 145 total`

- [ ] **Step 4: Fix the wrong mock path**

In `src/functions/__tests__/uipath-dispatcher-dynamic.test.js`, the mock target resolves relative to the test file's own directory, so `'./uipath-dispatcher'` points at the non-existent `src/functions/__tests__/uipath-dispatcher`. Change:

```js
jest.mock('./uipath-dispatcher', () => ({
```

to:

```js
jest.mock('../uipath-dispatcher', () => ({
```

- [ ] **Step 5: Correct the buildReference expectation**

`buildReference` uses `.replace(/[\s,]+/g, '_')`, which collapses a run of whitespace/commas into a **single** underscore. Live production references already use this format (e.g. `SPDOC_GLJE___3_16_2026-…`), so the implementation is correct and the test assertion is wrong.

In `src/templates/__tests__/generic-document-processor.test.js:168`, change:

```js
expect(reference).toBe('SPDOC_My_Document__Version_2.pdf_1_1234567890');
```

to:

```js
expect(reference).toBe('SPDOC_My_Document_Version_2.pdf_1_1234567890');
```

- [ ] **Step 6: Store context on the dynamic queue client**

The test asserts `client.context`, but the constructor never assigns it. `GenericDocumentProcessor` already stores `this.context`, so this makes the two consistent. In `src/shared/uipath-dynamic-queue-client.js`, change the constructor body:

```js
    constructor(context = null, configOverrides = null) {
        this.logger = createLogger(context);
        this.baseClient = createUiPathQueueClient(context, configOverrides);
    }
```

to:

```js
    constructor(context = null, configOverrides = null) {
        this.logger = createLogger(context);
        this.context = context;
        this.baseClient = createUiPathQueueClient(context, configOverrides);
    }
```

- [ ] **Step 7: Run the full suite**

Run: `npx jest 2>&1 | tail -5`
Expected: `Tests: 145 passed, 145 total`, `Test Suites: 8 passed, 8 total`

- [ ] **Step 8: Commit**

```bash
git add jest.config.js src/functions/__tests__/uipath-dispatcher-dynamic.test.js \
        src/templates/__tests__/generic-document-processor.test.js \
        src/shared/uipath-dynamic-queue-client.js
git commit -m "fix: restore green test suite

jest.config.js set transform:{} which disabled babel-jest, so jest.mock calls
were never hoisted and mocks declared after require() silently did not apply.
Also fixes a mock path that resolved to a non-existent module, corrects a
buildReference assertion that contradicted the live reference format, and
stores context on DynamicUiPathQueueClient for parity with the other clients."
```

---

### Task 2: Handler enqueues behind the ASYNC_PROCESSING flag

**Files:**
- Modify: `src/functions/webhook-handler.js` — imports, `app.http` registration options, the POST processing branch, and a new `module.exports` at end of file
- Create: `src/functions/__tests__/webhook-handler.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `buildQueueMessages(notifications: object[], receivedAt: string): string[]` — JSON-serialized queue messages
  - `processNotification(notification: object, context: object): Promise<void>` — exported for the worker
  - `enrichNotificationsWithClientState(notifications: object[], context: object): Promise<object[]>` — exported for the worker

- [ ] **Step 1: Write the failing test**

Create `src/functions/__tests__/webhook-handler.test.js`:

```js
// Capture registrations so the registered handler can be exercised directly.
jest.mock('@azure/functions', () => {
    const registered = {};
    return {
        __registered: registered,
        app: {
            http: jest.fn((name, options) => { registered[name] = options; }),
            storageQueue: jest.fn()
        },
        output: { storageQueue: jest.fn(() => ({ type: 'queue' })) }
    };
});

const { buildQueueMessages } = require('../webhook-handler');

describe('webhook-handler', () => {
    describe('buildQueueMessages', () => {
        it('produces one JSON message per notification, stamped with receivedAt', () => {
            const notifications = [
                { subscriptionId: 'sub-1', resource: 'sites/a/lists/b', changeType: 'updated' },
                { subscriptionId: 'sub-2', resource: 'sites/c/lists/d', changeType: 'updated' }
            ];

            const messages = buildQueueMessages(notifications, '2026-08-18T00:00:00.000Z');

            expect(messages).toHaveLength(2);
            expect(JSON.parse(messages[0])).toEqual({
                subscriptionId: 'sub-1',
                resource: 'sites/a/lists/b',
                changeType: 'updated',
                receivedAt: '2026-08-18T00:00:00.000Z'
            });
            expect(JSON.parse(messages[1]).subscriptionId).toBe('sub-2');
        });

        it('returns an empty array for no notifications', () => {
            expect(buildQueueMessages([], '2026-08-18T00:00:00.000Z')).toEqual([]);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/functions/__tests__/webhook-handler.test.js`
Expected: FAIL — `buildQueueMessages is not a function`

- [ ] **Step 3: Add the queue output binding and helper**

In `src/functions/webhook-handler.js`, change the first import line:

```js
const { app } = require('@azure/functions');
```

to:

```js
const { app, output } = require('@azure/functions');
```

Then immediately after the `require` block (after the `constants` destructure ending on line 16), add:

```js
// Queue used to move notification processing off the HTTP request path.
// Graph requires a 2xx within 3 seconds; processing inline exceeds that during bursts.
const notificationQueueOutput = output.storageQueue({
    queueName: 'webhook-notifications',
    connection: 'AzureWebJobsStorage'
});

/**
 * Build one queue message per notification.
 * @param {Array<Object>} notifications
 * @param {string} receivedAt - ISO timestamp the handler received the batch
 * @returns {Array<string>} JSON-serialized messages
 */
function buildQueueMessages(notifications, receivedAt) {
    return notifications.map(notification => JSON.stringify({ ...notification, receivedAt }));
}
```

- [ ] **Step 4: Register the output binding**

Change the registration options:

```js
app.http('webhook-handler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: wrapHandler(async (request, context) => {
```

to:

```js
app.http('webhook-handler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    extraOutputs: [notificationQueueOutput],
    handler: wrapHandler(async (request, context) => {
```

- [ ] **Step 5: Add the async branch**

Step 3 shifted the line numbers, so locate this block by content. Inside the `if (request.method === 'POST')` branch, replace everything from the `// Enrich notifications with stored clientState…` comment through the closing `};` of that branch's `return` statement — i.e. this exact existing code:

```js
            // Enrich notifications with stored clientState from SharePoint tracking list
            const enrichedNotifications = await enrichNotificationsWithClientState(validatedData.value, context);

            // Process each enriched notification
            logger.info('Processing webhook notifications', {
                count: enrichedNotifications.length
            });

            for (const notification of enrichedNotifications) {
                await processNotification(notification, context);
            }
            
            const duration = Date.now() - startTime;
            logger.logResponse(200, duration, {
                notificationCount: validatedData.value.length
            });
            
            return {
                status: HTTP_STATUS.OK,
                body: SUCCESS_MESSAGES.NOTIFICATION_PROCESSED
            };
```

with:

```js
            // Async path: enqueue and return immediately so Graph always sees a fast 2xx.
            // Enrichment and processing happen in notification-worker.
            if (process.env.ASYNC_PROCESSING === 'true') {
                const receivedAt = new Date().toISOString();
                context.extraOutputs.set(
                    notificationQueueOutput,
                    buildQueueMessages(validatedData.value, receivedAt)
                );

                const duration = Date.now() - startTime;
                logger.info('Enqueued notifications for async processing', {
                    count: validatedData.value.length,
                    durationMs: duration
                });

                return {
                    status: HTTP_STATUS.ACCEPTED,
                    body: 'Accepted'
                };
            }

            // Inline path (ASYNC_PROCESSING off) — unchanged legacy behavior, retained for rollback.
            const enrichedNotifications = await enrichNotificationsWithClientState(validatedData.value, context);

            logger.info('Processing webhook notifications', {
                count: enrichedNotifications.length
            });

            for (const notification of enrichedNotifications) {
                await processNotification(notification, context);
            }

            const duration = Date.now() - startTime;
            logger.logResponse(200, duration, {
                notificationCount: validatedData.value.length
            });

            return {
                status: HTTP_STATUS.OK,
                body: SUCCESS_MESSAGES.NOTIFICATION_PROCESSED
            };
```

- [ ] **Step 6: Add the ACCEPTED status constant**

Check whether `HTTP_STATUS.ACCEPTED` exists:

Run: `grep -n "ACCEPTED" src/shared/constants.js`

If it prints nothing, add `ACCEPTED: 202,` to the `HTTP_STATUS` object in `src/shared/constants.js`, immediately after the `OK: 200,` line.

- [ ] **Step 7: Export the helpers**

Append to the end of `src/functions/webhook-handler.js`:

```js
module.exports = {
    buildQueueMessages,
    processNotification,
    enrichNotificationsWithClientState
};
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest src/functions/__tests__/webhook-handler.test.js`
Expected: PASS, 2 tests

- [ ] **Step 9: Add handler-level regression tests**

The `validationToken` handshake is the highest-risk regression in this change: if it breaks, no new webhook can ever be created, and the failure stays invisible until someone tries. Append this to `src/functions/__tests__/webhook-handler.test.js`, inside the outer `describe('webhook-handler', …)` block:

```js
    describe('registered HTTP handler', () => {
        const getHandler = () =>
            require('@azure/functions').__registered['webhook-handler'].handler;

        const makeContext = () => ({
            invocationId: 'test-invocation',
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            extraOutputs: { set: jest.fn() }
        });

        const makeRequest = ({ method = 'GET', query = {}, body = '' } = {}) => ({
            method,
            url: 'https://example.com/api/webhook-handler',
            query: new URLSearchParams(query),
            headers: new Map(),
            text: jest.fn().mockResolvedValue(body)
        });

        afterEach(() => {
            delete process.env.ASYNC_PROCESSING;
        });

        it('echoes the validationToken as plain text with status 200', async () => {
            const context = makeContext();
            const request = makeRequest({ query: { validationToken: 'abc123' } });

            const response = await getHandler()(request, context);

            expect(response.status).toBe(200);
            expect(response.body).toBe('abc123');
            expect(response.headers['Content-Type']).toMatch(/text\/plain/);
        });

        it('enqueues and returns 202 when ASYNC_PROCESSING is enabled', async () => {
            process.env.ASYNC_PROCESSING = 'true';
            const context = makeContext();
            const request = makeRequest({
                method: 'POST',
                body: JSON.stringify({
                    value: [{
                        subscriptionId: 'sub-1',
                        resource: 'sites/a/lists/b',
                        changeType: 'updated',
                        clientState: ''
                    }]
                })
            });

            const response = await getHandler()(request, context);

            expect(response.status).toBe(202);
            expect(context.extraOutputs.set).toHaveBeenCalledTimes(1);
            const [, messages] = context.extraOutputs.set.mock.calls[0];
            expect(messages).toHaveLength(1);
            expect(JSON.parse(messages[0]).subscriptionId).toBe('sub-1');
        });
    });
```

Note on coverage: the inline path (flag off) is deliberately not unit-tested here, because exercising it would require mocking the full Graph and UiPath call chain. It is verified instead by the no-op deployment in Task 5, which is a stronger guarantee — it checks the real deployed code against production.

- [ ] **Step 10: Run the handler tests**

Run: `npx jest src/functions/__tests__/webhook-handler.test.js`
Expected: PASS, 4 tests

If the `Content-Type` assertion fails, check the exact header constant in `src/shared/constants.js` (`HTTP_HEADERS.CONTENT_TYPE_TEXT`) and match the assertion to it rather than changing the handler.

- [ ] **Step 11: Run the full suite for regressions**

Run: `npx jest 2>&1 | tail -5`
Expected: `Tests: 149 passed, 149 total`

- [ ] **Step 12: Commit**

```bash
git add src/functions/webhook-handler.js src/functions/__tests__/webhook-handler.test.js src/shared/constants.js
git commit -m "feat: add ASYNC_PROCESSING queue path to webhook-handler

When ASYNC_PROCESSING=true the handler enqueues one message per notification
and returns 202 immediately, keeping the response under Graph's 3-second
threshold regardless of burst size. The inline path is retained unchanged
behind the flag so rollback is a config change."
```

---

### Task 3: Create the notification-worker queue trigger

**Files:**
- Create: `src/functions/notification-worker.js`
- Create: `src/functions/__tests__/notification-worker.test.js`

**Interfaces:**
- Consumes: `processNotification`, `enrichNotificationsWithClientState` from `src/functions/webhook-handler.js` (Task 2)
- Produces: `handleQueueMessage(message: string|object, context: object): Promise<void>` — throws on failure so the queue retries

- [ ] **Step 1: Write the failing test**

Create `src/functions/__tests__/notification-worker.test.js`:

```js
jest.mock('@azure/functions', () => ({
    app: { http: jest.fn(), storageQueue: jest.fn() },
    output: { storageQueue: jest.fn(() => ({ type: 'queue' })) }
}));

jest.mock('../webhook-handler', () => ({
    processNotification: jest.fn(() => Promise.resolve()),
    enrichNotificationsWithClientState: jest.fn(notifications =>
        Promise.resolve(notifications.map(n => ({ ...n, clientState: 'enriched' })))
    )
}));

const { handleQueueMessage } = require('../notification-worker');
const { processNotification, enrichNotificationsWithClientState } = require('../webhook-handler');

describe('notification-worker', () => {
    const context = { invocationId: 'test', log: jest.fn(), error: jest.fn(), warn: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('enriches then processes a JSON string message', async () => {
        const message = JSON.stringify({ subscriptionId: 'sub-1', resource: 'sites/a/lists/b' });

        await handleQueueMessage(message, context);

        expect(enrichNotificationsWithClientState).toHaveBeenCalledTimes(1);
        expect(processNotification).toHaveBeenCalledTimes(1);
        expect(processNotification.mock.calls[0][0].clientState).toBe('enriched');
    });

    it('accepts an already-parsed object message', async () => {
        await handleQueueMessage({ subscriptionId: 'sub-2', resource: 'sites/c/lists/d' }, context);

        expect(processNotification).toHaveBeenCalledTimes(1);
        expect(processNotification.mock.calls[0][0].subscriptionId).toBe('sub-2');
    });

    it('rethrows so the queue retries the message', async () => {
        processNotification.mockRejectedValueOnce(new Error('UiPath submission failed'));

        await expect(
            handleQueueMessage(JSON.stringify({ subscriptionId: 'sub-3' }), context)
        ).rejects.toThrow('UiPath submission failed');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/functions/__tests__/notification-worker.test.js`
Expected: FAIL — `Cannot find module '../notification-worker'`

- [ ] **Step 3: Write the worker**

Create `src/functions/notification-worker.js`:

```js
/**
 * Notification Worker
 * Processes SharePoint webhook notifications off the HTTP request path.
 *
 * webhook-handler enqueues one message per notification and returns 202 so that
 * Microsoft Graph always receives a fast 2xx. All Graph fetches, deduplication,
 * and UiPath submissions happen here, where nothing is waiting on the result.
 *
 * Failures are rethrown so the storage queue retries the message; after
 * maxDequeueCount attempts it lands in webhook-notifications-poison.
 */

const { app } = require('@azure/functions');
const { createLogger } = require('../shared/logger');
const {
    processNotification,
    enrichNotificationsWithClientState
} = require('./webhook-handler');

/**
 * Handle a single queued notification.
 * @param {string|Object} message - Queue message (JSON string or parsed object)
 * @param {Object} context - Azure Functions context
 * @returns {Promise<void>}
 */
async function handleQueueMessage(message, context) {
    const logger = createLogger(context);
    const notification = typeof message === 'string' ? JSON.parse(message) : message;

    logger.info('Processing queued notification', {
        subscriptionId: notification.subscriptionId,
        resource: notification.resource,
        receivedAt: notification.receivedAt,
        dequeueCount: context.triggerMetadata?.dequeueCount
    });

    // clientState is not returned by Graph, so it is looked up here rather than
    // on the request path where the extra Graph call would cost response time.
    const [enriched] = await enrichNotificationsWithClientState([notification], context);

    await processNotification(enriched, context);

    logger.info('Queued notification processed', {
        subscriptionId: notification.subscriptionId
    });
}

app.storageQueue('notification-worker', {
    queueName: 'webhook-notifications',
    connection: 'AzureWebJobsStorage',
    handler: handleQueueMessage
});

module.exports = {
    handleQueueMessage
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/functions/__tests__/notification-worker.test.js`
Expected: PASS, 3 tests

- [ ] **Step 5: Run the full suite**

Run: `npx jest 2>&1 | tail -5`
Expected: `Tests: 152 passed, 152 total`

- [ ] **Step 6: Commit**

```bash
git add src/functions/notification-worker.js src/functions/__tests__/notification-worker.test.js
git commit -m "feat: add notification-worker storage queue trigger

Reuses processNotification unchanged. clientState enrichment moves here from
the request path, where it cost a Graph round-trip per notification. Failures
rethrow so the queue retries and eventually poisons rather than silently
dropping work, which is what happens today."
```

---

### Task 4: Configure the queue for serial processing

**Files:**
- Modify: `host.json`

**Interfaces:**
- Consumes: nothing
- Produces: no signature changes

> **Sequencing note.** An earlier draft of this task also deleted the in-memory
> loop-prevention map. That was deferred to Task 7 (after the async path is verified in
> production) so that flag-off behavior stays byte-for-byte today's behavior throughout the
> deploy-and-enable window, preserving the Layer-1 rollback guarantee exactly when it matters
> most.

- [ ] **Step 1: Add queue extension config**

In `host.json`, add an `extensions` block as a sibling of `logging` and `extensionBundle`:

```json
  "extensions": {
    "queues": {
      "batchSize": 1,
      "newBatchThreshold": 0,
      "maxDequeueCount": 5,
      "visibilityTimeout": "00:00:30"
    }
  },
```

`batchSize: 1` with `newBatchThreshold: 0` serializes processing. This is required because the deduplicator is check-then-act — `wasRecentlyProcessed` runs, then `recordProcessed` only after submission — so concurrent workers can both pass the check for the same item and double-submit. Throughput is not a concern: ~400 documents/day at 365 ms is roughly 2.5 minutes of work per day.

- [ ] **Step 2: Verify host.json is valid JSON**

Run: `node -e "console.log(JSON.stringify(require('./host.json').extensions.queues))"`
Expected: `{"batchSize":1,"newBatchThreshold":0,"maxDequeueCount":5,"visibilityTimeout":"00:00:30"}`

- [ ] **Step 3: Run the full suite**

Run: `npx jest 2>&1 | tail -5`
Expected: `Tests: 152 passed, 152 total`

- [ ] **Step 4: Commit**

```bash
git add host.json
git commit -m "feat: serialize storage queue processing

The deduplicator is check-then-act, so concurrent workers can both pass the
check for the same item and double-submit. batchSize 1 serializes processing;
throughput is not a concern at ~400 documents/day."
```

### Task 5: Capture rollback state and deploy with the flag off

This task makes no code changes. Its deliverable is a verified no-op deployment plus a recorded rollback point.

**Files:**
- Create: `docs/superpowers/plans/rollback-state-2026-08-18.md`

**Interfaces:**
- Consumes: all prior tasks
- Produces: a deployed package whose behavior is identical to today

- [ ] **Step 1: Snapshot current app settings**

```bash
az functionapp config appsettings list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  -o json > /tmp/appsettings-backup-2026-08-18.json
echo "settings captured: $(python3 -c "import json;print(len(json.load(open('/tmp/appsettings-backup-2026-08-18.json'))))")"
```

Expected: `settings captured: 24`

- [ ] **Step 2: Record the rollback point**

Create `docs/superpowers/plans/rollback-state-2026-08-18.md`:

```markdown
# Rollback State — 2026-08-18

## Current production package (rollback target)
`20260105174917-9806a121-fca5-4e37-bf07-fb0be0b429c5.zip`
Container `function-releases`, storage account `webhookstorageacct002`.
Verified: this package's `src/` matches repo commit `945b958` exactly.

## Active webhooks that must keep working
- `cf16bc07-2238-4f6b-b76c-4bb21f929987` — Accounting_Research
  `destination:uipath|handler:document|queue:FIN_SCAN_Rename_And_Storage|tenant:PROD|folder:606837|changeDetection:enabled`
- `023a2ed7-c5c3-4b85-bf76-24a1baf30474` — COSTCO Routing Tracker
  `destination:uipath|handler:costco|queue:Trafficking_Request_Email_Trigger_Queue|tenant:PROD|folder:376892`

## Baseline delivery coverage
1,709 of 1,715 library documents reached the queue for 2026-07-27 → 2026-08-12.

## Rollback procedure (in order)
1. `az functionapp config appsettings set ... --settings ASYNC_PROCESSING=false`
2. Wait for queue `webhook-notifications` to reach depth 0.
3. Only if still broken: repoint `WEBSITE_RUN_FROM_PACKAGE` to the package above, then restart.

Step 2 must not be skipped — rolling back the package removes the worker, and
in-flight messages would be stranded until a forward deploy.

## App settings backup
`/tmp/appsettings-backup-2026-08-18.json` (copy somewhere durable before relying on it)
```

- [ ] **Step 3: Explicitly set the flag off before deploying**

```bash
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings ASYNC_PROCESSING=false
```

Setting it explicitly rather than relying on absence makes the rollback toggle symmetric.

- [ ] **Step 4: Deploy**

```bash
npm run deploy
```

- [ ] **Step 5: Verify the deployment is a behavioral no-op**

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler?validationToken=plantest"
```

Expected: `200`

```bash
curl -s "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler?validationToken=plantest"
```

Expected: `plantest` (plain text, echoed exactly)

- [ ] **Step 6: Confirm the new package is recorded**

```bash
az functionapp config appsettings list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --query "[?name=='WEBSITE_RUN_FROM_PACKAGE'].value" -o tsv
```

Expected: a new blob URL different from `20260105174917-…`. Record it in the rollback doc as the forward point.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/rollback-state-2026-08-18.md
git commit -m "docs: record rollback state for async processing deploy"
```

---

### Task 6: Enable async processing and verify

**Files:** none (operational)

**Interfaces:**
- Consumes: Task 5's deployment
- Produces: async path live in production

- [ ] **Step 1: Enable the flag**

```bash
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings ASYNC_PROCESSING=true
```

- [ ] **Step 2: Confirm the handler still answers the validation handshake**

```bash
curl -s "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler?validationToken=plantest2"
```

Expected: `plantest2`

- [ ] **Step 3: Upload a test document and confirm the queue drains**

Upload any document to the Accounting_Research Documents library, then:

```bash
az storage queue stats --name webhook-notifications \
  --account-name webhookstorageacct002 --auth-mode key 2>/dev/null || \
az storage message peek --queue-name webhook-notifications \
  --account-name webhookstorageacct002 --auth-mode key --num-messages 5 -o table
```

Expected: no backlog after a few seconds — messages are consumed as fast as they arrive.

- [ ] **Step 4: Confirm the poison queue is empty**

```bash
az storage message peek --queue-name webhook-notifications-poison \
  --account-name webhookstorageacct002 --auth-mode key --num-messages 5 -o table 2>&1 | tail -3
```

Expected: no messages (or the queue does not exist yet, which is equivalent).

- [ ] **Step 5: Verify the uploaded document reached UiPath**

Confirm a new queue item exists in `FIN_SCAN_Rename_And_Storage`, folder `606837`, PROD tenant, whose `SpecificContent.ItemId` matches the uploaded SharePoint item.

- [ ] **Step 6: If anything is wrong, roll back**

```bash
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings ASYNC_PROCESSING=false
```

Then follow `docs/superpowers/plans/rollback-state-2026-08-18.md`.

---

### Task 7: Remove the in-memory loop map

Only after Task 6 is verified stable. Deferred to here so that flag-off behavior stayed
byte-for-byte today's behavior throughout the deploy-and-enable window.

The module-level `recentNotifications` map drops any notification arriving within 10 seconds of
the previous one **for the same subscription+resource** — precisely the condition during an
upload burst. It silently discards processing passes and is superseded by the Table Storage
deduplicator, which works per-item and survives across instances.

**Files:**
- Modify: `src/functions/webhook-handler.js` — the map declaration and the loop-detection block inside `processNotification`
- Modify: `src/shared/config.js` — remove the now-unused `loopPreventionWindow` entry

**Interfaces:**
- Consumes: verified async path from Task 6
- Produces: no signature changes

- [ ] **Step 1: Delete the map declaration**

In `src/functions/webhook-handler.js`, delete these three lines:

```js
// Track recent notifications to prevent loops
const recentNotifications = new Map();
const LOOP_PREVENTION_WINDOW = config.webhook.loopPreventionWindow;
```

- [ ] **Step 2: Delete the loop-detection block**

Inside `processNotification`, delete this entire block:

```js
        // Create notification key for loop detection
        const notificationKey = `${notification.subscriptionId}-${notification.resource}`;
        const now = Date.now();
        
        // Check if we've seen this notification recently
        const lastSeen = recentNotifications.get(notificationKey);
        if (lastSeen && (now - lastSeen) < LOOP_PREVENTION_WINDOW) {
            const logger = createLogger(context);
            logger.warn('Duplicate notification detected, skipping to prevent loop', {
                notificationKey,
                timeSinceLastSeen: now - lastSeen
            });
            return;
        }
        
        // Record this notification
        recentNotifications.set(notificationKey, now);
        
        // Clean up old entries
        for (const [key, timestamp] of recentNotifications.entries()) {
            if (now - timestamp > LOOP_PREVENTION_WINDOW * 2) {
                recentNotifications.delete(key);
            }
        }
        
```

The next statement, `const logger = createLogger(context);`, becomes the first line of the `try` block.

- [ ] **Step 3: Remove the orphaned config entry**

`loopPreventionWindow` now has no consumers. In `src/shared/config.js`, delete this line from the `webhook` block:

```js
        loopPreventionWindow: 10000 // 10 seconds
```

Remove the trailing comma from the preceding line (`notificationTimeout: 10000, // 10 seconds`) so the object literal stays valid.

- [ ] **Step 4: Verify no dangling references**

Run: `grep -rn "loopPreventionWindow\|LOOP_PREVENTION_WINDOW\|recentNotifications" src/`
Expected: no output

- [ ] **Step 5: Verify config still parses**

Run: `node -e "console.log(JSON.stringify(require('./src/shared/config').webhook))"`
Expected: valid JSON without a `loopPreventionWindow` key

- [ ] **Step 6: Run the full suite**

Run: `npx jest 2>&1 | tail -5`
Expected: `Tests: 152 passed, 152 total`

- [ ] **Step 7: Commit and deploy**

```bash
git add src/functions/webhook-handler.js src/shared/config.js
git commit -m "fix: remove in-memory loop-prevention map

The 10-second per-subscription map dropped notifications during bursts, which
is exactly when SharePoint fires most often. The Table Storage deduplicator
supersedes it: per-item rather than per-subscription, and it survives across
instances. Deferred until after the async path was verified so that flag-off
rollback stayed byte-for-byte through the rollout."
npm run deploy
```

- [ ] **Step 8: Verify processing still succeeds**

Upload a document to the Accounting_Research library and confirm it produces a queue item in `FIN_SCAN_Rename_And_Storage`.

---

### Task 8: Widen the lookback window

Only after Task 6 is verified stable. This is what actually recovers the loss: with the handler no longer throttled, a wider window closes any gap that does occur.

**Files:**
- Modify: `src/functions/uipath-dispatcher.js:313`

**Interfaces:**
- Consumes: verified async path
- Produces: no signature changes

- [ ] **Step 1: Widen the window**

In `src/functions/uipath-dispatcher.js`, change:

```js
                    const recentItems = await forwarder.getRecentItems(resource, 300);
```

to:

```js
                    // 30-minute lookback. Graph notification delivery can lag well past five
                    // minutes; the 2026-07-28 loss was a 10.4-minute gap. The Table Storage
                    // deduplicator (30-minute window) absorbs the resulting overlap.
                    const recentItems = await forwarder.getRecentItems(resource, 1800);
```

- [ ] **Step 2: Run the full suite**

Run: `npx jest 2>&1 | tail -5`
Expected: `Tests: 152 passed, 152 total`

- [ ] **Step 3: Commit and deploy**

```bash
git add src/functions/uipath-dispatcher.js
git commit -m "fix: widen recent-items lookback from 300s to 1800s

The 2026-07-28 loss was a 10.4-minute gap between upload and the next
processed notification; a 5-minute lookback could not reach back across it.
Safe now that the handler no longer blocks on submission, and the 30-minute
deduplicator absorbs the wider overlap."
npm run deploy
```

- [ ] **Step 4: Verify no duplicate submissions appear**

After the next burst, confirm the number of queue items created is not inflated relative to the number of documents modified. The deduplicator should suppress the overlap the wider window introduces.

---

### Task 9: Raise the fetch ceiling

**Files:**
- Modify: `src/shared/enhanced-forwarder.js:63`, `:96`

**Interfaces:**
- Consumes: Tasks 6, 7 and 8 verified
- Produces: no signature changes

Verified against the live library: Graph honors `$orderby=lastModifiedDateTime desc` on SharePoint listItems despite the published reference listing only `$filter` and `$expand`, and `$top=200` is honored with `@odata.nextLink` present. Maximum observed occupancy of a 300-second window was 100 items, so a single 200-item page covers observed traffic.

- [ ] **Step 1: Raise both queries**

In `src/shared/enhanced-forwarder.js`, change **both** line 63 and line 96 from:

```js
            const listUrl = `https://graph.microsoft.com/v1.0/${resource}/items?$expand=fields&$orderby=lastModifiedDateTime desc&$top=20`;
```

to:

```js
            const listUrl = `https://graph.microsoft.com/v1.0/${resource}/items?$expand=fields&$orderby=lastModifiedDateTime desc&$top=200`;
```

- [ ] **Step 2: Confirm both call sites changed**

Run: `grep -c 'top=200' src/shared/enhanced-forwarder.js`
Expected: `2`

Run: `grep -c 'top=20&\|top=20`' src/shared/enhanced-forwarder.js`
Expected: `0`

- [ ] **Step 3: Run the full suite**

Run: `npx jest 2>&1 | tail -5`
Expected: `Tests: 152 passed, 152 total`

- [ ] **Step 4: Commit and deploy**

```bash
git add src/shared/enhanced-forwarder.js
git commit -m "fix: raise recent-items fetch ceiling from 20 to 200

Bursts of exactly 20 occurred 48 times in 27 days, so the cap was binding.
Max observed occupancy of the lookback window is 100, so a single 200-item
page covers it. Safe now that handler response time no longer scales with
batch size."
npm run deploy
```

- [ ] **Step 5: Verify end-to-end**

Upload a burst of more than 20 documents to the Accounting_Research library. Confirm every document produces a queue item in `FIN_SCAN_Rename_And_Storage`, and that the handler still returns quickly.

- [ ] **Step 6: Re-run the reconciliation**

Re-run the library-versus-queue comparison for a window covering the burst. Expected: 100% coverage, improving on the 1,709/1,715 baseline.

---

## Deferred (recorded, not in this plan)

- `src/shared/uipath-queue-client.js:590` — `getQueueItems()` filters on `QueueDefinitionName`, which Orchestrator rejects with HTTP 400. The valid property is `QueueDefinitionId`. Diagnostics-only, failing unnoticed.
- App Insights retains only ~25 minutes of traces, so post-hoc incident diagnosis is not currently possible. Worth addressing before the next incident.
- 13 queue items in `Failed` status (robot-side, not delivery).
- Extracting `processNotification` and friends out of `webhook-handler.js` into a shared module. The worker currently imports them from the handler, which works but couples the two. Deferred because moving ~200 lines risks behavior change against the "maintain functionality" constraint.
- Migrating to delta query (`src/shared/delta-tracker.js` exists but is unused).
