# 🚀 SharePoint Webhooks & UiPath Integration - Onboarding Guide

## Welcome! Start Here 👋

This guide helps new users quickly understand and use the SharePoint Webhooks solution with UiPath integration.

---

## What Does This Solution Do?

**In Simple Terms:** This system watches SharePoint lists/libraries for changes and automatically routes data to UiPath robots or external webhooks for processing.

### Real-World Examples

**Example 1: Document Processing**
When someone uploads an invoice to the Accounting_Research library:
1. ✅ System detects the new document instantly (< 2 seconds)
2. 📊 Extracts all metadata (37+ fields including file name, size, author, dates)
3. 🎯 Routes to UiPath queue "Invoice_Processing" in PROD environment
4. 🤖 Robot processes the invoice automatically
5. 📝 All activity tracked in Application Insights

**Example 2: Form Routing**
When someone updates a COSTCO routing form to status "Send Generated Form":
1. ✅ System detects the status change
2. ✔️ Validates required fields (Ship_To_Email, Ship_Date, Style, PO_no)
3. 🎯 Routes to UiPath queue in the correct folder
4. 🤖 Robot generates and emails the routing form
5. 📝 Updates tracking dashboard

**Example 3: External Monitoring**
When any item changes in a critical list:
1. ✅ System detects the change
2. 🔍 Compares current state vs. previous state
3. 📤 Forwards detailed change information to Teams/Slack
4. 👥 Team gets instant notification with exactly what changed

---

## Architecture: How It Works

```
┌─────────────────────┐
│  SharePoint List    │
│  or Library         │
└──────────┬──────────┘
           │ (Change occurs)
           ↓
┌─────────────────────┐
│  SharePoint         │
│  Webhook System     │
└──────────┬──────────┘
           │ (Sends notification within 1-2 seconds)
           ↓
┌─────────────────────┐
│  Azure Function:    │
│  webhook-handler    │
│  (Receives & Routes)│
└──────────┬──────────┘
           │
           ├─────────────────────┬──────────────────────┐
           │                     │                      │
           ↓                     ↓                      ↓
  ┌────────────────┐   ┌────────────────┐    ┌──────────────┐
  │ Destination:   │   │ Destination:   │    │ Destination: │
  │ forward        │   │ uipath         │    │ None         │
  │ (External URL) │   │ (UiPath Queue) │    │ (Monitor)    │
  └────────────────┘   └────────┬───────┘    └──────────────┘
                                │
                                ↓
                       ┌────────────────┐
                       │ Handler:       │
                       │ - document     │
                       │ - costco       │
                       │ - custom       │
                       └────────┬───────┘
                                │
                                ↓
                       ┌────────────────┐
                       │ UiPath Queue   │
                       │ in DEV/PROD    │
                       │ environment    │
                       └────────┬───────┘
                                │
                                ↓
                       ┌────────────────┐
                       │ UiPath Robot   │
                       │ Processes Item │
                       └────────────────┘
```

---

## Key Concepts

### Destinations

**Where notifications are routed:**

| Destination | Purpose | Use Case |
|-------------|---------|----------|
| `none` | Just monitor & count | Tracking notification volume |
| `forward` | Send to external URL | Teams, Slack, custom webhooks |
| `uipath` | Send to UiPath Orchestrator | Automated processing with robots |

### Handlers

**Processing templates for UiPath destination:**

| Handler | Purpose | Use Case |
|---------|---------|----------|
| `document` | Generic document processing | Invoice scanning, receipt processing |
| `costco` | COSTCO form routing | Routing form generation & email |
| `custom` | Your custom template | Specialized business logic |

### Environments (UiPath)

**Which UiPath tenant to use:**

| Environment | Tenant | Folder | Use For |
|-------------|--------|--------|---------|
| `DEV` | FAMBrands_RPAOPS | 277500 | Testing, development |
| `PROD` | FAMBrands_RPAOPS_PROD | 376892 | Production workflows |
| Custom | Any tenant | Any folder | Specialized setups |

---

## 5-Minute Quick Start

