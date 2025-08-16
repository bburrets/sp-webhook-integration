#!/bin/bash

# Deploy UiPath Configuration to Azure Function App
# This script adds UiPath-specific application settings to the Azure Function App
# Function App: webhook-functions-sharepoint-002
# Resource Group: rg-sharepoint-webhooks

set -e

# Configuration variables
FUNCTION_APP_NAME="webhook-functions-sharepoint-002"
RESOURCE_GROUP="rg-sharepoint-webhooks"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== UiPath Configuration Deployment Script ===${NC}"
echo "Function App: $FUNCTION_APP_NAME"
echo "Resource Group: $RESOURCE_GROUP"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Check if user is logged in
if ! az account show &> /dev/null; then
    echo -e "${RED}Error: Not logged into Azure CLI. Please run 'az login' first.${NC}"
    exit 1
fi

echo -e "${YELLOW}Current Azure account:${NC}"
az account show --query "[name, user.name]" -o table
echo ""

read -p "Do you want to continue with the deployment? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo -e "${GREEN}Deploying UiPath configuration settings...${NC}"

# Deploy UiPath configuration settings
# Note: Replace placeholder values with actual values before running
az functionapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP_NAME" \
    --settings \
        "UIPATH_ORCHESTRATOR_URL=https://your-tenant.uipath.com" \
        "UIPATH_TENANT_NAME=your-tenant-name" \
        "UIPATH_CLIENT_ID=your-client-id" \
        "UIPATH_CLIENT_SECRET=your-client-secret" \
        "UIPATH_ORGANIZATION_UNIT_ID=your-org-unit-id" \
        "UIPATH_DEFAULT_QUEUE=default-queue-name" \
        "UIPATH_ENABLED=false" \
        "UIPATH_AUTO_RETRY=true" \
        "UIPATH_LOGGING=false" \
    --output table

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ UiPath configuration settings deployed successfully!${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Update the placeholder values with your actual UiPath credentials"
    echo "2. Consider using Azure Key Vault for sensitive values like CLIENT_SECRET"
    echo "3. Test the UiPath integration functionality"
    echo ""
    echo -e "${YELLOW}To update specific settings with real values, use:${NC}"
    echo "az functionapp config appsettings set --resource-group $RESOURCE_GROUP --name $FUNCTION_APP_NAME --settings \"UIPATH_CLIENT_SECRET=<actual-secret>\""
else
    echo -e "${RED}✗ Failed to deploy configuration settings${NC}"
    exit 1
fi

echo -e "${GREEN}Deployment completed!${NC}"