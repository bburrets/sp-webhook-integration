# SharePoint Webhook Documentation Hub

Welcome to the comprehensive documentation for the SharePoint webhook integration system. This hub supports multiple destinations including external forwarding, UiPath queue integration, and change detection.

---

## 🚀 Getting Started

### For New Users

1. **[Visitor Onboarding Guide](./VISITOR_ONBOARDING_GUIDE.md)** 👋
   - **Start here** - 5-minute orientation for new users
   - System architecture overview
   - Key concepts: destinations, handlers, environments
   - Real-world examples with step-by-step setup
   - *Perfect introduction to the system*

2. **[Quick Start: Document Processor](./QUICK_START_DOCUMENT_PROCESSOR.md)** ⚡
   - Fast setup for document processing workflows
   - Working example with invoice processing
   - Both DEV and PROD environment configurations
   - Common customizations and troubleshooting
   - *Get running in 10 minutes*

### For All Users

3. **[Complete Webhook Setup Guide](./WEBHOOK_SETUP_GUIDE.md)** 📘
   - Comprehensive webhook configuration for all destinations
   - External forwarding with change detection
   - UiPath integration setup
   - Webhook management and monitoring
   - Best practices and security considerations
   - *Your complete configuration reference*

### For Developers

4. **[Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)** 🔧
   - Full technical documentation for UiPath integration
   - Architecture deep dive with component details
   - Handler implementation (document, COSTCO, custom)
   - Custom processor development with complete code examples
   - Production scaling strategies
   - *Most comprehensive technical guide*

---

## 🎯 Integration-Specific Guides

### UiPath Integration

5. **[UiPath Main Guide](./uipath/main-guide.md)** 🤖
   - UiPath Orchestrator integration overview
   - Multi-environment support (DEV/PROD)
   - Authentication and queue configuration
   - Handler types and trigger conditions
   - Testing and troubleshooting
   - Migration from legacy format

### Business-Specific Workflows

6. **[COSTCO Webhook Setup](./costco/webhook-setup.md)**
   - COSTCO-specific routing form configuration
   - Business logic and field validations
   - Status trigger conditions
   - Field mappings and payload structure

---

## 🏗️ Architecture & Design

7. **[Current State Architecture](../architecture/CURRENT_STATE.md)**
   - System architecture overview
   - Component relationships and interactions
   - Data flow diagrams
   - Technology stack

8. **[Change Detection Design](../architecture/CHANGE_DETECTION_DESIGN.md)**
   - How change detection works
   - Azure Table Storage state management
   - Before/after comparison algorithms
   - Performance optimizations

9. **[Monitoring Strategy](../architecture/MONITORING_STRATEGY.md)**
   - Key metrics to monitor
   - Application Insights queries
   - Alert configurations
   - Dashboard setup

---

## 🔧 Advanced Features

10. **[Enhanced Features Explained](./ENHANCED_FEATURES_EXPLAINED.md)**
    - Advanced webhook modes and capabilities
    - State management patterns
    - Performance optimizations
    - Feature flags and configuration

11. **[Enhanced Forwarding API](../api/ENHANCED_FORWARDING.md)**
    - Forwarding modes (simple, withData, withChanges)
    - Data enrichment capabilities
    - Change detection details
    - Configuration options

---

## 🚦 Production & Operations

12. **[Production Scaling Guide](./PRODUCTION_SCALING_GUIDE.md)** 🏭
    - Infrastructure scaling strategies
    - Multi-environment architecture
    - Performance optimization techniques
    - High-volume considerations
    - Disaster recovery planning
    - *Essential reading before production deployment*

13. **[Deployment Guide](./DEPLOYMENT_GUIDE.md)**
    - Azure Function App deployment steps
    - Configuration management
    - CI/CD pipeline setup
    - Environment variable configuration

---

## 🔍 Troubleshooting & Reference

14. **[Common Errors](../troubleshooting/COMMON_ERRORS.md)**
    - Error messages and solutions
    - Debug strategies and workflows
    - Support procedures
    - Root cause analysis

15. **[Structured Logging Guide](../troubleshooting/structured-logging-guide.md)**
    - Logging best practices
    - Application Insights query examples
    - Log analysis techniques
    - Correlation and tracing

16. **[Function Reference](../api/FUNCTION_REFERENCE.md)**
    - API endpoint documentation
    - Function signatures
    - Parameter details
    - Response formats

---

## 📚 Documentation by Use Case

### "I want to..."

#### 🎯 Learn the system
→ Start with **[Visitor Onboarding Guide](./VISITOR_ONBOARDING_GUIDE.md)** for 5-minute overview
→ Then read **[Complete Webhook Setup Guide](./WEBHOOK_SETUP_GUIDE.md)** for comprehensive understanding

#### ⚡ Set up a new webhook quickly
→ **[Quick Start: Document Processor](./QUICK_START_DOCUMENT_PROCESSOR.md)** - 10 minutes to working webhook

