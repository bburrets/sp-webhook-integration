# Accounting Research Webhook - Production Configuration

## ✅ Active Production Webhook

**Created**: December 8, 2025
**Status**: Active and Ready
**Environment**: **PRODUCTION**

---

## Webhook Configuration

| Property | Value |
|----------|-------|
| **Webhook ID** | `a4a238cb-fa08-4957-ac29-51fa945e8ee3` |
| **Site** | Accounting_Research |
| **Site Path** | `/sites/Accounting_Research` |
| **Resource Type** | Document Library |
| **Library Name** | Documents |
| **List ID** | `1073e81c-e8ea-483c-ac8c-680148d9e215` |
| **Notification URL** | `https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler` |
| **Expires** | December 12, 2025 (auto-renews) |

---

## UiPath Configuration

| Property | Value |
|----------|-------|
| **Environment** | **PROD** |
| **Tenant** | `FAMBrands_RPAOPS_PROD` |
| **Folder ID** | `376892` |
| **Queue Name** | `Accounting_Research_Documents` |
| **Orchestrator URL** | `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_` |
| **Processor** | Generic Document Processor |

---

## ClientState

```
processor:uipath;processor:document;uipath:Accounting_Research_Documents;env:PROD;folder:376892;config:AccountingResearch
```

### ClientState Breakdown:
- `processor:uipath` - Routes to UiPath dispatcher
- `processor:document` - Uses generic document processor
- `uipath:Accounting_Research_Documents` - Queue name in UiPath Orchestrator
- `env:PROD` - Production environment
- `folder:376892` - Organization unit ID in PROD
- `config:AccountingResearch` - Configuration identifier

---

## How It Works

1. **User uploads/modifies document** in Accounting_Research Documents library
2. **SharePoint sends notification** to webhook handler
3. **System enriches notification** with stored clientState from tracking list
4. **Environment config is extracted** from clientState (env:PROD, folder:376892)
5. **Document processor analyzes** the document and creates reference
6. **Queue item is created** in PROD UiPath tenant in `Accounting_Research_Documents` queue

---

## Testing the Webhook

### Step 1: Upload or Modify a Document
Upload a new document or modify an existing one in the Documents library in the Accounting_Research site.

### Step 2: Monitor Logs
```bash
# Real-time logs
az webapp log tail --name webhook-functions-sharepoint-002 --resource-group rg-sharepoint-webhooks

# Or Application Insights
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(10m) | order by timestamp desc | limit 50"
```

### Step 3: Verify Queue Item
Check UiPath Orchestrator PROD environment:
- Navigate to `FAMBrands_RPAOPS_PROD` tenant
- Go to folder `376892`
- Check queue `Accounting_Research_Documents`

---

## Expected Queue Item Structure

The queue item will include:

```json
{
  "ProcessType": "GenericDocumentProcessing",
  "QueueName": "Accounting_Research_Documents",
  "TriggerSource": "SharePoint_Webhook",
  "SharePointItemId": "<item-id>",
  "Document": {
    "HasDocument": true,
    "FileName": "<filename>",
    "FileExtension": "<ext>",
    "DocumentUrl": "<url>",
    "DirectDownloadUrl": "<download-url>",
    "Strategy": "<strategy-used>",
    "UiPathCompatible": true
  }
}
```

---

## Comparison with Previous DEV Webhook

| Aspect | OLD (DEV - Deleted) | NEW (PROD - Active) |
|--------|---------------------|---------------------|
| Subscription ID | `d3b8c472-6f5a-4e93-ba30-d1f988205e29` | `a4a238cb-fa08-4957-ac29-51fa945e8ee3` |
| Environment | DEV | **PROD** |
| Tenant | FAMBrands_RPAOPS | **FAMBrands_RPAOPS_PROD** |
| Folder | 277500 | **376892** |
| Queue Name | test_webhook | **Accounting_Research_Documents** |
| Status | Deleted (expired Nov 16) | **Active** |
| Notifications Received | 46 (before expiration) | 0 (just created) |

---

## Management Commands

### List all webhooks
```bash
curl -X GET "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Accept: application/json" | jq '.subscriptions[]'
```

### Delete this webhook
```bash
curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>&subscriptionId=a4a238cb-fa08-4957-ac29-51fa945e8ee3"
```

### Sync webhooks
```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Important Notes

- **Environment**: This webhook routes to **PRODUCTION** UiPath tenant
- **Auto-renewal**: Timer function runs hourly and renews webhooks expiring within 24 hours
- **Document Processing**: Uses the generic document processor which handles various file types
- **Queue Name**: Make sure the queue `Accounting_Research_Documents` exists in folder 376892 in PROD
- **Monitoring**: Watch Application Insights for any processing errors

---

## Next Steps

1. ✅ Webhook created and active
2. ⏳ Test by uploading a document to the library
3. ⏳ Verify queue item appears in UiPath PROD
4. ⏳ Ensure UiPath robot can process the queue items
5. ⏳ Monitor for any errors in Application Insights

---

**Function App**: webhook-functions-sharepoint-002
**Resource Group**: rg-sharepoint-webhooks
**Region**: East US

**Replaced**: Item 106 (old DEV webhook that expired on Nov 16, 2025)