### Prerequisites Checklist

- [ ] **Azure subscription** with Function App deployed
- [ ] **SharePoint Online** access with appropriate permissions
- [ ] **UiPath Orchestrator** account (for UiPath features)
- [ ] **Azure AD** admin permissions for app registration

### Step 1: Clone and Setup (Local Development)

```bash
# Clone the repository
git clone https://github.com/your-org/sharepoint-webhooks.git
cd sharepoint-webhooks

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Step 2: Configure Azure AD App

**Create the app registration:**

1. Navigate to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Click "New registration"
   - Name: "SharePoint Webhook Integration"
   - Supported account types: "Single tenant"
   - Redirect URI: Leave blank
3. Click "Register"

**Configure API permissions:**

1. Go to "API permissions"
2. Click "Add a permission" → Microsoft Graph → Application permissions
3. Add these permissions:
   - `Sites.Read.All`
   - `Sites.ReadWrite.All`
4. Click "Grant admin consent" (requires Global Admin)

**Generate client secret:**

1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Description: "Webhook Integration"
4. Expires: 24 months (or your org policy)
5. **Copy the secret value immediately** (won't be shown again)

**Update your `.env` file:**

```env
AZURE_CLIENT_ID=<Application (client) ID from Overview>
AZURE_CLIENT_SECRET=<Secret value you just copied>
AZURE_TENANT_ID=<Directory (tenant) ID from Overview>
```

### Step 3: Deploy to Azure

**Using Azure CLI:**

```bash
# Login to Azure
az login

# Deploy the function app
npm run deploy

# Or use force deploy for updates
./scripts/deployment/force-deploy.sh
```

**Verify deployment:**

```bash
# Check function app status
az functionapp show \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --query state
```

---

## Creating Webhooks: Complete Examples

### Example 1: Monitor List Changes (No Processing)

**Use Case:** Track when items change in a critical list

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/HR:/lists/9f8e7d6c-5b4a-3c2d-1e0f-abcd12345678",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler"
  }' | jq '.'
```

**What happens:**
- SharePoint sends notifications to your function
- Function counts notifications and stores in tracking list
- No additional processing occurs
- View counts in SharePoint tracking dashboard

---

### Example 2: Forward to External Service

**Use Case:** Send notifications to Teams, Slack, or monitoring service

**Simple Forwarding:**

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Operations:/lists/a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:forward|url:https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
  }' | jq '.'
```

**Enhanced with Change Detection:**

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Operations:/lists/a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:forward|url:https://webhook.site/abc123|changeDetection:enabled"
  }' | jq '.'
```

**Payload sent to your URL:**

```json
{
  "notification": {
    "subscriptionId": "16fb8419-87f8-4046-af0b-42def1c0ec0c",
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Operations:/lists/a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6",
    "changeType": "updated"
  },
  "currentItem": {
    "ID": "42",
    "Title": "Q4 Budget Review",
    "Status": "Approved",
    "Priority": "High",
    "Modified": "2025-12-10T15:30:00Z"
  },
  "changes": {
    "summary": {
      "modifiedFields": 2,
      "addedFields": 0,
      "removedFields": 0
    },
    "details": {
      "modified": {
        "Status": {
          "old": "Pending",
          "new": "Approved"
        },
        "Priority": {
          "old": "Normal",
          "new": "High"
        }
      }
    }
  },
  "previousItem": {
    "Status": "Pending",
    "Priority": "Normal"
  }
}
```

**With Field Exclusions:**

```bash
# Exclude system fields that change frequently
"clientState": "destination:forward|url:https://your-webhook.com|changeDetection:enabled|excludeFields:_UIVersionString,Modified,Editor"
```

---

### Example 3: UiPath Document Processing

**Use Case:** Automatically process documents uploaded to SharePoint

**Development Environment:**

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Accounting_Research:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing_Test|tenant:DEV|folder:277500|label:AccountingDev"
  }' | jq '.'
```

**Production Environment:**

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Accounting_Research:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:376892|label:AccountingProd"
  }' | jq '.'
```