#### 🔄 Forward notifications to external URL
→ **[Complete Webhook Setup Guide](./WEBHOOK_SETUP_GUIDE.md)** → "Setting Up External Forwarding" section

#### 🤖 Integrate with UiPath queues
→ **[UiPath Main Guide](./uipath/main-guide.md)** for overview
→ **[Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)** for details

#### 🏭 Deploy to production
→ **[Production Scaling Guide](./PRODUCTION_SCALING_GUIDE.md)** for scaling strategies
→ **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** for deployment steps

#### 🔧 Create a custom handler
→ **[Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)** → "Custom Processor Implementation" section

#### 🐛 Debug an issue
→ **[Common Errors](../troubleshooting/COMMON_ERRORS.md)** for known issues
→ **[Structured Logging Guide](../troubleshooting/structured-logging-guide.md)** for log analysis

#### 📊 Monitor the system
→ **[Monitoring Strategy](../architecture/MONITORING_STRATEGY.md)** for what to monitor
→ **[Production Scaling Guide](./PRODUCTION_SCALING_GUIDE.md)** → Monitoring section for implementation

#### 📈 Handle high volume
→ **[Production Scaling Guide](./PRODUCTION_SCALING_GUIDE.md)** for scaling strategies
→ **[Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)** → "High-Volume Considerations" section

#### 🔄 Migrate from old format
→ **[UiPath Main Guide](./uipath/main-guide.md)** → "Migration from Legacy Format" section

---

## 📊 Quick Reference

### Current Production Configuration (December 2025)

| Component | Value |
|-----------|-------|
| **Function App** | webhook-functions-sharepoint-002 |
| **Resource Group** | rg-sharepoint-webhooks |
| **Region** | East US |
| **Runtime** | Node.js 18 |
| **App Insights** | webhook-functions-sharepoint-002 |
| **Storage Account** | webhookstatestorage |

### UiPath Environments

| Environment | Tenant Name | Folder ID | Purpose |
|-------------|-------------|-----------|---------|
| **Development** | FAMBrands_RPAOPS | 277500 | Testing, development, validation |
| **Production** | FAMBrands_RPAOPS_PROD | 376892 | Live business processes |

### Key Function Endpoints

```bash
# Subscription Manager (webhook CRUD operations)
https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>

# Webhook Handler (receives SharePoint notifications)
https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler

# Webhook Sync (manual sync and renewal)
https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<FUNCTION_KEY>

# Initialize Item States (for change detection)
https://webhook-functions-sharepoint-002.azurewebsites.net/api/initialize-item-states?code=<FUNCTION_KEY>

# UiPath Test (integration testing)
https://webhook-functions-sharepoint-002.azurewebsites.net/api/uipath-test?code=<FUNCTION_KEY>
```

---

## 🎨 ClientState Configuration Reference

### New Format (Current - Recommended)

**Syntax**: Components separated by `|` (pipe)

```
destination:{type}|handler:{name}|queue:{queueName}|tenant:{env}|folder:{id}|label:{identifier}
```

**Examples**:

```bash
# External forwarding with change detection
destination:forward|url:https://example.com/webhook|changeDetection:enabled

# UiPath document processing (DEV)
destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500|label:TestDocs

# UiPath document processing (PROD)
destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892|label:Invoices

# UiPath COSTCO routing (PROD)
destination:uipath|handler:costco|queue:COSTCO_Queue|tenant:PROD|folder:376892|label:COSTCO

# Hybrid: UiPath + External monitoring
destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892;destination:forward|url:https://monitor.com/webhook
```

### Legacy Format (Still Supported)

**Syntax**: Components separated by `;` (semicolon)

```
processor:{type};uipath:{queue};env:{environment};folder:{id};config:{name}
```

**Examples**:

```bash
# UiPath processing (legacy)
processor:uipath;processor:document;uipath:test_webhook;env:DEV;folder:277500;config:AccountingResearch

# External forwarding (legacy)
forward:https://example.com/webhook;mode:withChanges
```

> **Note**: The system supports both formats for backward compatibility. New webhooks should use the new format.

---

## 🔑 Configuration Parameters

### Destination Types

| Destination | Purpose | Use Cases |
|-------------|---------|-----------|
| **forward** | Send to external URL | Teams/Slack notifications, monitoring systems, custom webhooks |
| **uipath** | Submit to UiPath queue | Document processing, form routing, business automation |
| **none** | Monitor only | Audit logging, state tracking without external action |

### Handler Types (for UiPath)

| Handler | Purpose | Typical Use |
|---------|---------|-------------|
| **document** | Process documents with metadata | Invoice processing, contract management, document archival |
| **costco** | COSTCO routing forms | Specific COSTCO workflow with status validation |
| **custom** | Custom business logic | Department-specific workflows, custom validations |

### Environment Parameters

