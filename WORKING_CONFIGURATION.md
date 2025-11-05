# WORKING WEBHOOK CONFIGURATION - DEVELOPMENT ENVIRONMENT
## Date: August 20, 2025
## Status: ✅ VERIFIED WORKING

This document captures the **WORKING** configuration for the SharePoint to UiPath webhook integration in the Development environment.

---

## 🎯 CRITICAL CONFIGURATION POINTS

### Azure Function App Settings
```
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_
UIPATH_TENANT_NAME=FAMBrands_RPAOPS
UIPATH_ORGANIZATION_UNIT_ID=277500
UIPATH_DEFAULT_QUEUE=TEST_API
UIPATH_CLIENT_ID=cb772a87-0f11-4764-bf71-ff2467f2a75a
UIPATH_ENABLED=true
```

### Active Webhook Details
- **Webhook ID**: 18285e26-157f-4504-831d-27f2c0cdea4e
- **SharePoint List**: COSTCO-INLINE-Trafficking-Routing (ID: 8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3)
- **Target Queue**: Trafficking Request Email Trigger_Queue
- **Environment**: Development (FAMBrands_RPAOPS)
- **Folder ID**: 277500
- **Expires**: August 23, 2025

### Webhook Tracking Information (ClientState)
The webhook's clientState contains configuration metadata:
```
processor:uipath;uipath:Trafficking Request Email Trigger_Queue;env:DEV;folder:277500
```
This identifies:
- **processor:uipath** - This is a UiPath integration webhook
- **uipath:** - Target queue name in UiPath
- **env:DEV** - Development environment
- **folder:277500** - UiPath folder/Organization Unit
- **Config Source**: Azure Function App settings (webhook-functions-sharepoint-002)

### SharePoint List Being Monitored
- **URL**: https://fambrandsllc.sharepoint.com/sites/COSTCO-INLINE-Trafficking-Routing/
- **List ID**: 8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3
- **Trigger Condition**: Status field = "Send Generated Form"

---

## ✅ WHAT'S WORKING

1. **Webhook Registration**: Successfully registered with SharePoint
2. **Change Detection**: SharePoint notifications are received
3. **Status Filtering**: Only processes items with Status="Send Generated Form"
4. **UiPath Authentication**: Successfully authenticates with Development tenant
5. **Queue Targeting**: Correctly identifies "Trafficking Request Email Trigger_Queue"
6. **Folder Access**: Uses Development folder 277500
7. **Application Insights**: Logging and monitoring functional

---

## 🔑 KEY LEARNINGS

### Authentication
- The same client credentials work for both Development and Production
- The tenant URL and folder ID determine the environment
- Development: FAMBrands_RPAOPS (folder 277500)
- Production: FAMBrands_RPAOPS_PROD (folder 376892)

### Function Keys (Current as of Aug 20, 2025)
```
subscription-manager: <REDACTED>
webhook-sync: <REDACTED>
```
**Note**: Retrieve function keys from Azure Portal when needed

---

## 📋 TESTING CHECKLIST

To verify the webhook is working:

1. ✅ Check webhook is registered:
   ```bash
   curl -X GET "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" -H "Accept: application/json"
   ```

2. ✅ Update a SharePoint item:
   - Set Status to "Send Generated Form"
   - Ensure item has required fields (PO Number, Ship To Email, etc.)

3. ✅ Monitor Application Insights for processing logs

4. ✅ Check UiPath Queue for new items in "Trafficking Request Email Trigger_Queue"

---

## ⚠️ IMPORTANT NOTES

1. **Do NOT change** UIPATH_ORGANIZATION_UNIT_ID without understanding the folder structure
2. **Do NOT change** UIPATH_TENANT_NAME without coordinating environment switch
3. Always restart Function App after configuration changes
4. Webhook expires every 3 days - sync job handles renewal automatically

---

## 🔄 TO SWITCH ENVIRONMENTS

### For Production:
```
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_
UIPATH_TENANT_NAME=FAMBrands_RPAOPS_PROD
UIPATH_ORGANIZATION_UNIT_ID=376892
```

### For Development (CURRENT):
```
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_
UIPATH_TENANT_NAME=FAMBrands_RPAOPS
UIPATH_ORGANIZATION_UNIT_ID=277500
```

---

## 📝 COMMIT MESSAGE FOR THIS WORKING STATE

```
feat: establish working SharePoint-UiPath webhook for Development environment

- Webhook successfully processes COSTCO-INLINE-Trafficking-Routing items
- Correctly routes to Trafficking Request Email Trigger_Queue in Dev folder 277500
- Status field filtering working (Send Generated Form)
- Application Insights monitoring configured
- Authentication validated for Development tenant

WORKING CONFIGURATION CHECKPOINT - Development Testing Ready
```