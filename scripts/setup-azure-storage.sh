#!/bin/bash

# Azure Storage Setup Script for SharePoint Webhook Change Detection
# This script creates and configures Azure Table Storage for tracking SharePoint item changes

# Configuration
RESOURCE_GROUP="rg-sharepoint-webhooks"
STORAGE_ACCOUNT_NAME="webhookstatestorage"
LOCATION="eastus"
FUNCTION_APP_NAME="webhook-functions-sharepoint-002"

echo "🚀 Setting up Azure Storage for SharePoint change detection..."

# 1. Create storage account
echo "📦 Creating storage account: $STORAGE_ACCOUNT_NAME"
az storage account create \
  --name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot

# 2. Get storage account key
echo "🔑 Retrieving storage account key..."
STORAGE_KEY=$(az storage account keys list \
  --account-name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --query '[0].value' \
  --output tsv)

# 3. Get connection string
echo "🔗 Getting connection string..."
CONNECTION_STRING=$(az storage account show-connection-string \
  --name $STORAGE_ACCOUNT_NAME \
  --resource-group $RESOURCE_GROUP \
  --query connectionString \
  --output tsv)

# 4. Create the table (optional - the app will create it automatically)
echo "📊 Creating SharePointItemStates table..."
az storage table create \
  --name SharePointItemStates \
  --account-name $STORAGE_ACCOUNT_NAME \
  --account-key "$STORAGE_KEY"

# 5. Add connection string to Function App settings
echo "⚙️  Adding connection string to Function App..."
az functionapp config appsettings set \
  --name $FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings "AZURE_STORAGE_CONNECTION_STRING=$CONNECTION_STRING"

# 6. Output the connection string for local development
echo ""
echo "✅ Azure Storage setup complete!"
echo ""
echo "📝 For local development, add this to your local.settings.json:"
echo "\"AZURE_STORAGE_CONNECTION_STRING\": \"$CONNECTION_STRING\""
echo ""
echo "🔍 Storage Account Details:"
echo "   Name: $STORAGE_ACCOUNT_NAME"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Location: $LOCATION"
echo "   Table: SharePointItemStates"
echo ""
echo "💡 To view your table data:"
echo "   az storage table list --account-name $STORAGE_ACCOUNT_NAME --account-key '$STORAGE_KEY'"