| Parameter | Description | Required | Values | Example |
|-----------|-------------|----------|--------|---------|
| `destination` | Where notifications route | ✅ Yes | `forward`, `uipath`, `none` | `destination:uipath` |
| `handler` | Processing template (UiPath) | ⚠️ If destination=uipath | `document`, `costco`, `custom` | `handler:document` |
| `queue` | UiPath queue name | ⚠️ If destination=uipath | Any valid queue name | `queue:Invoice_Queue` |
| `tenant` | UiPath environment | ⚠️ Recommended | `DEV`, `PROD` | `tenant:PROD` |
| `folder` | UiPath organization unit | ⚠️ Recommended | `277500`, `376892` | `folder:376892` |
| `label` | Human-readable identifier | ❌ Optional | Any string | `label:InvoiceProcessing` |
| `url` | Forward destination URL (forward) | ⚠️ If destination=forward | HTTPS URL | `url:https://example.com` |
| `changeDetection` | Enable change detection | ❌ Optional | `enabled` | `changeDetection:enabled` |

---

## 🆘 Need Help?

### Troubleshooting Workflow

1. **Check the documentation**
   - Start with the relevant guide from this index
   - Review troubleshooting sections in each guide
   - Check [Common Errors](../troubleshooting/COMMON_ERRORS.md)

2. **Review the logs**
   - Application Insights has detailed logging
   - Use queries from [Structured Logging Guide](../troubleshooting/structured-logging-guide.md)
   - Check recent traces for errors

3. **Run validation**
   - Use `./run-validation.sh` to check system health
   - Test authentication: `curl .../api/uipath-test?test=auth`
   - Verify webhooks: `curl .../api/subscription-manager`

4. **Check CLAUDE.md**
   - Quick reference for common issues
   - Current working configuration
   - Known issues and solutions

5. **Contact support**
   - Review error with relevant documentation
   - Provide logs and configuration
   - Include steps to reproduce

---

## 📝 Documentation Maintenance

**Last Updated**: December 2025
**Version**: 3.0.0
**Status**: ✅ Active and Updated

### Recent Major Updates (December 2025)

- ✅ **Terminology Standardization**: Updated all documentation to use new format
  - Changed `processor:` → `destination:` and `handler:`
  - Changed `;` separator → `|` separator
  - Changed `env:` → `tenant:`
  - Changed `config:` → `label:`

- ✅ **Multi-Environment Support**: Enhanced documentation for DEV/PROD routing
  - Per-webhook environment configuration
  - Dynamic UiPath client creation
  - Environment-specific examples throughout

- ✅ **Expanded Guides**: Significantly enhanced all core documentation
  - Quick Start: 267 → 658 lines (145% increase)
  - Visitor Onboarding: 395 → 950 lines (140% increase)
  - Webhook Setup: 211 → 755 lines (258% increase)
  - Complete Guide: 580 → 1,220 lines (110% increase)
  - UiPath Guide: 262 → 718 lines (174% increase)

- ✅ **Improved Organization**: Enhanced documentation structure
  - Added use case-based navigation
  - Comprehensive quick reference section
  - Better cross-linking between guides

### Documentation Quality Metrics

| Metric | Status |
|--------|--------|
| Terminology Consistency | ✅ 100% updated to new format |
| Code Examples | ✅ All validated and working |
| Cross-References | ✅ All links verified |
| Troubleshooting Coverage | ✅ 20+ common issues documented |
| API Documentation | ⚠️ Helper APIs pending implementation |

### Upcoming Documentation (Planned)

- [ ] **Helper APIs Documentation** - Config builder, templates catalog, validation endpoints
- [ ] **Video Walkthroughs** - Visual guides for common setup scenarios
- [ ] **Migration Guide** - Dedicated guide for legacy format conversion
- [ ] **Comprehensive User Guide** - Technical user guide (separate from developer docs)
- [ ] **PowerShell Setup Scripts** - Automated webhook creation scripts
- [ ] **Postman Collection** - API testing collection
- [ ] **Performance Benchmarks** - Load testing results and recommendations

---

## 📖 Documentation Versions

### Version 3.0.0 (December 2025) - Current
- New terminology and format standardization
- Multi-environment support documentation
- Expanded guides with comprehensive examples
- Enhanced troubleshooting sections

### Version 2.0.0 (November 2025)
- Added comprehensive webhook-to-queue guide
- Created quick start for document processor
- Added production scaling strategies
- Updated with latest configuration
- Verified working implementation

### Version 1.0.0 (Initial Release)
- Basic webhook setup documentation
- COSTCO integration guide
- Initial architecture documentation

---

## 🎯 Documentation Best Practices

When using this documentation:

1. **Start with the right guide** - Use the "I want to..." section to find your use case
2. **Follow the examples** - All examples use real, working configurations
3. **Check the quick reference** - Fast lookup for common patterns
4. **Update function keys** - Replace `<FUNCTION_KEY>` placeholders with your actual keys
5. **Test in DEV first** - Always validate in development environment before production
6. **Keep documentation handy** - Bookmark relevant guides for quick access

---

*This documentation is actively maintained. Please report any issues or suggestions for improvement.*

**Documentation Repository**: [Update with your repo URL]
**Last Verified**: December 10, 2025
**Next Review**: January 2026