**What gets sent to UiPath:**

```json
{
  "Name": "Invoice Processing - Invoice_2025.pdf",
  "Priority": "Normal",
  "Reference": "SPDOC_Invoice_2025_pdf_19_1733850123456",
  "SpecificContent": {
    "ItemId": "19",
    "FileName": "Invoice_2025.pdf",
    "FilePath": "/sites/Accounting_Research/Shared Documents/Invoice_2025.pdf",
    "FileSize": "959868",
    "ContentType": "Document",
    "Author": "bburrets@fambrands.com",
    "ModifiedBy": "jdoe@fambrands.com",
    "Created": "2025-07-16T23:00:20Z",
    "LastModified": "2025-11-13T01:34:50Z",
    "WebUrl": "https://fambrandsllc.sharepoint.com/sites/Accounting_Research/Shared%20Documents/Invoice_2025.pdf",
    "UniqueId": "b5e7f3a1-9d2c-4e8f-a1c3-7b9d4e2f6a8c"
    // ... 25+ additional fields
  }
}
```

---

### Example 4: COSTCO Form Routing

**Use Case:** Route COSTCO inline forms when status changes

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:/lists/9e35f709-48be-4995-8b28-79730ad12b89",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:costco|queue:COSTCO_Routing_Queue|tenant:PROD|folder:376892|label:COSTCOInline"
  }' | jq '.'
```

**Handler behavior:**
- Only processes when `Status` = "Send Generated Form"
- Validates required fields: `Ship_To_Email`, `Ship_Date`, `Style`, `PO_no`
- Extracts form data and routes to UiPath
- Robot generates PDF and sends email

---

### Example 5: Hybrid Processing

**Use Case:** Process with UiPath AND forward to monitoring service

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Finance:/lists/abc123...",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Finance_Workflow|tenant:PROD|folder:376892;destination:forward|url:https://monitor.example.com/webhook"
  }' | jq '.'
```

> 💡 **Note:** Both destinations process in parallel - UiPath queue item created and external webhook called simultaneously

---

## ClientState Configuration Reference

### Format

```
destination:{target}|handler:{template}|queue:{name}|tenant:{env}|folder:{id}|label:{identifier}
```

### Parameters Table

| Parameter | Required | Values | Description | Example |
|-----------|----------|--------|-------------|---------|
| `destination` | ✅ Yes | `uipath`, `forward`, `none` | Where to route notifications | `destination:uipath` |
| `handler` | When destination=uipath | `document`, `costco`, `custom` | Processing template | `handler:document` |
| `queue` | When destination=uipath | Any valid queue name | UiPath queue name | `queue:Invoice_Queue` |
| `tenant` | When destination=uipath | `DEV`, `PROD`, custom | UiPath environment | `tenant:PROD` |
| `folder` | When destination=uipath | Numeric folder ID | UiPath org unit | `folder:376892` |
| `label` | ⚪ Optional | Any string | Human-readable identifier | `label:AccountingInvoices` |
| `url` | When destination=forward | Valid HTTPS URL | Forward destination | `url:https://...` |
| `changeDetection` | ⚪ Optional | `enabled` | Include change details | `changeDetection:enabled` |
| `excludeFields` | ⚪ Optional | Comma-separated fields | Fields to exclude from changes | `excludeFields:Modified,Editor` |

### Configuration Examples

**Monitor only:**
```
(omit clientState or use empty string)
```

**Forward simple:**
```
destination:forward|url:https://webhook.site/abc123
```

**Forward with changes:**
```
destination:forward|url:https://webhook.site/abc123|changeDetection:enabled
```

**UiPath document processing (DEV):**
```
destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500|label:DevTesting
```

**UiPath document processing (PROD):**
```
destination:uipath|handler:document|queue:Invoice_Production|tenant:PROD|folder:376892|label:InvoiceProd
```

**UiPath with custom folder:**
```
destination:uipath|handler:document|queue:Legal_Docs|tenant:PROD|folder:606837|label:LegalDepartment
```

