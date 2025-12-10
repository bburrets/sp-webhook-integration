# Quick Start: Document Processing Webhook

This guide provides step-by-step instructions for setting up a document processing webhook that routes SharePoint document changes to a UiPath queue.

## Real Example: Accounting Research Documents

This example shows the exact configuration used for the Accounting Research document library that processes invoices and financial documents.

---

## Understanding the Configuration

### What You're Creating

A webhook that:
- **Monitors** a SharePoint document library for changes
- **Extracts** document metadata (37+ fields)
- **Routes** to UiPath for automated processing
- **Uses** the generic document handler template

### Configuration Components

| Component | Value | Purpose |
|-----------|-------|---------|
| **Destination** | `uipath` | Route notifications to UiPath Orchestrator |
| **Handler** | `document` | Use generic document processing template |
| **Queue** | `test_webhook` | UiPath queue name (change for production) |
| **Tenant** | `DEV` or `PROD` | Which UiPath environment to use |
| **Folder** | `277500` (DEV) / `376892` (PROD) | UiPath folder/organization unit ID |
| **Label** | `AccountingResearch` | Human-readable identifier for this webhook |

---

## Setup Steps

### 1️⃣ Get Function Keys

```bash
# Get the subscription-manager key
az functionapp function keys list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --function-name subscription-manager \
  --query default -o tsv

# Get the webhook-sync key
az functionapp function keys list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --function-name webhook-sync \
  --query default -o tsv
```

**Function Keys:**
- subscription-manager: `<YOUR_SUBSCRIPTION_MANAGER_KEY>`
- webhook-sync: `<YOUR_WEBHOOK_SYNC_KEY>`

> 💡 **Tip:** Store these keys securely. They provide access to your webhook management functions.

---

### 2️⃣ Create Document Processing Webhook

**Development Environment Example:**

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_SUBSCRIPTION_MANAGER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Accounting_Research:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:test_webhook|tenant:DEV|folder:277500|label:AccountingResearch"
  }' | jq '.'
```

**Production Environment Example:**

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_SUBSCRIPTION_MANAGER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Accounting_Research:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:376892|label:AccountingResearch"
  }' | jq '.'
```

**Expected Response:**

```json
{
  "id": "f6b235ad-b3fd-482c-a678-093cf971144d",
  "resource": "sites/fambrandsllc.sharepoint.com:/sites/Accounting_Research:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215",
  "changeType": "updated",
  "clientState": "destination:uipath|handler:document|queue:test_webhook|tenant:DEV|folder:277500|label:AccountingResearch",
  "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
  "expirationDateTime": "2025-12-13T15:30:00.000Z"
}
```

> ✅ **Success Indicator:** You should receive a JSON response with an `id` field. This is your webhook subscription ID.

---

### 3️⃣ Sync to SharePoint Tracking List

