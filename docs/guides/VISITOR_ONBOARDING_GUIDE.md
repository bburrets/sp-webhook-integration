# 🚀 SharePoint Webhooks & UiPath Integration - Visitor Onboarding Guide

## Welcome! Start Here 👋

This guide helps new visitors quickly understand and use the SharePoint Webhooks solution with UiPath integration.

## What Does This Project Do?

**In Simple Terms:** This system watches SharePoint lists for changes and automatically sends data to UiPath robots for processing.

### Real-World Example
When someone updates a COSTCO routing form in SharePoint to status "Send Generated Form", this system:
1. Detects the change instantly
2. Grabs all the form data
3. Sends it to UiPath robots for automatic processing
4. Tracks everything in a management dashboard

## 5-Minute Quick Start

### Prerequisites Checklist
- [ ] Azure subscription with Function App
- [ ] SharePoint Online access
- [ ] UiPath Orchestrator account (optional, for UiPath features)
- [ ] Admin permissions for Azure AD app registration

### Step 1: Clone and Setup
```bash
# Clone the repository
git clone [your-repo-url]
cd sharepoint-webhooks

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Step 2: Configure Azure AD App
1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Create new registration with these permissions:
   - `Sites.Read.All` (Application)
   - `Sites.ReadWrite.All` (Application)
3. Copy credentials to `.env`:
```env
AZURE_CLIENT_ID=your-app-id
AZURE_CLIENT_SECRET=your-secret
AZURE_TENANT_ID=your-tenant
```

### Step 3: Deploy to Azure
```bash
# Deploy using Azure CLI
npm run deploy

# Or use the force deploy script for updates
./scripts/deployment/force-deploy.sh
```

## Creating Your First Webhook

### Basic SharePoint Monitoring
Monitor a SharePoint list for changes:

```bash
# Replace with your values
curl -X POST "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/yoursite.sharepoint.com:/sites/yoursite:/lists/YOUR_LIST_ID",
    "changeType": "updated",
    "notificationUrl": "https://your-app.azurewebsites.net/api/webhook-handler"
  }'
```

### With External Forwarding
Forward notifications to another service:

```bash
curl -X POST "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/yoursite.sharepoint.com:/sites/yoursite:/lists/YOUR_LIST_ID",
    "changeType": "updated",
    "notificationUrl": "https://your-app.azurewebsites.net/api/webhook-handler",
    "clientState": "forward:https://your-external-service.com/webhook"
  }'
```

### With UiPath Integration
Send list changes to UiPath queue:

```bash
curl -X POST "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/yoursite.sharepoint.com:/sites/yoursite:/lists/YOUR_LIST_ID",
    "changeType": "updated",
    "notificationUrl": "https://your-app.azurewebsites.net/api/webhook-handler",
    "clientState": "processor:uipath"
  }'
```

## Setting Up UiPath Integration

### Step 1: Configure UiPath Credentials
Add to your Azure Function App settings:

```bash
az functionapp config appsettings set \
  --name your-function-app \
  --resource-group your-rg \
  --settings \
    UIPATH_ORCHESTRATOR_URL="https://cloud.uipath.com/your-account/your-tenant/orchestrator_" \
    UIPATH_TENANT_NAME="your-tenant" \
    UIPATH_CLIENT_ID="your-client-id" \
    UIPATH_CLIENT_SECRET="your-secret" \
    UIPATH_ORGANIZATION_UNIT_ID="your-folder-id" \
    UIPATH_DEFAULT_QUEUE="SharePointChanges" \
    UIPATH_ENABLED="true"
```

### Step 2: Choose a Processing Template

#### Option A: Use COSTCO Template (Built-in)
The COSTCO template is ready to use for routing forms:
- Triggers on: Status = "Send Generated Form"
- Required fields: ShipToEmail, ShipDate, Style, PO_No
- Queue: COSTCO-INLINE-Routing

#### Option B: Create Custom Template
Create `src/templates/your-template.js`:

```javascript
const { createLogger } = require('../shared/logger');
const { createUiPathQueueClient } = require('../shared/uipath-queue-client');

class YourTemplateProcessor {
    constructor(context) {
        this.logger = createLogger(context);
        this.queueClient = createUiPathQueueClient(context);
    }

    // Define when to process
    shouldProcessItem(item, previousItem) {
        return item.Status === 'Ready for Processing';
    }

