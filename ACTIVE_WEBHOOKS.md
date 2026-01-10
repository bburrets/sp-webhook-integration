# Active Production Webhooks

**Last Updated**: December 9, 2025

---

## 1. Accounting Research - Financial Scans (PROD)

**Status**: ✅ Active
**Created**: December 9, 2025

### Webhook Configuration

| Property | Value |
|----------|-------|
| **Webhook ID** | `f6b235ad-b3fd-482c-a678-093cf971144d` |
| **Site** | Accounting_Research |
| **Site Path** | `sites/fambrandsllc.sharepoint.com:/sites/Accounting_Research:` |
| **List ID** | `1073e81c-e8ea-483c-ac8c-680148d9e215` |
| **Resource Type** | Document Library (Documents) |
| **Notification URL** | `https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler` |
| **Expires** | December 12, 2025 (auto-renews hourly) |

### UiPath Configuration - PRODUCTION

| Property | Value |
|----------|-------|
| **Environment** | **PROD** |
| **Tenant** | `FAMBrands_RPAOPS_PROD` |
| **Folder ID** | `606837` |
| **Queue Name** | `FIN_SCAN_Rename_And_Storage` |
| **Processor** | `document` (Generic Document Processor) |
| **Orchestrator URL** | `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_` |

### ClientState

```
processor:uipath;processor:document;uipath:FIN_SCAN_Rename_And_Storage;env:PROD;folder:606837
```

### How It Works

1. **User uploads/modifies document** in Accounting_Research Documents library
2. **SharePoint sends notification** to webhook handler
3. **Document processor extracts** file information (name, URL, type, size)
4. **Environment config extracted** from clientState (env:PROD, folder:606837)
5. **Queue item created** in PROD UiPath tenant in folder 606837
6. **Queue**: `FIN_SCAN_Rename_And_Storage` receives the item

### Expected Queue Item Structure

```json
{
  "ProcessType": "GenericDocumentProcessing",
  "QueueName": "FIN_SCAN_Rename_And_Storage",
  "TriggerSource": "SharePoint_Webhook",
  "ProcessedAt": "2025-12-09T...",
  "SharePointItemId": "<item-id>",
  "Document": {
    "HasDocument": true,
    "FileName": "<filename>",
    "FileExtension": "<ext>",
    "DocumentUrl": "<sharepoint-url>",
    "DirectDownloadUrl": "<download-url>",
    "Strategy": "direct_download",
    "UiPathCompatible": true,
    "RequiresDownload": true
  }
}
```

### Testing

**To test the webhook:**

1. Upload a document to the Accounting_Research Documents library
2. Check logs:
   ```bash
   az webapp log tail --name webhook-functions-sharepoint-002 --resource-group rg-sharepoint-webhooks
   ```
3. Verify queue item in UiPath Orchestrator PROD:
   - Tenant: `FAMBrands_RPAOPS_PROD`
   - Folder: `606837`
   - Queue: `FIN_SCAN_Rename_And_Storage`

### Management Commands

**List all webhooks:**
```bash
curl -X GET "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" -H "Accept: application/json" | jq '.'
```

**Delete this webhook:**
```bash
curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>&subscriptionId=f6b235ad-b3fd-482c-a678-093cf971144d"
```

**Sync webhooks:**
```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<FUNCTION_KEY>" -H "Content-Type: application/json" -d '{}'
```

---

## Total Active Webhooks: 1

**Function App**: webhook-functions-sharepoint-002
**Resource Group**: rg-sharepoint-webhooks
**Region**: East US