This step creates a tracking record in SharePoint with an auto-generated description:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<YOUR_WEBHOOK_SYNC_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.'
```

**What This Does:**
- Creates/updates entries in SharePoint tracking list
- Generates human-readable descriptions
- Enriches webhook metadata
- Syncs expiration dates

**Expected Output:**

```json
{
  "success": true,
  "synchronized": 1,
  "created": 1,
  "updated": 0,
  "deleted": 0
}
```

---

### 4️⃣ Verify Webhook Is Active

```bash
# List all active webhooks
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_SUBSCRIPTION_MANAGER_KEY>" | jq '.'
```

**Look For:**
- Your webhook ID in the list
- Correct `clientState` configuration
- Future expiration date
- Status showing as active

---

## How It Works: Step-by-Step Flow

### 📄 **Step 1: Document Modified in SharePoint**
Someone uploads, modifies, or deletes a document in the monitored library

### 🔔 **Step 2: SharePoint Sends Notification**
SharePoint webhook fires within 1-2 seconds, sending notification to Azure Function

### 🎯 **Step 3: Destination Router Activates**
The `destination:uipath` configuration routes to UiPath processing pipeline

### 📋 **Step 4: Document Handler Processes**
The `handler:document` template:
- Fetches full item data from SharePoint
- Extracts 37+ metadata fields
- Validates required fields
- Builds queue item payload

### 🌐 **Step 5: Environment Configuration Applied**
System uses `tenant:DEV` and `folder:277500` to:
- Authenticate with correct UiPath tenant
- Target the specified folder/organization unit
- Use proper credentials for environment

### 📊 **Step 6: Metadata Extraction**
System extracts comprehensive document information:

**File Information:**
- FileName, FileSize, FileType
- FilePath, FileDirectory
- UniqueId, Version

**Metadata:**
- Title, ContentType
- Created, LastModified
- Author, ModifiedBy
- WebUrl, ServerUrl

**Custom Fields:**
- Department (if present)
- Category (if present)
- Any custom SharePoint columns

### 📤 **Step 7: Queue Item Created**
Data sent to UiPath Orchestrator:
- **Queue Name:** From `queue:` parameter
- **Reference:** `SPDOC_{filename}_{id}_{timestamp}`
- **Priority:** Normal (configurable via handler)
- **SpecificContent:** All extracted metadata

### ⚙️ **Step 8: UiPath Robot Processes**
Your UiPath robot picks up the queue item and executes your automation

---

## Example Payload Sent to UiPath

```json
{
  "ItemId": "19",
  "Title": "Invoice_2025.pdf",
  "WebUrl": "https://fambrandsllc.sharepoint.com/sites/Accounting_Research/Shared%20Documents/Invoice_2025.pdf",
  "LastModified": "2025-11-13T01:34:50Z",
  "Created": "2025-07-16T23:00:20Z",
  "FileName": "Invoice_2025.pdf",
  "FilePath": "/sites/Accounting_Research/Shared Documents/Invoice_2025.pdf",
  "FileDirectory": "/sites/Accounting_Research/Shared Documents",
  "ContentType": "Document",
  "FileSize": "959868",
  "UniqueId": "b5e7f3a1-9d2c-4e8f-a1c3-7b9d4e2f6a8c",
  "Author": "bburrets@fambrands.com",
  "ModifiedBy": "jdoe@fambrands.com",
  "DocIcon": "pdf",
  "Version": "11.0",
  "Department": "Accounting",
  "ServerUrl": "https://fambrandsllc.sharepoint.com",
  "SiteUrl": "https://fambrandsllc.sharepoint.com/sites/Accounting_Research"
  // ... 20+ additional fields depending on SharePoint configuration
}
```

---

## Configuration Reference

### ClientState Format

```
destination:{target}|handler:{template}|queue:{name}|tenant:{env}|folder:{id}|label:{identifier}
```

**Parameters:**

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| `destination` | ✅ Yes | `uipath` | Routes to UiPath Orchestrator |
| `handler` | ✅ Yes | `document`, `costco`, `custom` | Processing template to use |
| `queue` | ✅ Yes | Any valid queue name | UiPath queue to receive items |
| `tenant` | ✅ Yes | `DEV`, `PROD` | Which UiPath environment |
| `folder` | ✅ Yes | Numeric folder ID | UiPath organization unit |
| `label` | ⚪ Optional | Any string (no spaces) | Human-readable identifier |

### Environment Presets

The system knows these UiPath environments:

**DEV Environment:**
```
Tenant: FAMBrands_RPAOPS
Folder: 277500
URL: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_
```

**PROD Environment:**
```
Tenant: FAMBrands_RPAOPS_PROD
Folder: 376892
URL: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_
```

> 💡 **Custom Folders:** You can override the default folder by specifying `folder:{your-folder-id}`

---

## Customization Options

### Targeting a Different Queue

Change the `queue:` parameter:

```json
"clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892"
```

### Using Custom Folder IDs

Override environment defaults:

```json
"clientState": "destination:uipath|handler:document|queue:MyQueue|tenant:PROD|folder:606837|label:CustomFolder"
```

### Adding Descriptive Labels

Use meaningful labels for tracking:

```json
"clientState": "destination:uipath|handler:document|queue:Contracts|tenant:PROD|folder:376892|label:LegalContracts"
```

---

## Advanced Customization

### File Type Filtering

Modify the document handler to process only specific file types:

**Location:** `src/templates/generic-document-processor.js`

```javascript
shouldProcessItem(item) {
  // Only process PDFs and Word documents
  const allowedTypes = ['.pdf', '.docx', '.doc'];
  const fileExt = item.FileLeafRef?.toLowerCase().match(/\.[^.]+$/)?.[0];

  if (!allowedTypes.includes(fileExt)) {
    this.logger.info('Skipping file - not an allowed type', {
      fileName: item.FileLeafRef,
      extension: fileExt
    });
    return false;
  }

  return true;
}
```

### Priority-Based Routing

Set queue item priority based on document characteristics:

```javascript
buildReference(item) {
  const rawId = item.ID || item.id || 'NOID';
  const fileName = (item.FileLeafRef || item.Title || 'ITEM').replace(/[\s,]+/g, '_');

  // Determine priority
  let priority = 'Normal';
  if (item.Title?.toUpperCase().includes('URGENT')) {
    priority = 'High';
  } else if (parseInt(item.FileSizeDisplay) > 10000000) {
    priority = 'Low'; // Large files processed later
  }

  return {
    reference: `SPDOC_${fileName}_${rawId}_${Date.now()}`,
    priority: priority
  };
}
```

### Department-Based Queue Routing

Route to different queues based on folder structure:

```javascript
async processItem(item, previousItem = null, queueNameOverride = null) {
  // Determine queue based on file path
  let targetQueue = this.options.defaultQueue;

  if (item.FileDirRef?.includes('/Invoices')) {
    targetQueue = 'Invoice_Processing_Queue';
  } else if (item.FileDirRef?.includes('/Contracts')) {
    targetQueue = 'Legal_Review_Queue';
  } else if (item.FileDirRef?.includes('/HR')) {
    targetQueue = 'HR_Documents_Queue';
  }

  // Use override if provided
  const queueName = queueNameOverride || targetQueue;

  // ... rest of processing
}
```

---

## Production Deployment Checklist

### ✅ Pre-Deployment Tasks

- [ ] **Test in DEV first** - Verify complete flow works
- [ ] **Verify queue exists** - Check UiPath Orchestrator PROD folder
- [ ] **Update clientState** - Change `tenant:PROD` and production queue name
- [ ] **Set production folder** - Update `folder:376892` (or your PROD folder)
- [ ] **Test credentials** - Ensure UiPath PROD credentials are valid
- [ ] **Configure alerts** - Set up Application Insights alerts for failures
- [ ] **Document setup** - Record all configuration details
- [ ] **Train team** - Ensure operations team knows the process

### 🔄 Environment Switching Examples

**Development:**
```json
"clientState": "destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500|label:DevTest"
```

**Production:**
```json
"clientState": "destination:uipath|handler:document|queue:Invoice_Production|tenant:PROD|folder:376892|label:InvoiceProcessing"
```

**Production with Custom Folder:**
```json
"clientState": "destination:uipath|handler:document|queue:Contracts|tenant:PROD|folder:606837|label:LegalDepartment"
```

---

## Monitoring & Verification

### Check Webhook Status

```bash
# List all active webhooks
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" | jq '.'

