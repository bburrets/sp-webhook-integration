# Component Inventory

## Function Apps (Entry Points)
| Component | Type | Location | Description |
| --- | --- | --- | --- |
| `webhook-handler` | HTTP Trigger | `src/functions/webhook-handler.js` | Primary Microsoft Graph webhook ingress; validates tokens, deduplicates notifications, enriches payloads, routes to UiPath or forwarding targets. |
| `uipath-dispatcher` | HTTP Trigger | `src/functions/uipath-dispatcher.js` | Processes enriched notifications, applies domain templates (Costco), and submits UiPath queue items with retry/backoff. |
| `subscription-manager` | HTTP Trigger | `src/functions/subscription-manager.js` | CRUD lifecycle for SharePoint webhooks, calling Microsoft Graph and syncing to SharePoint management list. |
| `webhook-sync` | HTTP + Timer Trigger | `src/functions/webhook-sync.js` | Hourly reconciliation of Graph subscriptions with SharePoint list records; exposes manual HTTP endpoint. |
| `initialize-item-states` | HTTP Trigger | `src/functions/initialize-item-states.js` | Seeds Azure Table Storage with baseline SharePoint item states for change detection. |
| `uipath-test` | HTTP Trigger | `src/functions/uipath-test.js` | Diagnostic harness verifying UiPath authentication, queue submission, template processing, and dispatcher workflow. |
| `test-queue-submission` | HTTP Trigger | `src/functions/test-queue-submission.js` | Manual queue submission utility for quick validation and smoke tests. |
| `health-check` | HTTP Trigger | `src/functions/health-check.js` | Consolidated health probe covering Graph subscriptions, storage, SharePoint API reachability, and telemetry metrics. |

## Shared Services
| Module | Category | Highlights |
| --- | --- | --- |
| `shared/auth.js` | Authentication | Client-credentials flow for Microsoft Graph; caches tokens, supports token reuse across functions. |
| `shared/uipath-auth.js` | Authentication | Handles UiPath Orchestrator token lifecycle with in-memory caching and telemetry. |
| `shared/config.js` | Configuration | Centralizes environment variables, feature flags, site/list mappings, UiPath configuration, and logging options. |
| `shared/logger.js` | Observability | Structured logging façade with correlation identifiers, integrates with Azure Functions context. |
| `shared/metrics-collector.js` | Observability | Writes notification, forwarding, and health metrics to Azure Table Storage. |
| `shared/constants.js` | Domain Constants | Canonical HTTP codes, client state patterns, UiPath queues, error/success messages. |
| `shared/enhanced-forwarder.js` | Integration | Resilient HTTP forwarding engine with retries, telemetry, and secret-aware logging. |
| `shared/graph-api.js` | Integration | Thin wrapper around Microsoft Graph for subscriptions, lists, batching. |
| `shared/sharepoint-document-handler.js` | Data Processing | Normalizes SharePoint payloads, extracts fields, prepares data for UiPath routing. |
| `shared/validators.js` | Validation | Guards for webhook payloads, subscription requests, GUID formats. |
| `shared/error-handler.js` | Error Handling | Consistent error response shaping, wrapper for Azure Function handlers. |
| `shared/change-detector.js` / `shared/delta-tracker.js` | State Management | Compare new notifications to stored state and track deltas. |

## Templates & Utilities
| Component | Type | Purpose |
| --- | --- | --- |
| `templates/costco-inline-routing.js` | Template | Domain-specific transformation for Costco routing forms prior to UiPath submission. |
| `utilities/apply-html-fix.js` | Utility Script | Patch known SharePoint HTML payload issues. |
| `utilities/discover-costco-list.js`, `utilities/discover-list.js` | Utility Script | Inspect SharePoint lists and metadata for setup. |
| `utilities/auth-cache-monitor.js` | Utility Script | Observe UiPath token cache behaviour. |
| `utilities/update-webhook-metadata.js` | Utility Script | Maintain SharePoint management list entries. |
| `utilities/monitoring-dashboard.js`, `utilities/get-recent-changes.js` | Utility Script | Operational dashboards over telemetry tables and SharePoint lists. |

## Documentation & Workflow Assets
| Asset | Location | Role |
| --- | --- | --- |
| Visitor Onboarding, Deployment, and Setup Guides | `docs/guides/` | End-to-end operational runbooks. |
| Architecture & Monitoring Docs | `docs/architecture/` | Current-state analysis, change detection design, monitoring plans. |
| Troubleshooting Guides | `docs/troubleshooting/` | Structured logging adoption, common error remediation. |
| BMAD Workflows | `bmad/bmm/workflows/*` | Automated documentation/status workflows (workflow-init, workflow-status, document-project). |

## Reuse & Extensibility Notes
- Shared modules are designed to be consumed by new Functions without duplicating logic; use `wrapHandler` and shared logger for consistency.
- EnhancedForwarder supports additional downstream targets by configuration (client state prefix `forward:`).
- Templates folder can host new customer-specific routing logic with minimal coupling to core dispatcher.
