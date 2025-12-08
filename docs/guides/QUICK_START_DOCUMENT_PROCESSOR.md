# Quick Start: Document Processing Webhook

This guide provides step-by-step instructions for setting up a document processing webhook that sends SharePoint document changes to a UiPath queue.

## Real Example: Accounting Research Documents

This example shows the exact configuration used for the Accounting Research document library that processes invoices and financial documents.

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

Get your function keys from Azure Portal or use:
```bash
az functionapp keys list --name webhook-functions-sharepoint-002 --resource-group rg-sharepoint-webhooks
```

### 2️⃣ Create Document Processing Webhook

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_SUBSCRIPTION_MANAGER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Accounting_Research:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "processor:uipath;processor:document;uipath:test_webhook;env:DEV;folder:277500;config:AccountingResearch"
  }' | jq '.'
```

### 3️⃣ Sync to SharePoint Tracking

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<YOUR_WEBHOOK_SYNC_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.'
```

### 4️⃣ Verify It's Working

```bash
# Check active webhooks
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_SUBSCRIPTION_MANAGER_KEY>" | jq '.'
```

---

## What Happens When a Document Changes

### 📄 Document Modified in SharePoint
When someone uploads or modifies a document in the Accounting_Research/Documents library

### 🔔 Webhook Notification
SharePoint sends notification to Azure Function (~1-2 seconds)

### 🔍 Document Processor Activates
The `processor:document` flag triggers the document processor

### 📊 Metadata Extraction
System extracts 37+ fields including:
- File name, size, type
- Author and modifier details
- Created and modified dates
- Version information
- Full SharePoint URLs

### 📤 Queue Item Created
Data sent to UiPath queue with:
- Queue: `test_webhook` (or your configured queue)
- Reference: `SPDOC_{filename}_{id}_{timestamp}`
- Priority: Normal (configurable)
- All metadata as SpecificContent

### ⚙️ UiPath Processing
Your robot picks up the queue item and processes the document

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
  "ContentType": "Document",
  "FileSize": "959868",
  "Author": "bburrets@fambrands.com",
  "DocIcon": "pdf",
  "Version": "11.0",
  "FilePath": "/sites/Accounting_Research/Shared Documents/Invoice_2025.pdf",
  "Department": "Accounting",
  // ... 25+ additional fields
}
```

---

## Customization Options

### Change Target Queue

Modify the clientState when creating the webhook:
```javascript
"clientState": "processor:uipath;processor:document;uipath:YOUR_QUEUE_NAME;..."
```

### Add Filtering

Only process specific file types:
```javascript
// In generic-document-processor.js
shouldProcessItem(item) {
  const allowedTypes = ['.pdf', '.docx', '.xlsx'];
  const fileExt = item.FileLeafRef?.toLowerCase().match(/\.[^.]+$/)?.[0];
  return allowedTypes.includes(fileExt);
}
```

### Change Priority Logic

Set priority based on file characteristics:
```javascript
// In generic-document-processor.js
getPriority(item) {
  if (item.Title?.includes('URGENT')) return 'High';
  if (item.FileSizeDisplay > 10000000) return 'Low'; // Large files
  return 'Normal';
}
```

### Add Department Routing

Route to different queues by folder:
```javascript
getQueueName(item) {
  if (item.FileDirRef?.includes('/Invoices')) return 'Invoice_Queue';
  if (item.FileDirRef?.includes('/Contracts')) return 'Contract_Queue';
  return 'General_Queue';
}
```

---

## Production Deployment Checklist

### ✅ Before Going Live

- [ ] **Change Environment**: Update `env:PROD` in clientState
- [ ] **Update Queue Name**: Use production queue name
- [ ] **Set Folder ID**: Use production folder ID (e.g., 376892)
- [ ] **Update Tenant**: If using production tenant
- [ ] **Test Thoroughly**: Process test documents first
- [ ] **Monitor Initially**: Watch Application Insights closely
- [ ] **Document Changes**: Update team documentation
- [ ] **Set Up Alerts**: Configure failure alerts
- [ ] **Backup Config**: Save all configuration values
- [ ] **Train Team**: Ensure team knows the process

### 🔄 Switching Environments

```bash
# Development
"clientState": "processor:uipath;processor:document;uipath:test_webhook;env:DEV;folder:277500"

# Production
"clientState": "processor:uipath;processor:document;uipath:Production_Queue;env:PROD;folder:376892"
```

---

## Monitoring Commands

### Check Recent Activity
```bash
# View recent logs
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --filter "webhook-handler"
```

### Query Application Insights
```bash
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(1h) | where message contains 'UiPath queue' | project timestamp, message" \
  --output table
```

### Run Validation Script
```bash
./run-validation.sh
```

---

## Troubleshooting Quick Fixes

### 🔴 Webhook Expired
```bash
# Just recreate it with the same command from step 2
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=KEY" ...
```

### 🔴 Queue Items Not Creating
Check the logs for the actual error:
```bash
az webapp log tail --name webhook-functions-sharepoint-002 --resource-group rg-sharepoint-webhooks
```

Common causes:
- Wrong queue name
- Wrong folder ID
- UiPath credentials expired
- Document doesn't meet filter criteria

### 🔴 Wrong Documents Processing
Add filtering in the processor:
```javascript
// Only process PDFs
if (!item.FileLeafRef?.toLowerCase().endsWith('.pdf')) {
  return { processed: false, reason: 'Not a PDF' };
}
```

---

## Support Resources

- **Project Documentation**: `/docs/guides/`
- **Processor Code**: `/src/templates/generic-document-processor.js`
- **Configuration**: `/src/shared/config.js`
- **Logs**: Application Insights in Azure Portal
- **Team Contact**: Update with your team's contact info

---

## Next Steps

1. **Test with a sample document** - Upload a test PDF to verify flow
2. **Monitor the first day** - Watch for any errors or issues
3. **Optimize as needed** - Adjust filtering and priority rules
4. **Scale to other libraries** - Reuse this pattern for other document types
5. **Create custom processors** - Build specific processors for unique workflows