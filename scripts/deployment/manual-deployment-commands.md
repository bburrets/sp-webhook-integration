# Manual Azure Functions Deployment Reset Commands

Use these commands step-by-step if the automated script fails or you need manual control.

## Prerequisites
```bash
# Ensure you're logged into Azure
az login

# Verify Function App exists
az functionapp list --query "[?name=='webhook-functions-sharepoint-002']" -o table
```

## Step 1: Stop Function App and Clear Cache
```bash
# Get resource group
RG=$(az functionapp list --query "[?name=='webhook-functions-sharepoint-002'].resourceGroup" -o tsv)
echo "Resource Group: $RG"

# Stop the function app
az functionapp stop --name webhook-functions-sharepoint-002 --resource-group $RG

# Disable package mode to force cache clear
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group $RG \
  --settings WEBSITE_RUN_FROM_PACKAGE=0

# Wait 30 seconds for configuration to propagate
sleep 30
```

## Step 2: Clear Runtime Cache
```bash
# Start function app briefly to clear runtime caches
az functionapp start --name webhook-functions-sharepoint-002 --resource-group $RG
sleep 20

# Stop again for deployment
az functionapp stop --name webhook-functions-sharepoint-002 --resource-group $RG
```

## Step 3: Configure Optimal Deployment Settings
```bash
# Set optimal deployment configuration
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group $RG \
  --settings \
    WEBSITE_RUN_FROM_PACKAGE=1 \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false \
    ENABLE_ORYX_BUILD=true \
    WEBSITE_ENABLE_SYNC_UPDATE_SITE=true \
    FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR=true

# Set explicit Node.js version
az functionapp config set \
  --name webhook-functions-sharepoint-002 \
  --resource-group $RG \
  --node-version "~18"
```

## Step 4: Clean Local Environment
```bash
# Remove local build artifacts
rm -rf node_modules package-lock.json

# Fresh install
npm install
```

## Step 5: Force Deploy
```bash
# Deploy with maximum force
func azure functionapp publish webhook-functions-sharepoint-002 \
  --force \
  --build-native-deps \
  --no-bundler

# Wait for deployment
sleep 45
```

## Step 6: Start and Verify
```bash
# Start function app
az functionapp start --name webhook-functions-sharepoint-002 --resource-group $RG

# Wait for startup
sleep 30

# Test health check
curl https://webhook-functions-sharepoint-002.azurewebsites.net/api/health-check

# List functions
func azure functionapp list-functions webhook-functions-sharepoint-002
```

## Alternative: Nuclear Option (Complete Recreation)

If the above doesn't work, you may need to recreate the deployment package:

```bash
# 1. Create a completely fresh deployment package
rm -rf node_modules package-lock.json .funcignore

# 2. Clean npm cache
npm cache clean --force

# 3. Fresh install
npm install

# 4. Deploy with ZIP method instead
zip -r deployment.zip . -x "*.git*" "node_modules/.cache/*" "scripts/*" ".claude/*"

# 5. Deploy ZIP package
az functionapp deployment source config-zip \
  --name webhook-functions-sharepoint-002 \
  --resource-group $RG \
  --src deployment.zip

# 6. Restart
az functionapp restart --name webhook-functions-sharepoint-002 --resource-group $RG
```

## Troubleshooting Commands

### Check Current Settings
```bash
# View all deployment-related settings
az functionapp config appsettings list \
  --name webhook-functions-sharepoint-002 \
  --resource-group $RG \
  --query "[?name=='WEBSITE_RUN_FROM_PACKAGE' || name=='SCM_DO_BUILD_DURING_DEPLOYMENT' || name=='ENABLE_ORYX_BUILD']"

# Check runtime version
az functionapp config show \
  --name webhook-functions-sharepoint-002 \
  --resource-group $RG \
  --query "{nodeVersion:nodeVersion, linuxFxVersion:linuxFxVersion, scmType:scmType}"
```

### Monitor Deployment
```bash
# Stream logs during deployment
func azure functionapp logstream webhook-functions-sharepoint-002

# Check deployment history
az functionapp deployment list \
  --name webhook-functions-sharepoint-002 \
  --resource-group $RG \
  --query "[0:3].{status:status, start:startTime, end:endTime, message:message}"
```

### Force Restart Everything
```bash
# Complete restart sequence
az functionapp stop --name webhook-functions-sharepoint-002 --resource-group $RG
sleep 10
az functionapp start --name webhook-functions-sharepoint-002 --resource-group $RG
sleep 30
az functionapp restart --name webhook-functions-sharepoint-002 --resource-group $RG
```

## Verification Steps

1. **Test the specific field mapping issue:**
   - Create a test SharePoint item with `PO_No: "TEST12345"`
   - Monitor logs: `func azure functionapp logstream webhook-functions-sharepoint-002`
   - Look for reference pattern: Should be `COSTCO_TEST12345_[ItemID]_[Timestamp]`
   - If it shows `COSTCO_undefined_[ItemID]_[Timestamp]`, old code is still running

2. **Check code version:**
   ```bash
   # The COSTCO template should log this when processing:
   # "Processing COSTCO item for UiPath queue" with poNumber field
   ```

3. **Verify file system state:**
   ```bash
   # Check if files are properly deployed
   az functionapp vfs show \
     --name webhook-functions-sharepoint-002 \
     --resource-group $RG \
     --path "/site/wwwroot/src/templates/costco-inline-routing.js"
   ```