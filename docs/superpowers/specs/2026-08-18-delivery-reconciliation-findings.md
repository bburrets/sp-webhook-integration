# FIN_SCAN_Rename_And_Storage — Delivery Reconciliation
Run 2026-08-18. All queries read-only.

## Scope / confidence
- UiPath PROD, folder 606837, queue FIN_SCAN_Rename_And_Storage (QueueDefinitionId 101607, created 2025-11-26).
- Queue holds 1,821 items spanning 2026-07-16 -> 2026-08-12 (27 days). Older items purged by retention.
- **Loss before 2026-07-16 cannot be assessed** — the evidence no longer exists.
- App Insights retains only ~25 min of traces, so historical incidents cannot be log-confirmed.

## Result (clean window 2026-07-27 -> 2026-08-12)
- Library documents modified: 1,715
- Reached the queue: 1,709
- **Never reached: 6 (0.35%)**

## The 6 missing documents (all 2026-07-28)
| SP item id | file | lastModified (UTC) |
|---|---|---|
| 5677 | Costing_012.pdf | 16:23:23 |
| 5678 | Costing_001.pdf | 16:26:02 |
| 5684 | Costing_002.pdf | 16:27:07 |
| 5680 | Costing_003.pdf | 16:27:39 |
| 5683 | Costing_004.pdf | 16:28:13 |
| 5681 | Costing_007.pdf | 16:28:40 |

## Cause: the 300s lookback, NOT the $top=20 cap
Only 11 documents were modified that hour — far below 20, so the cap was not binding.
One notification batch was processed at 16:33:47. Its 300-second lookback begins 16:28:47.
- Modified AFTER 16:28:47 -> all 5 queued (16:29:43, 16:30:20, 16:31:13, 16:31:39, 16:32:21)
- Modified BEFORE 16:28:47 -> all 6 missing
Split is exact (5/5 and 6/6). Timing correlation only; no logs survive to confirm.

## Why $top=20 has not caused loss
Lag from SharePoint lastModified -> queue submission, n=1,723:
p50=37s  p75=67s  p90=103s  p95=120s  p99=160s  max=319s
Notifications arrive far faster than bursts accumulate, so each notification only needs
the handful of items added since the previous one — never close to 20.

## Real risk: the margin on the 300s window is thin
Max observed successful lag is 319s, already past the 300s cutoff.
Anything delayed beyond 300s is dropped silently and never appears in these stats
(survivorship bias — only delivered items can be measured).

## Secondary findings
- 13 queue items in Failed status (robot-side, not delivery): itemIds 6143, 6141, 6075,
  5995, 5756, 5733, 5688, 5686, 5685, 5687, 5679, 5682, 5506. Six are the 2026-07-28 batch.
- 82 of 1,821 items are repeat submissions of an already-queued ItemId (re-saves beyond the
  30-minute dedup window).
- Two webhooks are active, both PROD:
  - cf16bc07-2238-4f6b-b76c-4bb21f929987 Accounting_Research -> FIN_SCAN_Rename_And_Storage, folder 606837
  - 023a2ed7-c5c3-4b85-bf76-24a1baf30474 COSTCO Routing Tracker -> Trafficking_Request_Email_Trigger_Queue, folder 376892
- Folder question settled: live clientState carries folder:606837. Docs and the untracked
  fix-accounting-research-clientstate.js (376892) are both stale.
- src/shared/uipath-queue-client.js getQueueItems() filters on QueueDefinitionName, which
  Orchestrator rejects with HTTP 400 (valid property is QueueDefinitionId).

## ADDENDUM 2026-08-18 — why raising $top 20->100 is unsafe on its own

Microsoft Graph webhook endpoint requirements (documented):
- Must return 2xx within **3 seconds**, else the notification is treated as undelivered.
- >10% of responses over 3s in a 10-min window -> endpoint marked "slow" -> new notifications delayed 10 min.
- >15% of responses over the 10s retry timeout -> endpoint marked "drop" -> notifications DROPPED for 10 min.
- Microsoft's prescribed pattern: persist the notification and return 202 Accepted immediately.

webhook-handler.js:82-84 awaits every UiPath submission before returning to Graph, so
response time scales linearly with batch size.

Measured per-submission cost from 175 real bursts: p50=365ms, p90=458ms.
Validation: observed bursts of exactly 20 took 7.0-8.4s (predicted 7.3s).

Projected synchronous handler time:
   10 items ->  3.6s   past 3s slow threshold
   20 items ->  7.3s   past 3s slow threshold  (CURRENT CEILING)
   50 items -> 18.3s   past 10s drop threshold
  100 items -> 36.5s   past 10s drop threshold (3.6x over)

Bursts of exactly 20 have already occurred 48 times => the cap is binding, and the handler
is already operating past the 3s "slow" threshold.

The 2026-07-28 loss gap was 10.4 minutes (16:23:23 -> 16:33:47), matching the documented
10-minute throttle penalty. Circumstantial but consistent.

CONCLUSION: raising $top to 100 without first decoupling processing from the HTTP response
would push handler time to ~36s, deep into "drop" territory, and would likely INCREASE loss.
Required ordering:
  1. Return 202 immediately; move UiPath submission off the request path (queue/durable).
  2. Then raise $top and widen the 300s lookback — both become safe once step 1 lands.
