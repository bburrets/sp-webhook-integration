#!/bin/bash

# Force Deploy Script for Azure Functions
# This script performs a complete deployment reset to ensure fresh code deployment

set -e  # Exit on any error

FUNCTION_APP_NAME="webhook-functions-sharepoint-002"
RESOURCE_GROUP="rg-sharepoint-webhooks"

echo "🚀 Starting forced deployment process for $FUNCTION_APP_NAME..."

# Step 1: Get current resource group
echo "📍 Getting resource group..."
RG=$(az functionapp list --query "[?name=='$FUNCTION_APP_NAME'].resourceGroup" -o tsv)
if [ -z "$RG" ]; then
    echo "❌ Could not find function app $FUNCTION_APP_NAME"
    exit 1
fi
echo "✅ Found resource group: $RG"

# Step 2: Stop the function app
echo "🛑 Stopping function app..."
az functionapp stop --name $FUNCTION_APP_NAME --resource-group $RG
echo "✅ Function app stopped"

# Step 3: Clear deployment cache by temporarily disabling package mode
echo "🧹 Clearing deployment cache..."
az functionapp config appsettings set --name $FUNCTION_APP_NAME --resource-group $RG --settings WEBSITE_RUN_FROM_PACKAGE=0
echo "✅ Package mode disabled"

# Step 4: Wait for configuration to propagate
echo "⏳ Waiting for configuration to propagate..."
sleep 30

# Step 5: Start function app to clear any runtime caches
echo "▶️ Starting function app to clear caches..."
az functionapp start --name $FUNCTION_APP_NAME --resource-group $RG
sleep 20

# Step 6: Stop function app again for clean deployment
echo "🛑 Stopping function app for deployment..."
az functionapp stop --name $FUNCTION_APP_NAME --resource-group $RG

# Step 7: Set optimal deployment settings
echo "⚙️ Setting optimal deployment settings..."
az functionapp config appsettings set --name $FUNCTION_APP_NAME --resource-group $RG --settings \
    WEBSITE_RUN_FROM_PACKAGE=1 \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false \
    ENABLE_ORYX_BUILD=true \
    WEBSITE_ENABLE_SYNC_UPDATE_SITE=true \
    FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR=true

# Step 8: Set explicit Node.js version
echo "🔧 Setting Node.js version..."
az functionapp config appsettings set --name $FUNCTION_APP_NAME --resource-group $RG --settings WEBSITE_NODE_DEFAULT_VERSION=~18

# Step 9: Clean local build artifacts
echo "🧼 Cleaning local build artifacts..."
if [ -d "node_modules" ]; then
    rm -rf node_modules
fi
if [ -f "package-lock.json" ]; then
    rm -f package-lock.json
fi

# Step 10: Fresh install
echo "📦 Installing dependencies..."
npm install

# Step 11: Deploy with maximum force
echo "🚀 Deploying with force..."
func azure functionapp publish $FUNCTION_APP_NAME --force --build-native-deps --no-bundler

# Step 12: Wait for deployment to complete
echo "⏳ Waiting for deployment to complete..."
sleep 45

# Step 13: Start function app
echo "▶️ Starting function app..."
az functionapp start --name $FUNCTION_APP_NAME --resource-group $RG

# Step 14: Wait for startup
echo "⏳ Waiting for function app to fully start..."
sleep 30

# Step 15: Verify deployment
echo "🔍 Verifying deployment..."
HEALTH_URL="https://$FUNCTION_APP_NAME.azurewebsites.net/api/health-check"
echo "Health check URL: $HEALTH_URL"

# Wait a bit more and try health check
sleep 15
if curl -f -s "$HEALTH_URL" > /dev/null; then
    echo "✅ Deployment verification successful!"
else
    echo "⚠️ Health check failed, but deployment may still be successful"
    echo "   Try the health check manually: $HEALTH_URL"
fi

echo ""
echo "🎉 Forced deployment complete!"
echo "📋 Summary of actions taken:"
echo "   1. Stopped function app"
echo "   2. Disabled package mode to clear cache"
echo "   3. Re-enabled optimized settings"
echo "   4. Set explicit Node.js version"
echo "   5. Cleaned and reinstalled dependencies"
echo "   6. Force deployed with native build"
echo "   7. Restarted function app"
echo ""
echo "🔗 Function URLs:"
func azure functionapp list-functions $FUNCTION_APP_NAME | head -20

echo ""
echo "📊 To monitor logs:"
echo "   func azure functionapp logstream $FUNCTION_APP_NAME"
echo ""
echo "🧪 To test webhook handler:"
echo "   https://$FUNCTION_APP_NAME.azurewebsites.net/api/webhook-handler"