# Check specific webhook by subscription ID
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_KEY>" | \
  jq '.subscriptions[] | select(.id == "f6b235ad-b3fd-482c-a678-093cf971144d")'
```

### View Recent Activity

```bash
# Stream live logs
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --filter "webhook-handler"
```

### Query Application Insights

```bash
# Check UiPath queue submissions in last hour
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(1h) | where message contains 'UiPath queue' | project timestamp, message" \
  --output table
```

### Run System Validation

```bash
# Run comprehensive validation script
./run-validation.sh
```

---

## Troubleshooting

### 🔴 Webhook Expired

**Symptom:** No notifications received, webhook not in active list

**Solution:** Recreate webhook with same configuration:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Accounting_Research:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:test_webhook|tenant:DEV|folder:277500|label:AccountingResearch"
  }'
```

> 💡 **Auto-Renewal:** Webhooks auto-renew when <24 hours remain until expiration

---

### 🔴 Queue Items Not Creating

**Check logs for the actual error:**

```bash
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks | \
  grep -E "(error|Error|ERROR|failed)"
```

**Common Causes:**

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "Queue does not exist" | Wrong queue name or folder | Verify queue exists in UiPath folder |
| "Folder does not exist" | Wrong folder ID | Check folder ID in Orchestrator |
| "Authentication failed" | Expired credentials | Update UIPATH_CLIENT_SECRET |
| "Document processor skipping" | File type filter | Check shouldProcessItem logic |
| "Tenant not found" | Wrong tenant name | Verify tenant:DEV or tenant:PROD |

**Debugging Steps:**

1. **Check clientState is correct:**
   ```bash
   curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<KEY>" | \
     jq '.subscriptions[] | .clientState'
   ```

