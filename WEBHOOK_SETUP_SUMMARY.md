# Webhook Setup Summary

## ✅ Active Production Webhook

**Created**: December 9, 2025 (Updated with explicit processor)
**Status**: Active and Ready

### Webhook Configuration

| Property | Value |
|----------|-------|
| **Webhook ID** | `1c09140c-3dcb-45ae-9dbf-caa440dc0e43` |
| **SharePoint List** | COSTCO-INLINE-Trafficking-Routing |
| **List ID** | `8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3` |
| **Site Path** | `/sites/COSTCO-INLINE-Trafficking-Routing` |
| **Notification URL** | `https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler` |
| **Expires** | December 12, 2025 (auto-renews) |

### UiPath Configuration

| Property | Value |
|----------|-------|
| **Environment** | **PROD** |
| **Tenant** | `FAMBrands_RPAOPS_PROD` |
| **Folder ID** | `376892` |
| **Queue Name** | `Trafficking_Request_Email_Trigger_Queue` |
| **Orchestrator URL** | `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_` |

### ClientState

```
processor:uipath;processor:costco_inline;uipath:Trafficking_Request_Email_Trigger_Queue;env:PROD;folder:376892
```

**Note**: Processor explicitly specified as `costco_inline` for clarity and proper routing.

---

## How It Works

1. **User updates item** in COSTCO-INLINE-Trafficking-Routing list
2. **SharePoint sends notification** to webhook handler
3. **System enriches notification** with stored clientState from tracking list
4. **Environment config is extracted** from clientState (env:PROD, folder:376892)
5. **Processor routes to PROD** UiPath tenant with correct queue name
6. **Queue item is created** in `Trafficking_Request_Email_Trigger_Queue`

---

## Testing the Webhook

### Step 1: Update a List Item
Update any item in the COSTCO-INLINE-Trafficking-Routing list in SharePoint.

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
- Check queue `Trafficking_Request_Email_Trigger_Queue`

---

## Expected Log Output

When working correctly, you should see:

```
✅ "Using UiPath environment configuration"
   - tenantName: "FAMBrands_RPAOPS_PROD"
   - folder: "376892"
   - environment: "PROD"

✅ "Successfully submitted item to UiPath queue"
   - queueName: "Trafficking_Request_Email_Trigger_Queue"
   - queueItemId: "<generated-id>"
```

---

## Troubleshooting

### Issue: Queue not found
**Error**: `COSTCO-INLINE-Routing does not exist`

**Cause**: Webhook is using old clientState without env parameter

**Solution**:
1. Delete old webhooks: Check all webhooks for same list
2. Verify correct webhook ID is being used
3. Run webhook sync to update SharePoint tracking list

### Issue: Wrong environment
**Check logs for**:
- `tenantName` should be `FAMBrands_RPAOPS_PROD` (not `FAMBrands_RPAOPS`)
- `folder` should be `376892` (not `277500`)

### Issue: ClientState not preserved
**Symptom**: Logs show `clientState: "processor:uipath"` instead of full string

**Solution**: Run webhook sync to update SharePoint tracking list:
```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Management Commands

### List all webhooks
```bash
curl -X GET "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Accept: application/json" | jq '.subscriptions[]'
```

### Delete a webhook
```bash
curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>&subscriptionId=<WEBHOOK_ID>"
```

### Sync webhooks
```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Recent Updates

### December 8, 2025 - Critical Fixes

#### 1. Orchestrator URL Bug Fix
**Issue**: Multi-environment support was not working - all requests were going to DEV orchestrator URL regardless of clientState configuration.

**Root Cause**: Queue client was using `config.uipath.orchestratorUrl` (global default) instead of `this.auth.orchestratorUrl` (instance-specific) when building API URLs.

**Fix**: Updated three locations in `uipath-queue-client.js`:
- Line 363: `submitQueueItem()` - Changed to use `this.auth.orchestratorUrl`
- Line 623: `getQueueItems()` - Changed to use `this.auth.orchestratorUrl`
- Line 676: `getQueueItem()` - Changed to use `this.auth.orchestratorUrl`

**Verification**: Log now correctly shows:
```json
"orchestratorUrl":"https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_"
```

#### 2. ShipToEmail Field Added to Queue Payload
**Issue**: `ShipToEmail` was validated as required but not included in the UiPath queue item payload.

**Fix**: Added `ShipToEmail` field to queue item transformation in `costco-inline-routing.js` line 418:
```javascript
ShipToEmail: item.fields?.Ship_x002d_toEmail || item.fields?.ShiptoEmail || item['Ship_x002d_toEmail'] || item['ShiptoEmail'] || item['Ship_x0020_To_x0020_Email'] || ''
```

**Result**: Queue items now include the ShipToEmail field that UiPath expects.

---

## Next Steps

1. ✅ Webhook is created and active
2. ✅ Multi-environment routing fixed
3. ⏳ Test by updating a complete item in the SharePoint list
4. ⏳ Verify queue item appears in UiPath PROD
5. ⏳ Monitor for any errors in Application Insights

---

**Function App**: webhook-functions-sharepoint-002
**Resource Group**: rg-sharepoint-webhooks
**Region**: East US
