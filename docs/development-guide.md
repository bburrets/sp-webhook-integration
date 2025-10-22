# Development Guide

## Environment Preparation
1. Install Node.js 18+ and Azure Functions Core Tools v4.
2. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
3. Create `local.settings.json` (copy from `config/test/local.settings.test.json`) and populate:
   - `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
   - `AZURE_STORAGE_CONNECTION_STRING`
   - SharePoint site identifiers (`SHAREPOINT_DOMAIN`, `SHAREPOINT_SITE_NAME`, `SHAREPOINT_SITE_PATH`)
   - UiPath credentials (`UIPATH_ORCHESTRATOR_URL`, `UIPATH_TENANT_NAME`, `UIPATH_CLIENT_ID`, `UIPATH_CLIENT_SECRET`, `UIPATH_DEFAULT_QUEUE`)
   - Feature flags (`UIPATH_ENABLED`, `ENABLE_METRICS`, `ENABLE_TOKEN_CACHE`, `DETAILED_LOGGING`)

## Local Development Workflow
- Start Functions host: `npm run start`
- Run unit/integration tests: `npm test`, `npm run test:unit`, `npm run test:integration`
- Lint & format: `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run quality`
- Execute diagnostics scripts as needed:
  ```bash
  node src/utilities/discover-list.js
  node src/utilities/test-queue-submission.js
  node src/utilities/auth-cache-monitor.js
  ```

## Feature Implementation Checklist
1. Define new Function entry point under `src/functions/` and wrap handler with `shared/error-handler.wrapHandler`.
2. Add configuration keys to `shared/config.js` (with sensible defaults) instead of hardcoding values.
3. Reuse shared utilities (`shared/logger`, `shared/auth`, `shared/validators`) to maintain consistency.
4. Update `docs/api-contracts-core.md` and `docs/component-inventory.md` if new endpoints or components are added.
5. Extend Jest suites in `src/shared/__tests__/` when adding shared logic; consider adding function-level integration tests using mocks.

## Deployment Process
- Primary publish command: `npm run deploy` (publishes to `webhook-functions-sharepoint-002`).
- Use `scripts/deployment/force-deploy.sh` when a clean redeploy is required.
- Post-deploy validation:
  - `GET /api/health-check`
  - `GET /api/uipath-test?test=auth`
  - `POST /api/test-queue-submission` (with safe payload)
- For UiPath configuration updates, run `scripts/deployment/deploy-uipath-config.sh`.

## Operational Considerations
- Monitor Azure Table Storage growth (`WebhookMetrics`, `WebhookHealth`, `SharePointItemStates`).
- Schedule renewals for SharePoint webhooks; `webhook-sync` timer handles reconciliation but requires accurate credentials.
- Enable Application Insights or Log Analytics to capture structured logs emitted by `shared/logger.js`.
- Review `docs/troubleshooting/COMMON_ERRORS.md` for known issues and remediation steps.

## Contribution Guidelines
- Follow ESLint/Prettier rules (`npm run quality` must pass).
- Use descriptive commit messages referencing workstream or feature.
- Update relevant documentation (guides, architecture, API contracts) when behaviour changes.
- Ensure new environment or configuration variables are documented in `docs/development-instructions.md`.
