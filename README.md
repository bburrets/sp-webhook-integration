# SharePoint Webhook Solution

A production-ready Azure Functions solution for monitoring SharePoint list changes in real-time using Microsoft Graph webhooks, with built-in proxy forwarding and centralized management.

## 🚀 Key Features

- **Real-time Change Monitoring**: Instant notifications when SharePoint lists are modified
- **Webhook Proxy**: Forward notifications to external services without validation requirements
- **Centralized Management**: All webhooks tracked in a SharePoint management list
- **Auto-sync**: Timer function keeps webhook status synchronized every 30 minutes
- **Complete Visibility**: Track notification counts, forwarding URLs, and statistics
- **Production Ready**: Proper error handling, logging, and Azure Functions v4 compatibility

## 📋 Prerequisites

- Azure subscription with Function App (Node.js 18+)
- SharePoint Online site with appropriate permissions
- Azure AD App Registration with Microsoft Graph permissions:
  - `Sites.Read.All` or `Sites.ReadWrite.All` (Application permissions)
  - Admin consent granted

## 🏗️ Architecture

```
SharePoint Lists → Microsoft Graph → Webhook Handler → Proxy Forwarding → External Services
                                           ↑
                                    Subscription Manager
                                           ↓
                                 SharePoint Management List
```

## ⚙️ Environment Variables

Configure these in your Azure Function App:

```bash
AZURE_CLIENT_ID=<your-app-registration-client-id>
AZURE_CLIENT_SECRET=<your-app-registration-secret>
AZURE_TENANT_ID=<your-azure-tenant-id>
WEBHOOK_LIST_ID=82a105da-8206-4bd0-851b-d3f2260043f4  # Your management list ID
```

## 📊 SharePoint Management List Setup

Create a SharePoint list with these columns:

| Column Name | Type | Required | Description |
|-------------|------|----------|-------------|
| Title | Single line of text | Yes | Auto-generated: "{ResourceType} - {ListName}" |
| SubscriptionId | Single line of text | Yes | Unique webhook subscription ID |
| Status | Choice (Active, Deleted) | Yes | Current webhook status |
| ChangeType | Single line of text | Yes | SharePoint change types (e.g., "updated") |
| NotificationUrl | Single line of text | Yes | Webhook endpoint URL |
| ExpirationDateTime | Date and Time | Yes | When webhook expires |
| NotificationCount | Number | Yes | Total notifications received |
| ClientState | Single line of text | No | Contains proxy configuration |
| ForwardingUrl | Single line of text | No | External service URL for forwarding |
| IsProxy | Choice (Yes, No) | No | Whether webhook forwards notifications |
| LastForwardedDateTime | Date and Time | No | Last successful forward timestamp |

Additional columns for tracking:
- SiteUrl, ListId, ListName, ResourceType, AutoRenew

## 🔧 Core Functions

### 1. **webhook-handler**
- Receives SharePoint change notifications
- Validates requests from Microsoft Graph
- Forwards notifications based on clientState
- Updates notification counts and statistics

### 2. **subscription-manager**  
- REST API for webhook CRUD operations
- Automatically syncs webhooks to SharePoint
- Handles Graph API authentication

### 3. **webhook-sync**
- Timer-triggered (every 30 minutes)
- Synchronizes all webhooks with SharePoint list
- Marks deleted webhooks appropriately

### 4. **check-list-columns** (Admin Tool)
- Utility to inspect SharePoint list structure
- Useful for debugging field issues

## 📡 API Usage

### Create a Standard Webhook
```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/<site-path>/lists/<list-id>",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler"
  }'
```

### Create a Proxy Webhook (with Forwarding)
```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/<site-path>/lists/<list-id>",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "forward:https://your-service.com/webhook"
  }'
```

### List All Webhooks
```bash
curl "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<key>"
```

### Delete a Webhook
```bash
curl -X DELETE "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<key>&subscriptionId=<id>"
```

## 🔍 How Proxy Forwarding Works

1. Create webhook with `clientState` starting with `forward:`
2. SharePoint sends notification to your webhook-handler
3. Handler validates and enriches the notification
4. Forwards to the URL specified after `forward:`
5. Updates SharePoint list with forwarding statistics

### Forwarded Payload Structure
```json
{
  "timestamp": "2024-11-27T10:30:45.123Z",
  "source": "SharePoint-Webhook-Proxy",
  "notification": {
    // Original SharePoint notification
  },
  "metadata": {
    "processedBy": "webhook-functions-sharepoint-002",
    "environment": "production"
  }
}
```

## 🐛 Troubleshooting

### View Real-time Logs
```bash
az webapp log tail --name <function-app> --resource-group <rg-name>
```

### Common Issues

1. **Authentication Errors**
   - Verify App Registration permissions
   - Check client secret hasn't expired
   - Ensure admin consent is granted

2. **Webhook Creation Fails**
   - Confirm notification URL is publicly accessible
   - Check SharePoint site permissions
   - Verify resource path format

3. **Notifications Not Updating Count**
   - Check webhook-handler logs for errors
   - Verify SharePoint list permissions
   - Ensure WEBHOOK_LIST_ID is correct

4. **Proxy Forwarding Not Working**
   - Check target URL is accessible
   - Look for 429 (rate limit) errors
   - Verify clientState format

## 🔒 Security Best Practices

1. **Use Azure Key Vault** for storing secrets
2. **Enable Managed Identity** for Function App
3. **Implement IP restrictions** where possible
4. **Regular secret rotation** (every 90 days)
5. **Monitor with Application Insights**
6. **Use function-level authentication** for all endpoints

## 📈 Monitoring

### Application Insights Queries

```kusto
// Recent webhook notifications
traces
| where operation_Name == "webhook-handler"
| where message contains "Processing notification"
| order by timestamp desc
| take 100

// Forwarding statistics
traces
| where message contains "Successfully forwarded"
| summarize count() by bin(timestamp, 1h)
```

## 🚧 Limitations & Solutions

### SharePoint Webhook Limitations:
- Webhook subscriptions expire after maximum 180 days
- SharePoint only supports "updated" changeType
- **Notifications don't include item IDs or change details**
- Rate limits apply to Graph API calls

### Change Detection Solution:
Since SharePoint doesn't tell us which item changed, we use **Delta Query**:
1. When webhook fires, query for all recent changes
2. Filter to items modified in last 5 minutes
3. Compare with stored states to detect field changes
4. Forward enriched notifications with actual change details

Enable with: `clientState: "forward:https://your-url;detectChanges:true"`

## 🛠️ Development

### Project Structure
```
sharepoint-webhooks/
├── src/
│   ├── functions/          # Azure Functions
│   │   ├── webhook-handler.js
│   │   ├── subscription-manager.js
│   │   ├── webhook-sync.js
│   │   └── check-list-columns.js
│   └── shared/            # Shared modules
│       ├── auth.js       # Authentication
│       ├── graph-api.js  # Graph API operations
│       └── sharepoint.js # SharePoint helpers
├── host.json             # Function app config
├── local.settings.json   # Local development config
└── package.json          # Dependencies
```

### Local Development
```bash
# Install dependencies
npm install

# Set up local.settings.json with your credentials
cp local.settings.json.example local.settings.json

# Run locally
func start
```

## 📄 License

This solution is provided as-is for SharePoint webhook management.

---

For detailed implementation notes and current state, see [CURRENT_STATE.md](CURRENT_STATE.md).
For proxy forwarding specifics, see [WEBHOOK_PROXY_GUIDE.md](WEBHOOK_PROXY_GUIDE.md).