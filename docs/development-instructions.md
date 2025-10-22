# Development Environment Setup

## Prerequisites
- Node.js 18+ (Azure Functions v4 requirement)
- Azure Functions Core Tools (`npm i -g azure-functions-core-tools@4`)
- Azure CLI for deployment scripts
- Access to Microsoft Graph application credentials:
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_TENANT_ID`
- Azure Storage connection string for telemetry tables (`AZURE_STORAGE_CONNECTION_STRING`)
- UiPath Orchestrator credentials (if UiPath integration enabled)

## Install Dependencies
```bash
npm install
```

## Local Settings
- Copy `config/test/local.settings.test.json` (or provide your own) into `local.settings.json` for local Function execution.
- Populate environment variables via `local.settings.json` or shell exports.
- Key settings required for core functionality:
  - SharePoint domain/site (`SHAREPOINT_DOMAIN`, `SHAREPOINT_SITE_NAME`, `SHAREPOINT_SITE_PATH`)
  - UiPath credentials (`UIPATH_ORCHESTRATOR_URL`, `UIPATH_TENANT_NAME`, `UIPATH_CLIENT_ID`, `UIPATH_CLIENT_SECRET`)
  - Feature flags (`ENABLE_METRICS`, `ENABLE_TOKEN_CACHE`, `UIPATH_ENABLED`, etc.)

## Running Locally
```bash
# Start Functions host
npm run start

# Run tests
npm test              # All tests
npm run test:unit     # Unit only
npm run test:integration

# Linting & formatting
npm run lint
npm run lint:fix
npm run format
npm run quality       # lint + format check
```

## Local Tooling
- Utilities under `src/utilities/` provide manual scripts (discover lists, fix payloads, queue diagnostics). Run with `node src/utilities/<script>.js`.
- `auth-cache-monitor.js` inspects UiPath token caching behaviour.
- `monitoring-dashboard.js` surfaces telemetry metrics stored in Azure Tables.

# Deployment

## Azure Function App
- Default target: `webhook-functions-sharepoint-002` (see `package.json` scripts).
- Ensure Azure resources (Function App, Storage, App Insights) exist and Service Principal has rights to Microsoft Graph.

## Deployment Scripts
- `npm run deploy` → `func azure functionapp publish webhook-functions-sharepoint-002`
- Additional scripts in `scripts/deployment/`:
  - `force-deploy.sh` – redeploy without incremental checks.
  - `verify-deployment.sh` – smoke test key endpoints post-deploy.
  - `deploy-uipath-config.sh` – push UiPath-related configuration to production.

## Manual Steps Reference
- `docs/guides/DEPLOYMENT_GUIDE.md` and `docs/guides/WEBHOOK_SETUP_GUIDE.md` detail environment provisioning, webhook registration, and UiPath onboarding.
- `docs/troubleshooting/COMMON_ERRORS.md` and `structured-logging-guide.md` provide post-deployment diagnostics guidance.

# Contribution Guidelines

## Code Style & Standards
- ESLint + Prettier enforce formatting; run `npm run quality`.
- Prefer centralized configuration via `shared/config.js`.
- Leverage `shared/logger.js` for structured logs (include context.service where appropriate).
- Use `shared/error-handler.js` wrappers (`wrapHandler`, `AppError`, `validationError`) for consistent error responses.

## Testing Expectations
- Unit tests for shared modules (`src/shared/__tests__`).
- Consider adding integration tests per function to validate Graph / UiPath interactions (mocked or staging).

## Commit & Review Process
- Follow existing commit conventions (feature prefix, doc updates).
- Document significant changes in appropriate guide or architecture doc.
- Update `docs/bmm-workflow-status.md` via workflows when advancing phases.
