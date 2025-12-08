# SharePoint Webhook Documentation Hub

Welcome to the comprehensive documentation for the SharePoint to UiPath webhook integration system. This index will help you find the right documentation for your needs.

---

## 🚀 Getting Started

### For New Users
1. **[Quick Start: Document Processor](./QUICK_START_DOCUMENT_PROCESSOR.md)** ⭐
   - Step-by-step setup for document processing
   - Real working example from Accounting Research
   - Common customizations
   - *Start here if you want to get running quickly*

2. **[Complete Webhook Setup Guide](./WEBHOOK_SETUP_GUIDE.md)**
   - Original comprehensive setup guide
   - All webhook modes explained
   - Troubleshooting tips

### For Developers
3. **[Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)** 📖
   - Full technical documentation
   - Architecture deep dive
   - Processor implementation details
   - Custom processor development
   - *Most comprehensive guide - read this for full understanding*

---

## 🏗️ Architecture & Design

4. **[Current State Architecture](../architecture/CURRENT_STATE.md)**
   - System architecture overview
   - Component relationships
   - Data flow diagrams

5. **[Change Detection Design](../architecture/CHANGE_DETECTION_DESIGN.md)**
   - How change detection works
   - State management
   - Comparison algorithms

6. **[Monitoring Strategy](../architecture/MONITORING_STRATEGY.md)**
   - What to monitor
   - Key metrics
   - Alert configurations

---

## 🔧 Implementation Guides

### Core Features
7. **[Enhanced Features Explained](./ENHANCED_FEATURES_EXPLAINED.md)**
   - Advanced webhook modes
   - State management
   - Performance optimizations

8. **[Enhanced Forwarding](../api/ENHANCED_FORWARDING.md)**
   - Forwarding modes
   - Data enrichment
   - Configuration options

### UiPath Integration
9. **[UiPath Main Guide](./uipath/main-guide.md)**
   - UiPath integration overview
   - Authentication setup
   - Queue configuration

### Specific Implementations
10. **[COSTCO Webhook Setup](./costco/webhook-setup.md)**
    - COSTCO-specific configuration
    - Business logic implementation
    - Field mappings

---

## 🚦 Production & Scaling

11. **[Production Scaling Guide](./PRODUCTION_SCALING_GUIDE.md)** 🏭
    - Infrastructure scaling strategies
    - Multi-tenant architecture
    - Performance optimization
    - Disaster recovery
    - *Essential reading before production deployment*

12. **[Deployment Guide](./DEPLOYMENT_GUIDE.md)**
    - Azure deployment steps
    - Configuration management
    - CI/CD setup

---

## 🔍 Troubleshooting & Reference

13. **[Common Errors](../troubleshooting/COMMON_ERRORS.md)**
    - Error messages and solutions
    - Debug strategies
    - Support procedures

14. **[Function Reference](../api/FUNCTION_REFERENCE.md)**
    - API documentation
    - Function signatures
    - Parameter details

15. **[Structured Logging Guide](../troubleshooting/structured-logging-guide.md)**
    - Logging best practices
    - Log analysis
    - Query examples

---

## 📚 Documentation by Use Case

### "I want to..."

#### Set up a new webhook
→ Start with **[Quick Start: Document Processor](./QUICK_START_DOCUMENT_PROCESSOR.md)**

#### Understand how everything works
→ Read **[Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)**

#### Deploy to production
→ Follow **[Production Scaling Guide](./PRODUCTION_SCALING_GUIDE.md)** and **[Deployment Guide](./DEPLOYMENT_GUIDE.md)**

#### Add a custom processor
→ See "Custom Processor Implementation" in **[Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md#custom-processor-implementation)**

#### Debug an issue
→ Check **[Common Errors](../troubleshooting/COMMON_ERRORS.md)** and **[Structured Logging Guide](../troubleshooting/structured-logging-guide.md)**

#### Monitor the system
→ Review **[Monitoring Strategy](../architecture/MONITORING_STRATEGY.md)** and Production Scaling Guide's monitoring section

#### Handle high volume
→ Read **[Production Scaling Guide](./PRODUCTION_SCALING_GUIDE.md)** for scaling strategies

---

## 📊 Quick Reference

### Current Production Configuration (Nov 2025)

| Component | Value |
|-----------|-------|
| Function App | webhook-functions-sharepoint-002 |
| Resource Group | rg-sharepoint-webhooks |
| Primary Site | Accounting_Research |
| Document Library | 1073e81c-e8ea-483c-ac8c-680148d9e215 |
| UiPath Tenant | FAMBrands_RPAOPS |
| UiPath Folder | 277500 (Dev) / 376892 (Prod) |
| Default Queue | test_webhook |

### Key Function URLs

```bash
# Subscription Manager
https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=KEY

# Webhook Handler
https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler

# Webhook Sync
https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=KEY
```

### ClientState Format

```
processor:{type};uipath:{queue};env:{environment};folder:{id};config:{name}
```

Example:
```
processor:uipath;processor:document;uipath:test_webhook;env:DEV;folder:277500;config:AccountingResearch
```

---

## 🆘 Need Help?

1. **Check the documentation** - Most answers are in the guides above
2. **Review the logs** - Application Insights has detailed logging
3. **Run validation** - Use `./run-validation.sh` to check system health
4. **Check CLAUDE.md** - Quick reference for common issues
5. **Contact the team** - [Update with your team contact]

---

## 📝 Documentation Maintenance

**Last Updated**: November 2025
**Version**: 2.0.0
**Status**: ✅ Active and Working

### Recent Updates
- Added comprehensive webhook-to-queue guide
- Created quick start for document processor
- Added production scaling strategies
- Updated with latest configuration
- Verified working implementation

### Upcoming Documentation
- [ ] Video walkthrough
- [ ] PowerShell setup scripts
- [ ] Postman collection
- [ ] Architecture diagrams
- [ ] Performance benchmarks

---

*This documentation is actively maintained. Please report any issues or suggestions for improvement.*