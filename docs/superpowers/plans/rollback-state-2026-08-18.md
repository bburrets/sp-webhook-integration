# Rollback State — 2026-08-18

Captured before deploying the async notification processing change
(branch `fix/async-notification-processing`).

## Current production package (ROLLBACK TARGET)

```
20260105174917-9806a121-fca5-4e37-bf07-fb0be0b429c5.zip
```

Container `function-releases`, storage account `webhookstorageacct002`.

Verified: this package's `src/` was diffed against repo commit `945b958` and matches exactly
(only `__tests__/` and `utilities/` differ, both excluded by `.funcignore`). So production before
this deploy == commit `945b958`.

Full setting value (SAS included) is preserved in the app settings backup below.

## App settings backup

`~/webhook-rollback-2026-08-18/appsettings-backup.json` — 24 settings, captured 2026-08-18.

Restore a single setting with:

```bash
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings WEBSITE_RUN_FROM_PACKAGE="<value from backup>"
```

## Active webhooks that must keep working

| Subscription | Target | clientState |
|---|---|---|
| `cf16bc07-2238-4f6b-b76c-4bb21f929987` | Accounting_Research → `FIN_SCAN_Rename_And_Storage`, folder 606837 | `destination:uipath\|handler:document\|queue:FIN_SCAN_Rename_And_Storage\|tenant:PROD\|folder:606837\|changeDetection:enabled` |
| `023a2ed7-c5c3-4b85-bf76-24a1baf30474` | COSTCO Routing Tracker → `Trafficking_Request_Email_Trigger_Queue`, folder 376892 | `destination:uipath\|handler:costco\|queue:Trafficking_Request_Email_Trigger_Queue\|tenant:PROD\|folder:376892` |

## Baseline delivery coverage

1,709 of 1,715 library documents reached the queue for 2026-07-27 → 2026-08-12 (99.65%).
The 6 misses were all one incident on 2026-07-28.

## Environment facts that constrain rollback

- Function App runs on a **Consumption (Dynamic) plan** — deployment slots are NOT available,
  so slot-swap rollback is impossible. `WEBSITE_RUN_FROM_PACKAGE` is the rollback lever.
- Runtime is `Node|20`. Note `src/shared/constants.js` is a genuine ES module, which only loads
  because `require(esm)` is supported on Node >= 20.19. On Node 18, or Node 20.0-20.18, the app
  would fail to start entirely. `package.json` previously claimed `>=18.0.0`; it is now pinned
  to `>=20.19.0` to match reality. Do not lower that floor.

## Rollback procedure — IN THIS ORDER

> **What each layer actually restores.** Layer 1 (`ASYNC_PROCESSING=false`) is a **degraded
> fallback, not a restore.** It reverts async dispatch only — the handler goes back to
> processing inline — but it does **not** revert the shared-path changes that shipped on this
> branch. The in-memory loop-prevention map was deleted, and the 1500 s lookback plus
> `$top=200` live on the SHARED code path used by both the inline and the async route. With the
> flag off, a 5-notification batch can therefore expand to 5 x up to 200 items processed inline
> inside a single HTTP request — potentially **worse** than the pre-branch baseline it is meant
> to restore, and at real risk of blowing Graph's 3-second response deadline.
>
> **Layer 2 (repointing `WEBSITE_RUN_FROM_PACKAGE` to
> `20260105174917-9806a121-fca5-4e37-bf07-fb0be0b429c5.zip`) is the only true restore to
> pre-branch behavior.** If the problem is the async machinery itself, Layer 1 is the right
> first move. If the problem is inline processing volume, latency, or duplicate submissions,
> Layer 1 will not help and may hurt — go to Layer 2.
>
> **Layer 1 now also surrenders the retry guarantee.** The queue's retry/poison behavior exists
> only on the async path. With the flag off, `processNotification`'s return value is discarded by
> the inline loop: a failed UiPath dispatch is logged and execution continues, Graph receives its
> 200, and the notification is gone with no retry. This is newly true as of the C1 fix — before
> it, failures were not propagating on either path. So flipping the flag off trades away failure
> retry, not just async dispatch.
>
> The step ordering below still stands regardless: the queue must be drained before the package
> is rolled back.

1. **Flip the flag off** (seconds, no redeploy) — degraded fallback, see the note above:

```bash
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings ASYNC_PROCESSING=false
```

2. **Wait for the queue to drain** to depth 0:

```bash
az storage message peek --queue-name webhook-notifications \
  --account-name webhookstorageacct002 --auth-mode key --num-messages 1 -o table
```

3. **Repoint the package and restart** — this is the only true restore to pre-branch
   behavior, and is required (not merely optional) whenever the fault is in inline processing
   volume, latency, or duplicate submissions rather than in the async machinery:

```bash
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings WEBSITE_RUN_FROM_PACKAGE="<20260105174917 URL from backup>"
az functionapp restart --name webhook-functions-sharepoint-002 --resource-group rg-sharepoint-webhooks
```

**Step 2 must not be skipped.** Rolling back the package removes the `notification-worker`
function; any in-flight queue messages would be stranded until a forward deploy.

## Forward deploy record

Filled in after the flag-off deploy completes — see "Post-deploy" below.

## Post-deploy (flag-off deploy completed 2026-08-18)

Forward package now live:

```
20260818213008-f743a178-4691-42ee-9b87-ff9eefceeca1.zip
```

`notification-worker - [queueTrigger]` registered successfully alongside the existing HTTP and
timer triggers.

Verified immediately after deploy, with `ASYNC_PROCESSING=false`:

| Check | Result |
|---|---|
| `GET ?validationToken=plantest-deploy-check` | **200**, `text/plain`, body echoed exactly |
| `GET` with no token | **400** (validation error, as before) |
| `ASYNC_PROCESSING` | `false` — inline path active, behavior unchanged |

This deploy is therefore a behavioral no-op; the async path is present but dormant.
