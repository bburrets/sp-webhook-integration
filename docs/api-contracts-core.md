# API Contracts – Core Azure Functions Backend

This project exposes eight HTTP-triggered Azure Functions (plus one timer trigger). Each endpoint is defined in `src/functions/*` and uses shared modules for authentication, logging, telemetry, and downstream orchestration. Routes default to `/{functionName}` because no custom `route` property is specified.

## Endpoint Summary

| Function | Methods | Auth Level | Purpose | Key Integrations |
| --- | --- | --- | --- | --- |
| `webhook-handler` | `GET`, `POST` | `anonymous` | Microsoft Graph webhook entrypoint. Handles validation tokens on `GET`, processes SharePoint change notifications on `POST`, deduplicates events, enriches payloads, and forwards to UiPath or proxy targets when required. | `shared/validators`, `shared/enhanced-forwarder`, `shared/auth`, `shared/logger`, `shared/constants`, `uipath-dispatcher` |
| `uipath-dispatcher` | `POST` | `anonymous` | Consumes validated webhook payloads (usually forwarded by `webhook-handler`) and submits them to UiPath queues via `shared/uipath-queue-client`. Applies routing templates (Costco) and enhanced forwarding hooks. | `shared/uipath-queue-client`, `shared/logger`, `shared/constants`, `templates/costco-inline-routing` |
| `subscription-manager` | `GET`, `POST`, `DELETE` | `function` | Creates, lists, and deletes SharePoint webhook subscriptions through Microsoft Graph. Performs request validation and background sync to SharePoint management list. | `shared/auth`, `shared/validators`, `shared/config`, Microsoft Graph REST endpoints |
| `webhook-sync` | `POST` (+ timer `"webhook-sync-timer"`) | `function` | Reconciles Graph subscriptions with SharePoint “Webhook Management” list. HTTP trigger supports manual sync; timer trigger executes hourly. | `shared/auth`, `shared/config`, Microsoft Graph REST endpoints |
| `initialize-item-states` | `POST` | `function` | Seeds `SharePointItemStates` table with baseline state for list items to support change detection. | `shared/auth`, Azure Table Storage (`@azure/data-tables`) |
| `uipath-test` | `GET`, `POST` | `anonymous` | Diagnostic harness for UiPath integration. Runs authentication, queue submission, template processing, and dispatcher workflow tests depending on `test` query parameter. | `shared/uipath-auth`, `shared/uipath-queue-client`, `uipath-dispatcher`, `templates/costco-inline-routing` |
| `test-queue-submission` | `GET`, `POST` | `function` | Lightweight utility to submit synthetic payloads to UiPath queues for manual validation. | `shared/uipath-queue-client`, `shared/logger` |
| `health-check` | `GET` | `function` | Comprehensive health probe that checks Graph subscriptions, Azure Table Storage, SharePoint API availability, metrics, and system resources. Returns 200 (“healthy/degraded”) or 503 (“unhealthy/critical”). | `@azure/data-tables`, Microsoft Graph REST endpoints, `shared/logger` |

## Cross-cutting Concerns

- **Authentication**: `shared/auth.js` centralizes Azure AD token acquisition; endpoints with `authLevel: function` typically expect an `x-functions-key` along with managed identity credentials.
- **Validation**: `shared/validators.js` guards incoming payloads (`validateWebhookNotification`, `validateSubscriptionRequest`, `validateGuid`).
- **Logging & Metrics**: `shared/logger.js` and `shared/metrics-collector.js` provide structured logging and Azure Table Storage telemetry.
- **Forwarding & Routing**: `shared/enhanced-forwarder.js` enables fan-out to external webhooks. UiPath queue interactions orchestrated by `shared/uipath-queue-client.js`.

Total documented endpoints: **8** HTTP triggers + **1** timer trigger.
