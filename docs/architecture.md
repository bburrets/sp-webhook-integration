# Architecture – SharePoint Webhook Integration Hub

## 1. Executive Summary
The solution is an Azure Functions monolith that brokers SharePoint Online webhook notifications, enriches events with Microsoft Graph, and dispatches actionable payloads to UiPath Orchestrator and optional downstream webhooks. It centralizes webhook lifecycle management, telemetry, and routing so enterprise automation teams can integrate SharePoint changes with robotic workflows.

## 2. Technology Stack
- **Runtime:** Azure Functions v4 (Node.js 18+)
- **Languages:** JavaScript (CommonJS modules)
- **Core Libraries:** `@azure/functions`, `axios` + `axios-retry`, `@azure/data-tables`
- **External Services:** Microsoft Graph (SharePoint), UiPath Orchestrator, Azure Table Storage, optional HTTP forwarding targets
- **Instrumented Modules:** Structured logging (`shared/logger.js`), Metrics collector (`shared/metrics-collector.js`)

## 3. Architecture Pattern
The system follows a serverless integration-hub pattern:
- Azure Functions act as stateless HTTP/timer endpoints.
- Shared service layer (`src/shared/*`) encapsulates authentication, Graph access, UiPath queue submission, forwarding, and validation.
- EnhancedForwarder enables fan-out to external systems without introducing new infrastructure.
- Timer-driven reconciliation (`webhook-sync-timer`) complements event-driven HTTP triggers.

## 4. Data Architecture
- **Azure Table Storage**
  - `SharePointItemStates`: persistent change-detection baseline.
  - `WebhookMetrics`: operational telemetry for notifications, forwarding, and webhook operations.
  - `WebhookHealth`: rolling health-check snapshots.
- **SharePoint Lists**
  - “Webhook Management” list mirrors Microsoft Graph subscriptions and tracks proxy metadata.
  - Domain-specific lists (e.g., Costco routing) supply payload data that is normalized by `shared/sharepoint-document-handler.js`.
- **UiPath Queues**
  - Queue items are flattened, encoded, and submitted with retries; failures captured in metrics tables.

## 5. API Design
| Function | Route | Method(s) | Purpose |
| --- | --- | --- | --- |
| `webhook-handler` | `/api/webhook-handler` | GET, POST | Validate Graph subscription, process notifications, deduplicate, forward or queue. |
| `uipath-dispatcher` | `/api/uipath-dispatcher` | POST | Transform notifications into UiPath queue submissions. |
| `subscription-manager` | `/api/subscription-manager` | GET, POST, DELETE | CRUD lifecycle for SharePoint webhooks via Graph. |
| `webhook-sync` | `/api/webhook-sync` (HTTP) / timer | POST / schedule | Synchronize Graph subscriptions with SharePoint list. |
| `initialize-item-states` | `/api/initialize-item-states` | POST | Seed change-detection cache. |
| `uipath-test` | `/api/uipath-test` | GET, POST | Run UiPath auth, queue, and dispatcher diagnostics. |
| `test-queue-submission` | `/api/test-queue-submission` | GET, POST | Manually enqueue validation payloads. |
| `health-check` | `/api/health-check` | GET | Consolidated system health and telemetry. |

## 6. Component Overview
- **Entry Points (`src/functions/`)**
  - Webhook lifecycle, UiPath dispatch, health checks, diagnostics.
- **Shared Services (`src/shared/`)**
  - `auth.js`, `config.js`, `constants.js`: runtime configuration, guardrails.
  - `enhanced-forwarder.js`: resilient HTTP forwarding with retries.
  - `graph-api.js`, `sharepoint-document-handler.js`: Graph abstractions and data normalization.
  - `uipath-queue-client.js`, `uipath-auth.js`: UiPath integration toolkit.
  - `logger.js`, `metrics-collector.js`: observability foundation.
- **Templates (`src/templates/`)**
  - Costco routing logic for domain-specific queue shaping.
- **Utilities (`src/utilities/`)**
  - Diagnostics scripts for SharePoint, UiPath, and payload troubleshooting.

## 7. Source Tree Highlights
Refer to `docs/source-tree-analysis.md` for the full annotated tree. Key notes:
- Single repository part (`core`) maintains all runtime code and tooling.
- BMAD workflows (`bmad/`) automate documentation/status tracking.
- Documentation folder structured by topic (API, architecture, guides, troubleshooting, archives).

## 8. Development Workflow
- Local development via Azure Functions Core Tools: `npm run start`.
- Testing with Jest (`npm test`, `npm run test:unit`, `npm run test:integration`).
- Linting/formatting: ESLint and Prettier (`npm run lint`, `npm run format`, `npm run quality`).
- Feature toggles and secrets managed through environment variables loaded in `shared/config.js`.

## 9. Deployment Architecture
- Primary Function App: `webhook-functions-sharepoint-002` (configurable).
- Deployment pipeline currently manual/CLI-based (`npm run deploy`, `scripts/deployment/*`). No CI/CD manifest checked in; documentation guides fill gap.
- Requires Azure resources:
  - Function App with managed identity or stored credentials.
  - Azure Storage account for state/metrics.
  - App Insights (optional, recommended).
  - Access to Microsoft Graph and UiPath APIs via service principals.

## 10. Testing Strategy
- Automated unit tests focus on shared modules (auth, logger, validators, error handling).
- Manual/integration testing supported by utility scripts and diagnostic endpoints (`uipath-test`, `test-queue-submission`, `docs/troubleshooting/COMMON_ERRORS.md`).
- Monitoring via `health-check` endpoint and Azure Table metrics; manual dashboards built from telemetry tables.

## 11. Risks & Recommendations
- **Telemetry Growth:** Table storage entities grow over time; plan retention/archival.
- **Manual Deployment:** Introduce CI/CD automation to enforce lint/tests and reduce drift.
- **Configuration Drift:** Centralized config reduces risk, but secrets management strategy should be formalized (Key Vault or Function App settings).
- **Template Registry Gap:** Architecture template registry absent; consider restoring `registry.csv` to align with BMAD tooling.