    // Validate required data
    validateRequiredFields(item) {
        const required = ['Email', 'OrderNumber', 'Priority'];
        const missing = required.filter(field => !item[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
    }

    // Transform for UiPath
    transformItemData(item) {
        return {
            Name: `Order-${item.OrderNumber}`,
            Priority: item.Priority || 'Normal',
            SpecificContent: {
                Email: item.Email,
                OrderNumber: item.OrderNumber,
                OrderDate: item.Created,
                // Add your fields here
            },
            Reference: `SharePoint Item ${item.ID}`
        };
    }

    // Main processing
    async processItem(item, notification) {
        if (!this.shouldProcessItem(item)) {
            return { processed: false, reason: 'Conditions not met' };
        }

        this.validateRequiredFields(item);
        const queueItem = this.transformItemData(item);
        
        const result = await this.queueClient.addQueueItem(
            'YourQueueName',
            queueItem
        );
        
        return {
            processed: true,
            queueItemId: result.Id,
            reference: queueItem.Reference
        };
    }
}

module.exports = { createYourProcessor: (context) => new YourTemplateProcessor(context) };
```

### Step 3: Register Your Template
Update `src/functions/uipath-dispatcher.js`:

```javascript
// Add import
const { createYourProcessor } = require('../templates/your-template');

// In processUiPathNotification function, add:
if (resource.includes('your-list-identifier')) {
    const processor = createYourProcessor(context);
    return await processor.processItem(item, notification);
}
```

## Common Webhook Types

### 1. Simple Monitoring
Just track changes:
```json
{
  "clientState": null
}
```

### 2. External Forwarding
Forward to another service:
```json
{
  "clientState": "forward:https://your-service.com/webhook"
}
```

### 3. UiPath Processing
Send to UiPath queue:
```json
{
  "clientState": "processor:uipath"
}
```

### 4. Combined Mode
Forward AND process with UiPath:
```json
{
  "clientState": "forward:https://your-service.com;processor:uipath"
}
```

### 5. Enhanced Change Detection
Include what actually changed:
```json
{
  "clientState": "forward:https://your-service.com;mode:withChanges"
}
```

## Monitoring & Debugging

### View Live Logs
```bash
# Stream function logs
az webapp log tail --name your-function-app --resource-group your-rg

# Or use npm script
npm run logs
```

### Check Webhook Status
```bash
# List all active webhooks
curl "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY"
```

### Test UiPath Connection
```bash
# Run test function
curl -X POST "https://your-app.azurewebsites.net/api/uipath-test?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Troubleshooting Quick Fixes

### Issue: "Authentication Failed"
**Solution:** Check Azure AD app permissions and admin consent:
```bash
# Verify settings
az functionapp config appsettings list --name your-app --resource-group your-rg
```

### Issue: "Webhook Creation Failed"
**Solution:** Ensure notification URL is accessible:
```bash
# Test webhook handler
curl "https://your-app.azurewebsites.net/api/webhook-handler?validationToken=test"
# Should return: test
```

### Issue: "UiPath Queue Submission Failed"
**Solution:** Verify UiPath credentials and queue exists:
```bash
# Check UiPath settings
echo $UIPATH_ORCHESTRATOR_URL
echo $UIPATH_DEFAULT_QUEUE
```

### Issue: "No Notifications Received"
**Solution:** Check SharePoint list permissions and webhook expiration:
```bash
# Sync webhooks to refresh
curl -X POST "https://your-app.azurewebsites.net/api/webhook-sync?code=YOUR_KEY"
```

## Architecture Overview

```
SharePoint List
    ↓ (Change occurs)
Webhook Notification
    ↓
webhook-handler (Validates & Routes)
    ├→ Enhanced Forwarder (External services)
    └→ UiPath Dispatcher
         ↓
    Template Processor (Business logic)
         ↓
    UiPath Queue Client
         ↓
    UiPath Orchestrator Queue
         ↓
    UiPath Robot (Processes item)
```

## Next Steps

1. **Basic Setup** → [Local Development Setup](LOCAL_DEV_SETUP.md)
2. **Production Deploy** → [Deployment Guide](DEPLOYMENT_GUIDE.md)
3. **Advanced Features** → [Enhanced Forwarding](../api/ENHANCED_FORWARDING.md)
4. **Custom Templates** → [Template Development](../architecture/CHANGE_DETECTION_DESIGN.md)
5. **Monitoring** → [Monitoring Strategy](../architecture/MONITORING_STRATEGY.md)

## Getting Help

- **Documentation Index:** [docs/README.md](../README.md)
- **API Reference:** [Function Reference](../api/FUNCTION_REFERENCE.md)
- **UiPath Details:** [UiPath Integration](../uipath-integration.md)
- **Troubleshooting:** [Common Issues](../troubleshooting/)

## Key Files to Explore

- `src/functions/webhook-handler.js` - Main webhook processor
- `src/functions/uipath-dispatcher.js` - UiPath routing logic
- `src/templates/costco-inline-routing.js` - Example template
- `src/shared/uipath-queue-client.js` - Queue submission
- `.env.example` - All configuration options

---

**Ready to build?** You now have everything needed to create SharePoint webhooks with UiPath integration! 🎉