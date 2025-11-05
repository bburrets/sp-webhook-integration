# CLAUDE.md - AI Assistant Context

## Project: SharePoint to UiPath Webhook Integration

### Current Status: ✅ WORKING (Development Environment)
**Last Verified**: August 20, 2025

---

## Quick Commands

### Check Webhook Status
```bash
curl -X GET "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" -H "Accept: application/json" -s | jq '.'
```

### Trigger Webhook Sync
```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<FUNCTION_KEY>" -H "Content-Type: application/json" -d '{}' -s | jq '.'
```

### View Azure Function Logs
```bash
az monitor app-insights query --app webhook-functions-sharepoint-002 --resource-group rg-sharepoint-webhooks --analytics-query "traces | where timestamp > ago(10m) | order by timestamp desc | limit 50" --output table
```

---

## Critical Information

### Current Environment: DEVELOPMENT
- **Tenant**: FAMBrands_RPAOPS (NOT _PROD)
- **Folder**: 277500
- **Queue**: Trafficking Request Email Trigger_Queue
- **SharePoint List**: COSTCO-INLINE-Trafficking-Routing

### Working Webhook ID
`07c6db43-15c9-4074-a40c-c5576c2f2011` (expires Aug 23, 2025)

### ClientState Configuration
```
processor:uipath;uipath:Trafficking Request Email Trigger_Queue;env:DEV;folder:277500;config:AzureFunctionApp
```
**Note**: ClientState is now properly preserved in SharePoint tracking list

---

## Common Issues & Solutions

### "Folder does not exist" Error
- **Cause**: Using wrong tenant (PROD instead of DEV)
- **Fix**: Ensure UIPATH_TENANT_NAME=FAMBrands_RPAOPS (no _PROD suffix)

### "Queue does not exist" Error  
- **Cause**: Queue name mismatch or wrong folder
- **Fix**: Verify queue name exactly matches "Trafficking Request Email Trigger_Queue"

### Webhook Not Processing
- **Check**: Item Status field must equal "Send Generated Form"
- **Verify**: Webhook is active (use status command above)

---

## Environment Configurations

### Development (CURRENT)
```
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_
UIPATH_TENANT_NAME=FAMBrands_RPAOPS
UIPATH_ORGANIZATION_UNIT_ID=277500
```

### Production
```
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_
UIPATH_TENANT_NAME=FAMBrands_RPAOPS_PROD  
UIPATH_ORGANIZATION_UNIT_ID=376892
```

---

## Testing Workflow

1. Update SharePoint item with Status="Send Generated Form"
2. Check Application Insights logs (should process within seconds)
3. Verify item appears in UiPath queue
4. If issues, check tenant/folder configuration first

---

## Important Notes

- Webhooks auto-renew via timer function (runs hourly)
- Same client credentials work for both Dev and Prod
- Always restart Function App after config changes
- Function keys may rotate - check Azure Portal if auth fails

---

## Contact for Issues
- Azure Resource Group: rg-sharepoint-webhooks
- Function App: webhook-functions-sharepoint-002
- Application Insights: webhook-functions-sharepoint-002

Last Working Commit: d34f6f9 (Aug 20, 2025)