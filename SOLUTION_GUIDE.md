# SharePoint Webhook Solution Guide

## Overview

This solution enables real-time monitoring of SharePoint list changes using Microsoft Graph webhooks and Azure Functions. When items in a SharePoint list are created, updated, or deleted, the system receives instant notifications.

## Architecture

```
SharePoint List → Microsoft Graph → Webhook Handler → Your Business Logic
                                         ↑
                                  Subscription Manager
```

### Components

1. **webhook-handler** - Receives and processes SharePoint change notifications
2. **subscription-manager** - Creates, lists, and manages webhook subscriptions
3. **Azure Function App** - Hosts both functions in the cloud
4. **Azure AD App Registration** - Provides authentication to Microsoft Graph

## How It Works

### 1. Subscription Flow
1. Your app calls `subscription-manager` to create a webhook subscription
2. Microsoft Graph validates your webhook endpoint
3. Graph monitors the specified SharePoint resource for changes
4. Subscriptions expire after 3 days (SharePoint limitation) and must be renewed

### 2. Notification Flow
1. User modifies a SharePoint list item
2. Microsoft Graph detects the change
3. Graph sends a POST request to your `webhook-handler`
4. Your handler processes the notification
5. You can then fetch details about what changed using Graph API

### 3. Validation Process
When creating a subscription, Microsoft Graph:
1. Sends a GET request with `?validationToken=xyz` to your webhook
2. Your webhook must return the exact token value
3. Only then is the subscription created

## Configuration

### Prerequisites
- Azure subscription
- SharePoint site with appropriate permissions
- Global admin or appropriate consent for Graph API permissions

### Required Azure Resources
- **Function App**: webhook-functions-sharepoint-002
- **Storage Account**: webhookstorageacct002
- **App Service Plan**: EastUSPlan
- **Application Insights**: webhook-functions-sharepoint-002

### Environment Variables
Set these in Function App Configuration:
```
AZURE_CLIENT_ID=<your-app-registration-client-id>
AZURE_CLIENT_SECRET=<your-app-registration-secret>
AZURE_TENANT_ID=<your-tenant-id>
AzureWebJobsStorage=<storage-connection-string>
```

## Usage Guide

### Creating a Subscription

1. **Get your function key**:
   - Azure Portal → Function App → Functions → subscription-manager → Function Keys

2. **Find SharePoint IDs**:
   ```bash
   # Get site ID
   GET https://graph.microsoft.com/v1.0/sites/{hostname}:/{site-path}
   
   # Get list ID (from SharePoint URL)
   # Look for List=%7B{list-id}%7D in the URL
   ```

3. **Create subscription**:
   ```bash
   curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code={function-key}" \
     -H "Content-Type: application/json" \
     -d '{
       "resource": "sites/{site-id}/lists/{list-id}",
       "changeType": "updated",
       "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler"
     }'
   ```

### Monitoring Subscriptions

**List active subscriptions**:
```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code={function-key}"
```

**Delete a subscription**:
```bash
curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code={function-key}&subscriptionId={subscription-id}"
```

### Processing Notifications

Notifications arrive with this structure:
```json
{
  "value": [{
    "subscriptionId": "...",
    "clientState": "SharePointWebhook",
    "changeType": "updated",
    "resource": "sites/.../lists/...",
    "resourceData": {
      "@odata.type": "#Microsoft.Graph.ListItem"
    },
    "tenantId": "..."
  }]
}
```

To get change details, query the Graph API:
```bash
GET https://graph.microsoft.com/v1.0/{resource}/items?$filter=lastModifiedDateTime gt '{timestamp}'
```

## Secret Management

### Current Setup
Secrets are stored in Function App Application Settings, encrypted at rest but visible to users with read access.

### Recommended: Azure Key Vault Integration

1. **Enable Managed Identity**:
   ```bash
   az functionapp identity assign \
     --name webhook-functions-sharepoint-002 \
     --resource-group rg-sharepoint-webhooks
   ```

2. **Create Key Vault**:
   ```bash
   az keyvault create \
     --name your-keyvault-name \
     --resource-group rg-sharepoint-webhooks
   ```

3. **Add secrets to Key Vault**:
   ```bash
   az keyvault secret set \
     --vault-name your-keyvault-name \
     --name "AzureClientSecret" \
     --value "your-secret-value"
   ```

4. **Grant access**:
   ```bash
   az keyvault set-policy \
     --name your-keyvault-name \
     --object-id {managed-identity-id} \
     --secret-permissions get
   ```

5. **Update Function App settings**:
   ```
   AZURE_CLIENT_SECRET = @Microsoft.KeyVault(VaultName=your-keyvault;SecretName=AzureClientSecret)
   ```

## Maintenance

### Updating Secrets

1. **Without Key Vault**:
   - Azure Portal → Function App → Configuration → Application settings
   - Update the value and Save
   - Function App will restart automatically

2. **With Key Vault**:
   ```bash
   az keyvault secret set \
     --vault-name your-keyvault-name \
     --name "AzureClientSecret" \
     --value "new-secret-value"
   ```

### Renewing Subscriptions
SharePoint webhooks expire after 3 days maximum. Implement automatic renewal:

```javascript
// Add to subscription-manager.js
async function renewSubscription(accessToken, subscriptionId, context) {
    const expirationDateTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    
    await axios.patch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
        expirationDateTime: expirationDateTime
    }, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
}
```

### Monitoring

1. **Real-time logs**:
   - Azure Portal → Function App → Log stream

2. **Function metrics**:
   - Azure Portal → Function App → Functions → webhook-handler → Monitor

3. **Application Insights queries**:
   ```kusto
   traces
   | where timestamp > ago(1h)
   | where operation_Name == "webhook-handler"
   | order by timestamp desc
   ```

## Troubleshooting

### Common Issues

1. **"Missing validation token" error**
   - Normal response when accessing webhook URL directly
   - Indicates the endpoint is working

2. **No notifications received**
   - Verify subscription is active and not expired
   - Check SharePoint permissions
   - Ensure changes are being made to the monitored list

3. **401/403 errors**
   - Check App Registration permissions
   - Verify admin consent is granted
   - Confirm client ID/secret are correct

4. **Subscription creation fails**
   - Webhook URL must be publicly accessible
   - Validation must return exact token
   - Check Graph API permissions

### Debug Commands

```bash
# Test webhook endpoint
curl https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler

# Check Function App logs
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks

# List all subscriptions
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code={key}"
```

## Security Best Practices

1. **Use Key Vault** for all secrets
2. **Rotate secrets** regularly
3. **Monitor access logs** in Application Insights
4. **Implement clientState validation** in webhook handler
5. **Use HTTPS only** for all endpoints
6. **Limit Function App network access** if possible
7. **Enable Azure AD authentication** for subscription-manager

## Next Steps

1. Implement automatic subscription renewal
2. Add business logic to process specific change types
3. Set up alerts for failed notifications
4. Create a dashboard to monitor webhook health
5. Implement retry logic for failed Graph API calls

## Support

For issues or questions:
1. Check Function App logs first
2. Verify all prerequisites and permissions
3. Test with Microsoft Graph Explorer
4. Review Azure Function App diagnostics