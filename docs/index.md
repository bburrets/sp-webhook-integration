# Project Documentation Index

## Project Overview

- **Project Name:** sp-webhook-integration
- **Type:** Monolith serverless backend (Level 3 brownfield)
- **Primary Language:** JavaScript (Node.js 18+)
- **Architecture Pattern:** Azure Functions integration hub bridging SharePoint, UiPath, and downstream webhooks

## Quick Reference

- **Tech Stack:** Azure Functions v4 · Microsoft Graph · UiPath Orchestrator · Azure Table Storage
- **Primary Entry Point:** `src/functions/webhook-handler.js`
- **Operational Focus:** Webhook lifecycle management, payload enrichment, UiPath dispatch, health & telemetry

## Generated Documentation

- [Project Overview](./project-overview.md)
- [Architecture](./architecture.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Component Inventory](./component-inventory.md)
- [Comprehensive Analysis](./comprehensive-analysis-core.md)
- [API Contracts](./api-contracts-core.md)
- [Data Models](./data-models-core.md)
- [Development Guide](./development-guide.md)
- [Development Instructions](./development-instructions.md)

## Existing Documentation Highlights

- [docs/README.md](./README.md) – Landing page for the documentation workspace.
- [docs/api/FUNCTION_REFERENCE.md](./api/FUNCTION_REFERENCE.md) – Detailed Azure Functions reference.
- [docs/api/ENHANCED_FORWARDING.md](./api/ENHANCED_FORWARDING.md) – Forwarding architecture and configuration.
- [docs/api/SHAREPOINT_HYPERLINK_SOLUTION.md](./api/SHAREPOINT_HYPERLINK_SOLUTION.md) – Hyperlink handling strategies.
- [docs/architecture/CURRENT_STATE.md](./architecture/CURRENT_STATE.md) – Snapshot of implemented features and known issues.
- [docs/architecture/CHANGE_DETECTION_DESIGN.md](./architecture/CHANGE_DETECTION_DESIGN.md) – Change-tracking approach.
- [docs/architecture/MONITORING_STRATEGY.md](./architecture/MONITORING_STRATEGY.md) – Monitoring blueprint.
- [docs/architecture/DEVELOPMENT_PIPELINE_PLAN.md](./architecture/DEVELOPMENT_PIPELINE_PLAN.md) – CI/CD aspirations and backlog.
- [docs/guides/VISITOR_ONBOARDING_GUIDE.md](./guides/VISITOR_ONBOARDING_GUIDE.md) – 5-minute orientation for new readers.
- [docs/guides/DEPLOYMENT_GUIDE.md](./guides/DEPLOYMENT_GUIDE.md) – Environment provisioning and deployment steps.
- [docs/guides/WEBHOOK_SETUP_GUIDE.md](./guides/WEBHOOK_SETUP_GUIDE.md) – SharePoint webhook registration workflow.
- [docs/guides/uipath/main-guide.md](./guides/uipath/main-guide.md) – UiPath integration operations.
- [docs/troubleshooting/COMMON_ERRORS.md](./troubleshooting/COMMON_ERRORS.md) – Runbook for frequent issues.
- [docs/troubleshooting/structured-logging-guide.md](./troubleshooting/structured-logging-guide.md) – How to leverage structured logs.
- [CODEBASE_CLEANUP_PLAN.md](../CODEBASE_CLEANUP_PLAN.md) – Repository cleanup backlog.
- [DOCUMENTATION_ASSESSMENT.md](../DOCUMENTATION_ASSESSMENT.md) – Documentation status tracker.

## Getting Started

1. **Set Up Credentials**
   - Configure Azure AD app credentials (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`).
   - Provision Azure Storage and capture the connection string.
   - Gather UiPath tenant credentials if automation flows are required.

2. **Prepare Local Environment**
   - Install Node.js 18, Azure Functions Core Tools, and run `npm install`.
   - Copy `config/test/local.settings.test.json` to `local.settings.json` and populate environment variables.
   - Start the Functions host with `npm run start`.

3. **Validate Integrations**
   - `GET /api/health-check` to confirm Graph and storage reachability.
   - `GET /api/uipath-test?test=auth` to verify UiPath authentication.
   - `POST /api/test-queue-submission` for queue connectivity.

4. **Deploy**
   - Follow [`docs/development-instructions.md`](./development-instructions.md) and [`docs/guides/DEPLOYMENT_GUIDE.md`](./guides/DEPLOYMENT_GUIDE.md) for deployment flows.
   - Use `npm run deploy` when ready; confirm success via health checks.

5. **Operate & Monitor**
   - Review metrics in Azure Table Storage (`WebhookMetrics`, `WebhookHealth`).
   - Monitor webhook renewals via `webhook-sync` and SharePoint management list.
   - Reference troubleshooting guides for remediation and logging patterns.

## Next Steps

- Consider automating deployment (GitHub Actions / Azure Pipelines) aligned with `docs/architecture/DEVELOPMENT_PIPELINE_PLAN.md`.
- Establish retention/cleanup for telemetry tables to control storage growth.
- Restore BMAD architecture template registry for richer automation support.
