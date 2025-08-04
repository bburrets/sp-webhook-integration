# Client Secret Fix - SharePoint Webhook Function App

## Issue Summary
- **Date**: August 1, 2025
- **Error**: AADSTS7000215 - Invalid client secret provided
- **Root Cause**: The AZURE_CLIENT_SECRET environment variable contains the secret ID instead of the secret value
- **Impact**: All API endpoints requiring authentication are returning 500 errors

## New Client Secret Details
- **App Name**: PostmanGraphTester
- **App ID**: b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f
- **New Secret Value**: `niS8Q~pUx~ac~0ETeQk1YPFk_pJTVFbn9FZ-Wb0N`
- **Expiration**: 2 years from today (August 1, 2027)
- **Tenant ID**: f6e7449b-d39b-4300-822f-79267def3ab3

## Fix Instructions

### Option 1: Using Azure CLI (requires Contributor access)
```bash
# Run the provided script
./scripts/fix-client-secret.sh
```

### Option 2: Using Azure Portal
1. Navigate to the Function App: `webhook-functions-sharepoint-002`
2. Go to Configuration → Application settings
3. Find `AZURE_CLIENT_SECRET`
4. Update the value to: `niS8Q~pUx~ac~0ETeQk1YPFk_pJTVFbn9FZ-Wb0N`
5. Click Save
6. Restart the Function App

### Option 3: Manual Azure CLI Commands
```bash
# Update the setting
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group sharepoint-webhook-rg \
  --settings AZURE_CLIENT_SECRET="niS8Q~pUx~ac~0ETeQk1YPFk_pJTVFbn9FZ-Wb0N"

# Restart the Function App
az functionapp restart \
  --name webhook-functions-sharepoint-002 \
  --resource-group sharepoint-webhook-rg
```

## Verification
After applying the fix, test the API:
```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=yg46Yo3hgkODuN7oA5PTd4N-Wbu7Oj5YsNVz7uUM0EJJAzFuBKVhEA=="
```

You should receive a JSON response with subscription data instead of a 500 error.

## Prevention
- Always use the secret VALUE, not the ID when configuring client secrets
- Document the secret expiration date
- Set up alerts for secret expiration (30 days before)
- Consider using Key Vault for secret management