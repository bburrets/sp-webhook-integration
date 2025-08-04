# SharePoint Webhook Solution

## Overview

A comprehensive Azure Functions-based solution for monitoring SharePoint list changes in real-time using Microsoft Graph webhooks. The solution includes automatic synchronization to a SharePoint management list for centralized webhook tracking and monitoring.

## Key Features

- **Real-time Change Monitoring**: Receive instant notifications when SharePoint lists are modified
- **Webhook Management**: Create, list, and delete webhook subscriptions via REST API
- **SharePoint List Integration**: Automatically sync all webhooks to a SharePoint list for easy viewing
- **Notification Tracking**: Count and track all notifications received by each webhook
- **Support for Lists and Document Libraries**: Monitor changes in both SharePoint Lists and Document Libraries
- **Automatic Sync**: Timer-triggered function syncs webhooks every 30 minutes

## Architecture

```
SharePoint Lists/Libraries → Microsoft Graph → Webhook Handler → Business Logic
                                                     ↑
                                              Subscription Manager
                                                     ↓
                                          SharePoint Management List
```

## Functions

### 1. webhook-handler
- Receives and processes SharePoint change notifications
- Updates notification count in SharePoint management list
- Validates webhook requests from Microsoft Graph

### 2. subscription-manager
- REST API for webhook management (GET, POST, DELETE)
- Automatically syncs created/deleted webhooks to SharePoint
- Handles webhook validation for Microsoft Graph

### 3. webhook-sync
- Manual sync endpoint to update SharePoint management list
- Fetches all webhooks and updates their status
- Marks deleted webhooks appropriately

### 4. webhook-sync-timer
- Runs every 30 minutes automatically
- Keeps SharePoint list in sync with actual webhooks

## Prerequisites

- Azure subscription
- SharePoint Online site with appropriate permissions
- Azure AD App Registration with Microsoft Graph permissions:
  - `Sites.Read.All` or `Sites.ReadWrite.All`
  - Admin consent granted

## Deployment

### Azure Resources Required
- **Function App**: Node.js 18+ on Windows/Linux
- **Storage Account**: For Function App state
- **Application Insights**: For monitoring (optional but recommended)

### Environment Variables
Configure these in your Function App:

```bash
AZURE_CLIENT_ID=<your-app-registration-client-id>
AZURE_CLIENT_SECRET=<your-app-registration-secret>
AZURE_TENANT_ID=<your-azure-tenant-id>
WEBHOOK_LIST_ID=<sharepoint-management-list-id>  # Default: 82a105da-8206-4bd0-851b-d3f2260043f4
```

### SharePoint Management List
Create a SharePoint list with these columns:

| Column Name | Type | Required | Description |
|-------------|------|----------|-------------|
| Title | Single line of text | Yes | Format: "{ResourceType} - {ListName}" |
| SubscriptionId | Single line of text | Yes | Unique webhook ID |
| Status | Choice | Yes | Values: Active, Deleted |
| ResourceType | Choice | Yes | Values: List, Library |
| ChangeType | Single line of text | Yes | Change types monitored |
| NotificationUrl | Single line of text | Yes | Webhook endpoint URL |
| ExpirationDateTime | Date and Time | Yes | Webhook expiration |
| SiteUrl | Single line of text | Yes | SharePoint site URL |
| ListId | Single line of text | Yes | SharePoint list/library ID |
| ListName | Single line of text | Yes | Display name of list/library |
| AutoRenew | Yes/No | Yes | Auto-renewal flag |
| NotificationCount | Number | Yes | Total notifications received |

## Usage

### Create a Webhook Subscription

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<function-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/<site-id>/lists/<list-id>",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "expirationDateTime": "2025-08-02T09:00:00Z"
  }'
```

### List All Subscriptions

```bash
curl "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<function-key>"
```

### Delete a Subscription

```bash
curl -X DELETE "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<function-key>&subscriptionId=<subscription-id>"
```

### Manual Sync to SharePoint

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/webhook-sync?code=<function-key>"
```

## Recent Updates

### Fixed Issues
1. **SharePoint Field Indexing**: Resolved HTTP 500 errors when filtering by non-indexed SubscriptionId field
2. **Variable Scoping**: Fixed resourceType variable scope in webhook-sync function
3. **Notification Processing**: Fixed webhook-handler to properly update notification counts

### Implementation Details
- All SharePoint queries now fetch items without filtering and perform filtering in memory
- Supports both SharePoint Lists (genericList) and Document Libraries (documentLibrary)
- Proper error handling and logging throughout

## Monitoring

### View Logs
```bash
# Real-time logs
func azure functionapp logstream <function-app-name>

# Or use Azure Portal
Azure Portal → Function App → Log stream
```

### Application Insights Queries
```kusto
// View all webhook notifications
traces
| where operation_Name == "webhook-handler"
| where message contains "Processing notification"
| order by timestamp desc

// Check sync operations
traces
| where operation_Name == "webhook-sync"
| order by timestamp desc
```

## Troubleshooting

### Common Issues

1. **HTTP 500 on Deletion**
   - Fixed: Now fetches all items and filters in memory instead of using SharePoint filtering

2. **Notifications Not Updating Count**
   - Fixed: webhook-handler now properly finds and updates SharePoint items

3. **"Field cannot be referenced in filter" Error**
   - Fixed: Removed all SharePoint field filtering, using in-memory filtering instead

4. **No Notifications Received**
   - Verify webhook subscription is active
   - Check SharePoint permissions
   - Ensure notification URL is publicly accessible

### Debug Functions
The solution includes several debug utilities in the `test/debug-utils/` directory for troubleshooting.

## Security Recommendations

1. **Use Azure Key Vault** for storing client secrets
2. **Enable Managed Identity** for the Function App
3. **Implement IP restrictions** if webhook endpoints don't need public access
4. **Regular secret rotation** for client credentials
5. **Monitor access logs** in Application Insights

## Limitations

- SharePoint webhook subscriptions expire after maximum 6 months
- Notifications don't include change details (requires separate API call)
- Document Library webhooks may have slight delays compared to Lists

## Contributing

When making changes:
1. Test webhook creation, deletion, and sync operations
2. Verify SharePoint list updates correctly
3. Check notification processing and count updates
4. Update documentation for any new features

## License

This solution is provided as-is for SharePoint webhook management.