#!/bin/bash

# Script to fix the client secret issue
# Run this with an account that has Contributor access to the Function App

echo "Updating Azure Function App client secret..."

# The new client secret value
CLIENT_SECRET="niS8Q~pUx~ac~0ETeQk1YPFk_pJTVFbn9FZ-Wb0N"

# Update the Function App setting
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group sharepoint-webhook-rg \
  --settings AZURE_CLIENT_SECRET="$CLIENT_SECRET"

echo "Client secret updated. Restarting Function App..."

# Restart the Function App to apply changes
az functionapp restart \
  --name webhook-functions-sharepoint-002 \
  --resource-group sharepoint-webhook-rg

echo "Function App restarted. Testing the API..."

# Wait a few seconds for restart
sleep 10

# Test the API
curl -s "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=yg46Yo3hgkODuN7oA5PTd4N-Wbu7Oj5YsNVz7uUM0EJJAzFuBKVhEA==" | jq .

echo "Done!"