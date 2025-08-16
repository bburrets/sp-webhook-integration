#!/bin/bash

# Deployment Verification Script
# This script helps verify which code version is actually running

set -e

FUNCTION_APP_NAME="webhook-functions-sharepoint-002"

echo "🔍 Verifying deployment for $FUNCTION_APP_NAME..."
echo ""

# Function to make HTTP request with timeout
make_request() {
    local url=$1
    local timeout=${2:-10}
    
    curl -f -s --max-time $timeout "$url" 2>/dev/null || echo "REQUEST_FAILED"
}

# Test health check
echo "1️⃣ Testing health check..."
HEALTH_URL="https://$FUNCTION_APP_NAME.azurewebsites.net/api/health-check"
HEALTH_RESPONSE=$(make_request "$HEALTH_URL")

if [ "$HEALTH_RESPONSE" != "REQUEST_FAILED" ]; then
    echo "✅ Health check successful"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo "❌ Health check failed"
fi
echo ""

# Test a simple webhook call to see what template logic is running
echo "2️⃣ Testing webhook handler response..."
WEBHOOK_URL="https://$FUNCTION_APP_NAME.azurewebsites.net/api/webhook-handler"

# Try a basic GET request to see if it responds with current logic
WEBHOOK_RESPONSE=$(make_request "$WEBHOOK_URL")
if [ "$WEBHOOK_RESPONSE" != "REQUEST_FAILED" ]; then
    echo "✅ Webhook handler responding"
    echo "   Response length: ${#WEBHOOK_RESPONSE} characters"
    # Show first 200 characters to avoid cluttering output
    echo "   Preview: ${WEBHOOK_RESPONSE:0:200}..."
else
    echo "❌ Webhook handler not responding"
fi
echo ""

# Check if we can access the test function
echo "3️⃣ Testing queue submission function..."
TEST_QUEUE_URL="https://$FUNCTION_APP_NAME.azurewebsites.net/api/test-queue-submission"
TEST_RESPONSE=$(make_request "$TEST_QUEUE_URL")

if [ "$TEST_RESPONSE" != "REQUEST_FAILED" ]; then
    echo "✅ Test queue function responding"
    echo "   Response length: ${#TEST_RESPONSE} characters"
else
    echo "❌ Test queue function not responding"
fi
echo ""

# Check Azure Function App status
echo "4️⃣ Checking Azure Function App status..."
RG=$(az functionapp list --query "[?name=='$FUNCTION_APP_NAME'].resourceGroup" -o tsv)
STATUS=$(az functionapp show --name $FUNCTION_APP_NAME --resource-group $RG --query "state" -o tsv)
echo "   Function App State: $STATUS"

# Check last deployment time
echo ""
echo "5️⃣ Checking deployment information..."
DEPLOYMENT_INFO=$(az functionapp deployment list --name $FUNCTION_APP_NAME --resource-group $RG --query "[0].{status:status,startTime:startTime,endTime:endTime}" -o json 2>/dev/null || echo "null")

if [ "$DEPLOYMENT_INFO" != "null" ]; then
    echo "   Last deployment: $DEPLOYMENT_INFO"
else
    echo "   No deployment history available"
fi

# Check current app settings that affect deployment
echo ""
echo "6️⃣ Checking deployment-related settings..."
PACKAGE_MODE=$(az functionapp config appsettings list --name $FUNCTION_APP_NAME --resource-group $RG --query "[?name=='WEBSITE_RUN_FROM_PACKAGE'].value" -o tsv)
BUILD_SETTING=$(az functionapp config appsettings list --name $FUNCTION_APP_NAME --resource-group $RG --query "[?name=='SCM_DO_BUILD_DURING_DEPLOYMENT'].value" -o tsv)
NODE_VERSION=$(az functionapp config show --name $FUNCTION_APP_NAME --resource-group $RG --query "nodeVersion" -o tsv)

echo "   WEBSITE_RUN_FROM_PACKAGE: $PACKAGE_MODE"
echo "   SCM_DO_BUILD_DURING_DEPLOYMENT: $BUILD_SETTING" 
echo "   Node.js Version: $NODE_VERSION"

echo ""
echo "7️⃣ Code version fingerprint test..."
echo "   To verify if your COSTCO template fixes are deployed, create a test item"
echo "   in SharePoint with these values and check the logs:"
echo ""
echo "   - PO_No: TEST123456"
echo "   - Status: Send Generated Form"
echo "   - Style: TestStyle"
echo "   - ShiptoEmail: test@example.com"
echo "   - ShipDate: 12/25/2024"
echo ""
echo "   Then check logs with:"
echo "   func azure functionapp logstream $FUNCTION_APP_NAME"
echo ""
echo "   Look for log entries containing:"
echo "   - 'Processing COSTCO item for UiPath queue'"
echo "   - Reference pattern: 'COSTCO_TEST123456_[ItemID]_[Timestamp]'"
echo ""
echo "   If the reference shows 'undefined' instead of TEST123456, the old code is still running."

echo ""
echo "🎯 Quick verification commands:"
echo "   # Watch live logs:"
echo "   func azure functionapp logstream $FUNCTION_APP_NAME"
echo ""
echo "   # Test health check:"
echo "   curl https://$FUNCTION_APP_NAME.azurewebsites.net/api/health-check"
echo ""
echo "   # Check functions list:"
echo "   func azure functionapp list-functions $FUNCTION_APP_NAME"