**COSTCO routing:**
```
destination:uipath|handler:costco|queue:COSTCO_Routing|tenant:PROD|folder:376892|label:COSTCOForms
```

**Hybrid (UiPath + Forwarding):**
```
destination:uipath|handler:document|queue:MyQueue|tenant:PROD|folder:376892;destination:forward|url:https://monitor.com/webhook
```

---

## Setting Up UiPath Integration

### Step 1: Configure UiPath Credentials in Azure

Add these settings to your Azure Function App:

```bash
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings \
    UIPATH_ORCHESTRATOR_URL="https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_" \
    UIPATH_TENANT_NAME="FAMBrands_RPAOPS_PROD" \
    UIPATH_CLIENT_ID="your-uipath-client-id" \
    UIPATH_CLIENT_SECRET="your-uipath-client-secret" \
    UIPATH_ORGANIZATION_UNIT_ID="376892" \
    UIPATH_DEFAULT_QUEUE="SharePoint_Changes" \
    UIPATH_ENABLED="true"
```

> 🔑 **Note:** These are DEFAULT values. You can override per-webhook using `tenant:` and `folder:` parameters in clientState

### Step 2: Environment Presets

The system has built-in presets for DEV and PROD:

**DEV Preset** (`tenant:DEV`):
```
Tenant: FAMBrands_RPAOPS
Folder: 277500
URL: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_
```

**PROD Preset** (`tenant:PROD`):
```
Tenant: FAMBrands_RPAOPS_PROD
Folder: 376892
URL: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_
```

**Custom Configuration:**

Override with specific folder:
```
tenant:PROD|folder:606837
```

This uses PROD tenant but targets folder 606837 instead of default 376892.

### Step 3: Choose Your Handler

#### Built-in Handlers

**Document Handler** (`handler:document`)
- **Use for:** Document libraries, generic file processing
- **Extracts:** 37+ metadata fields including file info, dates, authors
- **Queue Item:** Full metadata as SpecificContent
- **Customizable:** Filter by file type, size, folder path
- **Location:** `src/templates/generic-document-processor.js`

**COSTCO Handler** (`handler:costco`)
- **Use for:** COSTCO inline routing forms
- **Triggers:** Status = "Send Generated Form"
- **Validates:** Ship_To_Email, Ship_Date, Style, PO_no
- **Queue Item:** Form data formatted for routing
- **Location:** `src/templates/costco-inline-routing.js`

#### Creating Custom Handlers

**1. Create handler file:**

`src/templates/my-custom-handler.js`:

```javascript
const { createLogger } = require('../shared/logger');
const { createDynamicUiPathQueueClient } = require('../shared/uipath-dynamic-queue-client');
const { UIPATH_PRIORITY } = require('../shared/constants');

class MyCustomHandler {
    constructor(context, configOverrides = null) {
        this.logger = createLogger(context);
        this.queueClient = createDynamicUiPathQueueClient(context, configOverrides);
        this.context = context;
    }

    /**
     * Determine if this item should be processed
     */
    shouldProcessItem(item, previousItem = null) {
        // Example: Only process when Status changes to "Ready"
        if (item.Status !== 'Ready') {
            return false;
        }

        // Example: Skip if already processed
        if (previousItem && previousItem.Status === 'Ready') {
            return false; // Status was already Ready, no change
        }

        return true;
    }

    /**
     * Validate required fields
     */
    validateRequiredFields(item) {
        const required = ['Email', 'OrderNumber', 'Priority'];
        const missing = required.filter(field => !item[field]);

        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
    }

    /**
     * Build queue item reference
     */
    buildReference(item) {
        return `Order_${item.OrderNumber}_${item.ID}_${Date.now()}`;
    }

    /**
     * Process the SharePoint item
     */
    async processItem(item, previousItem = null, queueNameOverride = null) {
        if (!this.shouldProcessItem(item, previousItem)) {
            this.logger.debug('Skipping item - does not meet criteria', {
                itemId: item.ID,
                status: item.Status
            });
            return {
                processed: false,
                reason: 'Item does not meet processing criteria'
            };
        }

        // Validate
        this.validateRequiredFields(item);

        // Build queue item
        const queueName = queueNameOverride || 'MyCustomQueue';
        const queueResult = await this.queueClient.enqueue({
            queueName,
            priority: item.Priority === 'Urgent' ? UIPATH_PRIORITY.HIGH : UIPATH_PRIORITY.NORMAL,
            reference: this.buildReference(item),
            specificContent: {
                OrderNumber: item.OrderNumber,
                Email: item.Email,
                Priority: item.Priority,
                OrderDate: item.Created,
                RequestedBy: item.Author?.Email || item.Author,
                ItemUrl: item.WebUrl,
                // Add your custom fields here
                CustomField1: item.CustomField1,
                CustomField2: item.CustomField2
            }
        });

        return {
            processed: queueResult?.success !== false,
            queueSubmission: queueResult,
            itemId: item.ID,
            handler: 'my-custom-handler'
        };
    }
}

function createMyCustomHandler(context, configOverrides) {
    return new MyCustomHandler(context, configOverrides);
}

module.exports = {
    createMyCustomHandler,
    MyCustomHandler
};
```

