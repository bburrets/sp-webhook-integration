# Multi-Environment Support Guide

## Overview

The SharePoint to UiPath webhook integration now supports **multiple UiPath environments simultaneously**. You can have webhooks routing to both DEV and PROD tenants from the same Azure Function App.

**Version**: 2.0
**Last Updated**: December 8, 2025

---

## How It Works

Environment configuration is specified **per-webhook** through the `clientState` parameter. The system parses the clientState and dynamically routes to the appropriate UiPath tenant and folder.

### Architecture

```
SharePoint Webhook → webhook-handler → Dispatcher → Environment Parser → UiPath Client → Orchestrator
                          ↓                              ↓
                    Extract clientState          DEV or PROD tenant
```

---

## ClientState Format

```
processor:uipath;uipath:QUEUE_NAME;env:ENV_NAME;folder:FOLDER_ID;config:AzureFunctionApp
```

### Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `processor` | Yes | Must be `uipath` to trigger UiPath routing | `processor:uipath` |
| `uipath` | Yes | Queue name in UiPath Orchestrator | `uipath:My_Queue_Name` |
| `env` | **Recommended** | Environment preset: `DEV` or `PROD` | `env:PROD` |
| `folder` | Optional | Override organization unit ID | `folder:376892` |
| `config` | Optional | Configuration identifier | `config:AzureFunctionApp` |

### Environment Presets

#### DEV Environment
```
Tenant: FAMBrands_RPAOPS
Folder: 277500
Orchestrator: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_
```

#### PROD Environment
```
Tenant: FAMBrands_RPAOPS_PROD
Folder: 376892
Orchestrator: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_
```

---

## Examples

### Example 1: PROD Environment
```json
{
  "resource": "sites/fambrandsllc.sharepoint.com:/sites/COSTCO-INLINE-Trafficking-Routing:/lists/8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3",
  "changeType": "updated",
  "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
  "clientState": "processor:uipath;uipath:Trafficking_Request_Email_Trigger_Queue;env:PROD;folder:376892;config:AzureFunctionApp"
}
```

**Result**: Queue items sent to **PROD** tenant (FAMBrands_RPAOPS_PROD), folder 376892

### Example 2: DEV Environment
```json
{
  "resource": "sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/30516097-c58c-478c-b87f-76c8f6ce2b56",
  "changeType": "updated",
  "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
  "clientState": "processor:uipath;uipath:Test_Queue;env:DEV;folder:277500;config:AzureFunctionApp"
}
```

**Result**: Queue items sent to **DEV** tenant (FAMBrands_RPAOPS), folder 277500

### Example 3: Custom Folder Override
```json
{
  "clientState": "processor:uipath;uipath:My_Queue;env:PROD;folder:999999;config:AzureFunctionApp"
}
```

**Result**: Uses PROD tenant but with custom folder ID 999999

---

## Creating Multi-Environment Webhooks

### Step 1: Determine Your Requirements

1. **Environment**: DEV or PROD?
2. **Queue Name**: Exact name from UiPath Orchestrator
3. **Folder**: Use preset or custom folder ID?

### Step 2: Create the Webhook

Using the subscription-manager API:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/<YOUR_SITE_PATH>:/lists/<LIST_ID>",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "processor:uipath;uipath:<QUEUE_NAME>;env:<DEV|PROD>;folder:<FOLDER_ID>;config:AzureFunctionApp"
  }'
```

### Step 3: Verify the Webhook

```bash
curl -X GET "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Accept: application/json" | jq '.subscriptions[] | {id, resource, expirationDateTime}'
```

**Note**: Microsoft Graph doesn't return clientState in GET responses, but it's stored in the SharePoint tracking list.

---

## Active Webhooks

### Production Webhook
- **ID**: `70db53dc-e1cf-4954-8c10-94717a2ab2fb`
- **List**: COSTCO-INLINE-Trafficking-Routing (PROD)
- **Queue**: `Trafficking_Request_Email_Trigger_Queue`
- **Environment**: PROD (FAMBrands_RPAOPS_PROD)
- **Folder**: 376892
- **Expires**: December 11, 2025

---

## Troubleshooting

### Issue: "Folder does not exist"

**Cause**: Wrong folder ID or environment mismatch

**Solution**:
1. Verify folder exists in UiPath Orchestrator
2. Check environment preset matches tenant
3. Ensure folder ID is correct for the environment

### Issue: "Queue does not exist"

**Cause**: Queue name mismatch or wrong folder

**Solution**:
1. Verify exact queue name (case-sensitive, including underscores)
2. Confirm queue exists in specified folder
3. Check environment (DEV vs PROD)

### Issue: Items not appearing in queue

**Debugging Steps**:
1. Check Application Insights logs:
   ```bash
   az monitor app-insights query --app webhook-functions-sharepoint-002 \
     --analytics-query "traces | where message contains 'UiPath' | order by timestamp desc | limit 50"
   ```

2. Verify clientState parsing:
   - Look for log: "Using UiPath environment configuration"
   - Confirm tenantName and folder match expectations

3. Test webhook handler:
   ```bash
   # Trigger a manual notification to see logs
   curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler" \
     -H "Content-Type: application/json" \
     -d '{"value":[{"subscriptionId":"<WEBHOOK_ID>","resource":"...","changeType":"updated"}]}'
   ```

---

## Migration Guide

### From Single Environment to Multi-Environment

If you have existing webhooks that need to support both DEV and PROD:

1. **Option A**: Update existing webhook clientState
   - Delete old webhook
   - Create new webhook with env parameter

2. **Option B**: Create parallel webhook
   - Keep existing webhook for DEV
   - Create new webhook with PROD env parameter

**Recommended**: Option A for cleaner management

---

## Best Practices

1. **Always specify environment**: Even if using defaults, explicitly set `env:DEV` or `env:PROD`
2. **Use descriptive queue names**: Include environment in queue name when possible
3. **Monitor both environments**: Set up separate Application Insights queries for DEV/PROD
4. **Test in DEV first**: Create DEV webhook, test thoroughly, then create PROD webhook
5. **Document your webhooks**: Maintain a list of active webhooks and their purposes

---

## Technical Implementation

### Environment Config Module
Location: `src/shared/uipath-environment-config.js`

Key functions:
- `parseEnvironmentFromClientState()` - Extracts env, folder, queue from clientState
- `buildUiPathConfig()` - Builds complete config with environment overrides
- `getEnvironmentConfig()` - Main function used by dispatcher

### Modified Components
1. **UiPath Auth** (`uipath-auth.js`) - Accepts configOverrides
2. **Queue Client** (`uipath-queue-client.js`) - Uses dynamic organizationUnitId
3. **Dynamic Dispatcher** (`uipath-dispatcher-dynamic.js`) - Extracts and passes config
4. **Processors** (`costco-inline-routing.js`) - Accept configOverrides parameter

---

## Support

For issues or questions:
- Check Application Insights logs first
- Review this guide for common issues
- Verify environment configuration in clientState
- Test with simple DEV webhook before PROD

**Last Verified**: December 8, 2025
