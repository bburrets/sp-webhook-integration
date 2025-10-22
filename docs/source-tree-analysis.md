# Source Tree Analysis

```
sp-webhook-integration/
├── CODEBASE_CLEANUP_PLAN.md        # Refactoring roadmap and backlog tracking
├── DOCUMENTATION_ASSESSMENT.md     # Status of documentation generation efforts
├── README.md                       # High-level overview and onboarding pointers
├── bmad/                           # BMAD workflow engine, agents, and templates
│   └── bmm/                        # Business Method modules (analysis, planning, implementation)
├── config/                         # Environment-specific settings & placeholders
│   ├── README.md                   # Explains configuration structure and deployment expectations
│   ├── local/.gitkeep              # Placeholder for local function settings
│   ├── prod/.gitkeep               # Placeholder for production settings
│   └── test/local.settings.test.json # Sample settings for automated testing
├── docs/                           # Comprehensive documentation hub
│   ├── api/                        # API surface references and integration guides
│   ├── architecture/               # Architecture decisions, current state, monitoring, pipeline
│   ├── archive/                    # Historical summaries and prior integration notes
│   ├── guides/                     # Operational runbooks, deployment steps, onboarding flows
│   ├── troubleshooting/            # Incident response and logging guides
│   └── *.md                        # Generated workflow outputs (status, scan reports, etc.)
├── scripts/                        # Deployment, setup, and maintenance scripts (shell utilities)
├── src/                            # Application source code
│   ├── functions/                  # Azure Functions HTTP/Timer entry points
│   │   ├── webhook-handler.js          # Microsoft Graph webhook ingress (validation, routing)
│   │   ├── uipath-dispatcher.js        # Dispatch SharePoint events to UiPath queues
│   │   ├── subscription-manager.js     # CRUD operations for Graph subscription lifecycle
│   │   ├── webhook-sync.js             # Reconciliation + timer automation for subscriptions
│   │   ├── initialize-item-states.js   # Seed item state cache for change detection
│   │   ├── health-check.js             # Operational health/telemetry endpoint
│   │   ├── uipath-test.js              # Diagnostic suite for UiPath pipeline
│   │   └── test-queue-submission.js    # Manual queue submission utility
│   ├── shared/                     # Cross-cutting modules (auth, logging, constants, adapters)
│   │   ├── auth.js                     # Azure AD token helpers with caching support
│   │   ├── config.js                   # Centralized configuration loader + feature flags
│   │   ├── constants.js                # Canonical enums/messages for HTTP, UiPath, telemetry
│   │   ├── enhanced-forwarder.js       # Reliable forwarding to downstream webhooks
│   │   ├── graph-api.js                # Microsoft Graph REST wrappers
│   │   ├── sharepoint-document-handler.js # Normalize SharePoint payloads for automation
│   │   ├── uipath-queue-client.js      # Queue submission with retry/backoff
│   │   ├── logger.js                   # Structured logging façade
│   │   └── validators.js               # Payload validation utilities
│   ├── templates/                  # Customer-specific routing templates (e.g., Costco)
│   └── utilities/                  # Developer/ops tooling (diagnostics, fixes, discovery)
├── test/                           # Jest test suites for shared modules
└── package.json / package-lock.json # npm metadata with scripts for dev/test/deploy
```

## Critical Folders Summary

- `src/functions/`: Eight Azure Functions entry points plus one timer binding orchestrating webhook intake, UiPath dispatch, and operational utilities.
- `src/shared/`: Reusable service layer (auth, logging, telemetry, Graph, UiPath clients, forwarders) that underpins every function.
- `src/utilities/`: Manual and scripted diagnostics covering SharePoint discovery, payload fixes, and queue monitoring.
- `docs/`: Rich documentation set spanning architecture, operations, troubleshooting, and generated workflow outputs.
- `bmad/`: Workflow automation engine powering `workflow-init`, `workflow-status`, and related BMAD tasks.
