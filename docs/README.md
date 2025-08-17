# SharePoint Webhooks Documentation

This directory contains all documentation for the SharePoint Webhooks project.

## Directory Structure

### 📚 Guides (`guides/`)
Step-by-step instructions and how-to guides:
- `DEPLOYMENT_GUIDE.md` - Production deployment procedures
- `LOCAL_DEV_SETUP.md` - Local development environment setup
- `LOCAL_SHAREPOINT_INTERACTION.md` - SharePoint integration guidance
- `WEBHOOK_PROXY_GUIDE.md` - Webhook proxy configuration

### 🔧 API Documentation (`api/`)
Function and API reference documentation:
- `FUNCTION_REFERENCE.md` - Azure Functions API reference
- `ENHANCED_FORWARDING.md` - Enhanced forwarding capabilities
- `SHAREPOINT_HYPERLINK_SOLUTION.md` - SharePoint hyperlink handling

### 🏗️ Architecture (`architecture/`)
System design and architectural documentation:
- `CHANGE_DETECTION_DESIGN.md` - Change detection system design
- `CURRENT_STATE.md` - Current system state and capabilities
- `DEVELOPMENT_PIPELINE_PLAN.md` - Development pipeline architecture
- `MONITORING_STRATEGY.md` - System monitoring approach

### 🛠️ Troubleshooting (`troubleshooting/`)
Debug guides and common issues:
- `structured-logging-guide.md` - Structured logging implementation

### 📦 UiPath Integration
UiPath-specific documentation:
- `guides/COSTCO_INTEGRATION_GUIDE.md` - Complete COSTCO integration guide (consolidated)
- `uipath-integration.md` - Comprehensive UiPath integration guide

### 📋 General Documentation
- `ENHANCED_FEATURES_EXPLAINED.md` - Enhanced features overview
- `guides/WEBHOOK_SETUP_GUIDE.md` - General webhook setup
- `guides/VISITOR_ONBOARDING_GUIDE.md` - New visitor quick start guide

### 🗄️ Archive (`archive/`)
Historical documentation and summaries:
- `HTML_PAYLOAD_FIX_SUMMARY.md` - HTML payload fix history
- `IMPROVEMENTS_SUMMARY.md` - System improvements summary
- `SOLUTION_SUMMARY.md` - Solution development summary
- `UIPATH_WEBHOOK_INTEGRATION_PLAN.md` - Original integration planning
- `UIPATH_INTEGRATION_SIMPLIFIED.md` - Simplified guide (consolidated into main)
- `COSTCO_INLINE_WEBHOOK_SETUP.md` - Original COSTCO setup (consolidated)
- `COSTCO_WEBHOOK_ACTIVE.md` - Original active config (consolidated)

## Quick Start

1. **New to the project?** Start with `guides/LOCAL_DEV_SETUP.md`
2. **Deploying to production?** See `guides/DEPLOYMENT_GUIDE.md`
3. **Need API reference?** Check `api/FUNCTION_REFERENCE.md`
4. **System issues?** Browse `troubleshooting/` directory

## UiPath Integration

### Architecture Overview
```
SharePoint List Changes
        ↓
   Webhook Handler
        ↓
   UiPath Dispatcher ← Processes notifications with "processor:uipath"
        ↓
   Template Processor (e.g., COSTCO)
        ↓
   UiPath Queue Client
        ↓
   UiPath Orchestrator Queue
```

The integration is designed to be modular, extensible, and production-ready with comprehensive error handling and logging.

## Contributing

When adding new documentation:
1. Place guides in `guides/`
2. Place API docs in `api/`
3. Place architecture docs in `architecture/`
4. Archive old docs in `archive/`
5. Update this README.md with new entries