2. **Verify environment configuration:**
   ```bash
   # Check Application Settings in Azure Portal
   az functionapp config appsettings list \
     --name webhook-functions-sharepoint-002 \
     --resource-group rg-sharepoint-webhooks | \
     jq '.[] | select(.name | contains("UIPATH"))'
   ```

3. **Test UiPath connection manually:**
   ```bash
   # Run local validation
   node src/shared/uipath-auth.js
   ```

---

### 🔴 Wrong Documents Processing

**Add filtering in the handler:**

**Location:** `src/templates/generic-document-processor.js`

```javascript
shouldProcessItem(item) {
  // Only process PDFs
  if (!item.FileLeafRef?.toLowerCase().endsWith('.pdf')) {
    this.logger.info('Skipping non-PDF file', { fileName: item.FileLeafRef });
    return false;
  }

  // Skip files larger than 50MB
  const maxSize = 50 * 1024 * 1024;
  if (parseInt(item.FileSizeDisplay) > maxSize) {
    this.logger.info('Skipping large file', {
      fileName: item.FileLeafRef,
      size: item.FileSizeDisplay
    });
    return false;
  }

  // Skip temp files
  if (item.FileLeafRef?.startsWith('~$')) {
    this.logger.info('Skipping temp file', { fileName: item.FileLeafRef });
    return false;
  }

  return true;
}
```

---

### 🔴 High Volume Issues

**Symptom:** Slow processing, queue items delayed

**Solutions:**

1. **Increase Function App scaling:**
   ```bash
   az functionapp plan update \
     --name your-plan-name \
     --resource-group rg-sharepoint-webhooks \
     --max-burst 20
   ```

2. **Optimize handler for batch processing:**
   - Reduce unnecessary SharePoint API calls
   - Minimize logging in high-volume scenarios
   - Use queue batch operations

3. **Monitor Application Insights:**
   - Check for throttling
   - Review execution times
   - Identify bottlenecks

---

## Support Resources

### Documentation
- **Complete Guide:** `/docs/guides/WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md`
- **API Reference:** `/docs/api/FUNCTION_REFERENCE.md`
- **Troubleshooting:** `/docs/troubleshooting/COMMON_ERRORS.md`
- **Architecture:** `/docs/architecture/CURRENT_STATE.md`

### Code Locations
- **Document Handler:** `/src/templates/generic-document-processor.js`
- **UiPath Queue Client:** `/src/shared/uipath-dynamic-queue-client.js`
- **Environment Config:** `/src/shared/uipath-environment-config.js`
- **Configuration:** `/src/shared/config.js`

### Monitoring
- **Application Insights:** Azure Portal → webhook-functions-sharepoint-002
- **Function App Logs:** Azure Portal → Log Stream
- **UiPath Orchestrator:** Check queue and job status

### Getting Help
- **Check CLAUDE.md:** Quick reference for common issues
- **Review Logs:** Application Insights has detailed traces
- **Run Validation:** `./run-validation.sh` checks system health
- **Team Contact:** [Update with your team's contact information]

---

## Next Steps

### 1. **Test with Sample Document**
Upload a test PDF to your SharePoint library and verify:
- Webhook notification received
- Document metadata extracted
- Queue item created in UiPath
- Robot processes successfully

### 2. **Monitor First Day**
Watch Application Insights for:
- Any errors or warnings
- Processing times
- Queue item creation success rate

### 3. **Optimize Configuration**
Fine-tune based on actual usage:
- Adjust file type filters
- Optimize priority logic
- Configure department routing

### 4. **Scale to Other Libraries**
Apply this pattern to other document libraries:
- Create new webhook with different resource
- Use same handler template
- Route to appropriate queues

### 5. **Build Custom Handlers**
For specialized workflows, create custom handlers:
- Copy `generic-document-processor.js` as template
- Implement custom business logic
- Register in processor registry

---

## Related Guides

- **[Webhook Setup Guide](./WEBHOOK_SETUP_GUIDE.md)** - Forwarding and change detection
- **[Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)** - Full technical reference
- **[Visitor Onboarding Guide](./VISITOR_ONBOARDING_GUIDE.md)** - System overview
- **[Production Scaling Guide](./PRODUCTION_SCALING_GUIDE.md)** - Enterprise deployment

---

*Last Updated: December 10, 2025 | Version 3.0*
*Updated for new terminology and multi-environment support*
