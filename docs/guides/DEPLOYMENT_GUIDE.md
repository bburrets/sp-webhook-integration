# Deployment Guide

## Prerequisites

1. **Azure CLI** installed and logged in:
   ```bash
   az login
   az account set --subscription <your-subscription-id>
   ```

2. **Azure Functions Core Tools** installed:
   ```bash
   npm install -g azure-functions-core-tools@4 --unsafe-perm true
   ```

3. **Node.js 18+** installed

## Initial Setup

### 1. Create Azure Resources

```bash
# Create resource group
az group create --name rg-sharepoint-webhooks --location eastus

# Create storage account
az storage account create \
  --name webhookstorageacct002 \
  --resource-group rg-sharepoint-webhooks \
  --location eastus \
  --sku Standard_LRS

# Create function app
az functionapp create \
  --resource-group rg-sharepoint-webhooks \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name webhook-functions-sharepoint-002 \
  --storage-account webhookstorageacct002
```

### 2. Create Azure AD App Registration

1. Go to Azure Portal → Azure Active Directory → App registrations
2. Click "New registration"
3. Name: "SharePoint Webhook Manager"
4. Supported account types: "Single tenant"
5. Register the application

### 3. Configure App Permissions

1. In your app registration, go to "API permissions"
2. Add permissions:
   - Microsoft Graph → Application permissions → Sites.Read.All
   - Click "Grant admin consent"

### 4. Create Client Secret

1. Go to "Certificates & secrets"
2. New client secret
3. Description: "SharePoint Webhook Secret"
4. Expires: Choose appropriate expiration
5. Copy the secret value immediately

### 5. Configure Function App Settings

```bash
# Set environment variables
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings \
    AZURE_CLIENT_ID=<your-app-client-id> \
    AZURE_CLIENT_SECRET=<your-client-secret> \
    AZURE_TENANT_ID=<your-tenant-id> \
    WEBHOOK_LIST_ID=82a105da-8206-4bd0-851b-d3f2260043f4
```

## Deploy the Functions

### 1. Install Dependencies

```bash
npm install
```

### 2. Deploy to Azure

```bash
func azure functionapp publish webhook-functions-sharepoint-002 --nozip
```

### 3. Get Function Keys

```bash
# Get webhook-handler key (usually not needed as it accepts anonymous requests)
az functionapp function keys list \
  --name webhook-functions-sharepoint-002 \
  --function-name webhook-handler \
  --resource-group rg-sharepoint-webhooks

# Get subscription-manager key (needed for API calls)
az functionapp function keys list \
  --name webhook-functions-sharepoint-002 \
  --function-name subscription-manager \
  --resource-group rg-sharepoint-webhooks

# Get webhook-sync key
az functionapp function keys list \
  --name webhook-functions-sharepoint-002 \
  --function-name webhook-sync \
  --resource-group rg-sharepoint-webhooks
```

## Create SharePoint Management List

1. Navigate to: https://fambrandsllc.sharepoint.com/sites/sphookmanagement
2. Create a new list named "Webhook Management"
3. Add columns as specified in SHAREPOINT_LIST_VIEWING.md
4. Note the list ID from the URL (after List=)
5. Update WEBHOOK_LIST_ID if different from default

## Verify Deployment

### 1. Test Webhook Handler

```bash
curl https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler
# Should return: "Missing validation token"
```

### 2. Test Subscription Manager

```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<function-key>"
# Should return: {"subscriptions":[],"count":0}
```

### 3. Create Test Webhook

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<function-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/<your-test-list-id>",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "expirationDateTime": "2025-08-02T09:00:00Z"
  }'
```

### 4. Run Manual Sync

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=<function-key>"
```

### 5. Check SharePoint List

Navigate to your SharePoint management list and verify the webhook appears.

## Monitoring

### Enable Application Insights

```bash
# Create Application Insights
az monitor app-insights component create \
  --app webhook-functions-insights \
  --location eastus \
  --resource-group rg-sharepoint-webhooks

# Get instrumentation key
az monitor app-insights component show \
  --app webhook-functions-insights \
  --resource-group rg-sharepoint-webhooks \
  --query instrumentationKey

# Update Function App
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings APPINSIGHTS_INSTRUMENTATIONKEY=<instrumentation-key>
```

### View Logs

```bash
# Stream logs
func azure functionapp logstream webhook-functions-sharepoint-002

# Or use Azure Portal
# Function App → Functions → Select function → Monitor
```

## Update Deployment

When making code changes:

1. **Test locally first**:
   ```bash
   func start
   ```

2. **Deploy updates**:
   ```bash
   func azure functionapp publish webhook-functions-sharepoint-002 --nozip
   ```

3. **Verify deployment**:
   - Check Function App → Deployment Center
   - Test endpoints
   - Monitor logs for errors

## Rollback

If issues occur after deployment:

1. **Via Portal**:
   - Function App → Deployment Center → Deployment history
   - Select previous successful deployment
   - Click "Redeploy"

2. **Via Git** (if using source control):
   ```bash
   git checkout <previous-commit>
   func azure functionapp publish webhook-functions-sharepoint-002 --nozip
   ```

## Security Hardening

### 1. Enable Managed Identity

```bash
az functionapp identity assign \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks
```

### 2. Use Key Vault

```bash
# Create Key Vault
az keyvault create \
  --name webhook-secrets-kv \
  --resource-group rg-sharepoint-webhooks \
  --location eastus

# Add secrets
az keyvault secret set \
  --vault-name webhook-secrets-kv \
  --name "AzureClientSecret" \
  --value "<your-client-secret>"

# Grant access to Function App
FUNCTION_IDENTITY=$(az functionapp identity show \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --query principalId -o tsv)

az keyvault set-policy \
  --name webhook-secrets-kv \
  --object-id $FUNCTION_IDENTITY \
  --secret-permissions get

# Update Function App to use Key Vault
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings AZURE_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=https://webhook-secrets-kv.vault.azure.net/secrets/AzureClientSecret/)"
```

### 3. Network Restrictions

```bash
# Restrict to specific IPs if needed
az functionapp config access-restriction add \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --rule-name "AllowMicrosoftGraph" \
  --priority 100 \
  --ip-address <Microsoft-Graph-IP-Range>
```

## Troubleshooting Deployment

### Function App Not Starting
- Check Application Settings for missing values
- Review Function App logs
- Verify storage account connection

### Authentication Errors
- Confirm App Registration permissions
- Verify admin consent is granted
- Check client ID and secret are correct

### SharePoint Access Issues
- Ensure app has Sites.Read.All permission
- Verify SharePoint site URL is correct
- Check list ID matches actual list

### Webhook Creation Fails
- Confirm notification URL is publicly accessible
- Check Graph API permissions
- Verify webhook handler is responding