**2. Register in processor registry:**

`src/shared/uipath-processor-registry.js`:

```javascript
const { createMyCustomHandler } = require('../templates/my-custom-handler');

// Add to the registry
const PROCESSOR_TEMPLATES = {
    document: createGenericDocumentProcessor,
    costco: createCOSTCOInlineProcessor,
    'my-custom': createMyCustomHandler, // Add your handler here
};
```

**3. Use in webhook:**

```json
{
  "clientState": "destination:uipath|handler:my-custom|queue:MyQueue|tenant:PROD|folder:376892"
}
```

---

## Monitoring & Debugging

### View Live Logs

**Stream function app logs:**

```bash
# Using Azure CLI
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --filter "webhook-handler"

# Or use npm script
npm run logs
```

### Check Webhook Status

**List all active webhooks:**

```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" | jq '.'
```

**Check specific webhook:**

```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" | \
  jq '.subscriptions[] | select(.id == "YOUR-WEBHOOK-ID")'
```

### Sync Webhooks

**Refresh webhook tracking list:**

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Query Application Insights

```bash
# Recent UiPath queue submissions
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(1h) | where message contains 'UiPath queue' | project timestamp, message" \
  --output table

# Recent errors
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(1h) | where severityLevel >= 3 | project timestamp, severityLevel, message" \
  --output table
```

---

## Troubleshooting Quick Fixes

### 🔴 "Authentication Failed"

**Symptom:** Errors mentioning authentication or tokens

**Solution:** Verify Azure AD app permissions and credentials

```bash
# Check current settings
az functionapp config appsettings list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks | \
  jq '.[] | select(.name | contains("AZURE"))'

# Verify admin consent granted
# Go to Azure Portal → Azure AD → App registrations → Your app → API permissions
# Ensure "Granted for..." shows green checkmark
```

---

### 🔴 "Webhook Creation Failed"

**Symptom:** Error when creating webhook

**Solution:** Ensure notification URL is accessible

```bash
# Test webhook handler responds to validation
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler?validationToken=test123"
# Should return: test123

# Check function app is running
az functionapp show \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --query state
```

---

### 🔴 "Queue does not exist" (UiPath)

**Symptom:** Log shows "Queue 'QueueName' does not exist" error code 1002

**Solution:** Verify queue exists in correct folder

1. **Check your clientState:**
   ```bash
   curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>" | \
     jq '.subscriptions[] | {id, clientState}'
   ```

2. **Verify tenant and folder:**
   - DEV: Folder 277500 in FAMBrands_RPAOPS
   - PROD: Folder 376892 in FAMBrands_RPAOPS_PROD

3. **Check queue exists in UiPath Orchestrator:**
   - Login to UiPath Cloud
   - Navigate to the correct folder
   - Go to Queues section
   - Verify queue name matches exactly

