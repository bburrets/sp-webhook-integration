# Project Overview – SharePoint Webhook Integration with UiPath

## Project Snapshot
- **Name:** sp-webhook-integration
- **Type:** Level 3 brownfield software project (serverless backend)
- **Purpose:** Provide a production-grade bridge between SharePoint Online webhooks, UiPath Orchestrator queues, and optional downstream services.
- **Primary Users:** Automation engineers, SharePoint administrators, RPA developers.

## Executive Summary
SharePoint webhooks only signal that something changed. This solution receives those notifications, enriches them through Microsoft Graph, records activity for operational visibility, and dispatches actionable payloads to UiPath and proxy targets. It manages the entire webhook lifecycle (create, renew, delete), tracks state in Azure Table Storage, and exposes diagnostics to keep enterprise automation pipelines healthy.

## Technology Snapshot
| Category | Details |
| --- | --- |
| Runtime | Azure Functions v4 (Node.js 18+) |
| Language | JavaScript (CommonJS) |
| External Services | Microsoft Graph, SharePoint Online, UiPath Orchestrator, Azure Storage Tables |
| Key Libraries | `@azure/functions`, `axios` + `axios-retry`, `@azure/data-tables` |
| Observability | Structured logging (`shared/logger`), metrics collector (`shared/metrics-collector`) |

## Architecture Classification
- **Repository Type:** Monolith (single part) with shared service layer.
- **Pattern:** Serverless integration hub for webhook ingestion, transformation, and dispatch.
- **Data Stores:** Azure Table Storage (state, metrics, health snapshots); SharePoint lists for operational dashboards; UiPath queues for downstream automation.

## Key Capabilities
- **Webhook Handler:** Validates Microsoft Graph callbacks, deduplicates events, enriches data, and routes to UiPath or EnhancedForwarder.
- **Subscription Manager:** Creates, lists, and deletes SharePoint webhooks, synchronizing state back into SharePoint.
- **UiPath Dispatch:** Converts SharePoint item data into queue messages with retry logic and field normalization.
- **Health & Diagnostics:** `health-check`, `uipath-test`, and utility scripts cover operational debugging.
- **Telemetry:** Metrics tables capture notification throughput, forwarding latency, and webhook operations; health snapshots track availability.

## Repository Structure
- `src/functions/` – Azure Function entry points (webhook handling, UiPath dispatch, lifecycle management, diagnostics).
- `src/shared/` – Authentication, configuration, logging, metrics, Graph/SharePoint adapters, UiPath client, forwarding logic.
- `src/templates/` – Domain-specific routing templates (Costco).
- `src/utilities/` – Manual scripts for configuration validation, payload fixes, queue inspection.
- `docs/` – Extensive guides covering deployment, onboarding, troubleshooting, architecture, and generated workflow outputs.
- `bmad/` – BMAD workflow engine managing documentation and status automation.

## Primary Documentation
- **Architecture:** `docs/architecture.md`
- **API Contracts:** `docs/api-contracts-core.md`
- **Data Models:** `docs/data-models-core.md`
- **Comprehensive Analysis:** `docs/comprehensive-analysis-core.md`
- **Development Instructions:** `docs/development-instructions.md`
- **Source Tree:** `docs/source-tree-analysis.md`
- **Troubleshooting:** `docs/troubleshooting/COMMON_ERRORS.md`, `docs/troubleshooting/structured-logging-guide.md`
- **Deployment Guides:** `docs/guides/DEPLOYMENT_GUIDE.md`, `docs/guides/WEBHOOK_SETUP_GUIDE.md`

## Recommended Next Steps
1. Review `docs/development-instructions.md` to configure local or staging environments.
2. Use `health-check` and `uipath-test` endpoints to validate credentials and integrations.
3. Implement CI/CD automation to formalize lint/test/deploy workflows.
4. Consider storage retention policies for metrics tables and queue telemetry.