4. **Fix if needed:**
   ```bash
   # Delete old webhook
   curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>&subscriptionId=<WEBHOOK-ID>"

   # Create new with correct queue
   curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>" \
     -H "Content-Type: application/json" \
     -d '{
       "resource": "...",
       "changeType": "updated",
       "notificationUrl": "...",
       "clientState": "destination:uipath|handler:document|queue:CORRECT_QUEUE_NAME|tenant:PROD|folder:376892"
     }'
   ```

---

### 🔴 "No Notifications Received"

**Symptom:** Webhook created but no notifications arriving

**Possible Causes & Solutions:**

**1. Webhook expired:**
```bash
# Check expiration
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>" | \
  jq '.subscriptions[] | {id, expirationDateTime}'

# Recreate if expired (copy original config)
```

**2. SharePoint permissions:**
- Ensure Azure AD app has `Sites.Read.All` and `Sites.ReadWrite.All`
- Check admin consent granted

**3. Webhook not synced:**
```bash
# Force sync
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### 🔴 "Folder does not exist" (UiPath)

**Symptom:** Log shows folder ID not found

**Solution:** Verify folder ID in UiPath

1. Login to UiPath Orchestrator
2. Navigate to correct tenant
3. Check folder ID in URL or Folders section
4. Update clientState with correct folder ID:
   ```
   destination:uipath|handler:document|queue:Queue|tenant:PROD|folder:CORRECT_FOLDER_ID
   ```

---

## Next Steps

### 1. **Review Architecture**
→ [Current State Architecture](../architecture/CURRENT_STATE.md)

### 2. **Setup Local Development**
→ [Local Development Setup](LOCAL_DEV_SETUP.md)

### 3. **Deploy to Production**
→ [Deployment Guide](DEPLOYMENT_GUIDE.md)

### 4. **Explore Advanced Features**
→ [Enhanced Forwarding](../api/ENHANCED_FORWARDING.md)

### 5. **Create Custom Templates**
→ [Complete Webhook to Queue Guide](WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)

### 6. **Setup Monitoring**
→ [Monitoring Strategy](../architecture/MONITORING_STRATEGY.md)

---

## Quick Reference

### Common Commands

```bash
# List webhooks
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>"

# Create webhook
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>" \
  -H "Content-Type: application/json" \
  -d '{...}'

# Sync webhooks
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Delete webhook
curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>&subscriptionId=<ID>"

# View logs
az webapp log tail --name webhook-functions-sharepoint-002 --resource-group rg-sharepoint-webhooks
```

### Key Files to Explore

| File | Purpose |
|------|---------|
| `src/functions/webhook-handler.js` | Main webhook receiver & router |
| `src/functions/uipath-dispatcher-dynamic.js` | UiPath routing with environment support |
| `src/templates/generic-document-processor.js` | Document handler template |
| `src/templates/costco-inline-routing.js` | COSTCO handler example |
| `src/shared/uipath-dynamic-queue-client.js` | Queue submission logic |
| `src/shared/uipath-environment-config.js` | DEV/PROD environment presets |
| `src/shared/uipath-processor-registry.js` | Handler registration |
| `src/shared/enhanced-forwarder.js` | External forwarding logic |

---

## Getting Help

- **Documentation Hub:** [docs/guides/INDEX.md](INDEX.md)
- **API Reference:** [docs/api/FUNCTION_REFERENCE.md](../api/FUNCTION_REFERENCE.md)
- **Troubleshooting:** [docs/troubleshooting/COMMON_ERRORS.md](../troubleshooting/COMMON_ERRORS.md)
- **Quick Start:** [docs/guides/QUICK_START_DOCUMENT_PROCESSOR.md](QUICK_START_DOCUMENT_PROCESSOR.md)
- **Complete Guide:** [docs/guides/WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md](WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)

---

**Ready to build?** You now have everything needed to create SharePoint webhooks with UiPath integration! 🎉

*Last Updated: December 10, 2025 | Version 3.0*
*Updated for new terminology, multi-environment support, and current capabilities*
