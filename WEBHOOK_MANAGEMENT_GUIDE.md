# SharePoint Webhook Management System

## Overview

This solution uses a SharePoint list as the central management system for all webhook subscriptions. The list serves as both a registry and control panel for webhook operations.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 SharePoint Management List                   │
│  (Webhook configurations, status, destinations, renewals)    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Azure Functions                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Subscription     │  │ Webhook      │  │ Management    │  │
│  │ Manager         │  │ Handler      │  │ Functions     │  │
│  └─────────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               Microsoft Graph API & Destinations             │
└─────────────────────────────────────────────────────────────┘
```

## Management List Setup

### 1. Create the SharePoint List

In your sphookmanagement site, create a list with these columns:

| Column Name | Type | Required | Description |
|------------|------|----------|-------------|
| Title | Single line | Yes | Friendly webhook name |
| SubscriptionId | Single line | Yes | Graph API subscription ID |
| SiteUrl | Hyperlink | No | Link to monitored site |
| ListId | Single line | Yes | GUID of monitored list |
| ListName | Single line | No | Display name of list |
| ChangeType | Choice | Yes | updated, created, deleted, all |
| DestinationUrl | Hyperlink | No | Where to forward notifications |
| Status | Choice | Yes | Active, Expired, Error, Pending |
| ExpirationDateTime | Date/Time | Yes | When subscription expires |
| LastNotification | Date/Time | No | Last change detected |
| NotificationCount | Number | No | Total notifications |
| CreatedBy | Person | No | Who created it |
| CreatedDate | Date/Time | No | When created |
| LastError | Multiple lines | No | Error details |
| AutoRenew | Yes/No | Yes | Auto-renew flag |
| NotificationUrl | Hyperlink | Yes | Webhook endpoint URL |

### 2. Update Function Constants

In the new functions, update these constants with your list details:

```javascript
const MANAGEMENT_SITE_ID = 'your-site-id';
const MANAGEMENT_LIST_ID = '82a105da-8206-4bd0-851b-d3f2260043f4';
```

## New Functions

### 1. webhook-sync
Synchronizes Graph API subscriptions with the management list.

**Endpoint**: `/api/webhook-sync`
**Methods**: GET, POST
**Auth**: Function key required

**What it does:**
- Fetches all subscriptions from Graph API
- Compares with management list
- Creates new entries for untracked subscriptions
- Updates status for existing entries
- Marks expired subscriptions

**Usage:**
```bash
curl -X POST "https://your-app.azurewebsites.net/api/webhook-sync?code={key}"
```

### 2. webhook-renewal
Automatically renews subscriptions before they expire.

**Timer**: Runs every 12 hours
**Manual Endpoint**: `/api/webhook-renewal-manual`

**What it does:**
- Checks for subscriptions expiring within 12 hours
- Only renews if AutoRenew = Yes
- Updates expiration dates in management list
- Logs any renewal failures

**Manual renewal:**
```bash
# Renew all eligible
curl -X POST "https://your-app.azurewebsites.net/api/webhook-renewal-manual?code={key}"

# Renew specific subscription
curl -X POST "https://your-app.azurewebsites.net/api/webhook-renewal-manual?code={key}&subscriptionId={id}"
```

## Deployment Steps

1. **Create the Management List** in SharePoint with all columns

2. **Deploy New Functions**:
   ```bash
   # Add new functions to project
   # Update MANAGEMENT_SITE_ID and MANAGEMENT_LIST_ID in files
   func azure functionapp publish webhook-functions-sharepoint-002
   ```

3. **Initial Sync**:
   ```bash
   # Populate management list with existing subscriptions
   curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code={key}"
   ```

4. **Test Renewal**:
   ```bash
   # Test manual renewal
   curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-renewal-manual?code={key}"
   ```

## Usage Workflows

### Creating a New Webhook

1. **Option A: Through Management List**
   - Add item to management list
   - Run sync function to create subscription

2. **Option B: Through API**
   - Create subscription via API
   - Run sync to update list

### Monitoring Webhooks

1. **View in SharePoint**
   - Open management list
   - Filter by Status = Active
   - Sort by ExpirationDateTime

2. **Check Expiring Soon**
   - Create view: ExpirationDateTime < [Today]+1
   - Enable alerts on this view

3. **Error Tracking**
   - Filter by Status = Error
   - Check LastError column

### Managing Renewals

1. **Enable Auto-Renewal**
   - Set AutoRenew = Yes in list
   - Timer function handles renewals

2. **Manual Renewal**
   - Call renewal endpoint
   - Or update ExpirationDateTime manually

## Integration with Enhanced Features

The management list works seamlessly with destination URLs:

1. **DestinationUrl** column stores forwarding endpoints
2. **Sync function** extracts destinations from clientState
3. **Updates** automatically reflect in management list

## Monitoring and Alerts

### SharePoint Alerts
Set up alerts on the management list for:
- Items where Status changes to "Error"
- Items where ExpirationDateTime is approaching
- New items created (new webhooks)

### Power Automate Flows
Create flows triggered by list changes:
- Send email when webhook expires
- Create tickets for errors
- Notify teams of new subscriptions

### Dashboard
Create a SharePoint page with:
- List view of active webhooks
- Chart of notifications by list
- Upcoming expirations
- Error summary

## Best Practices

1. **Regular Syncs**
   - Schedule sync function every hour
   - Ensures list stays current

2. **Proactive Renewals**
   - Enable AutoRenew for critical webhooks
   - Monitor renewal logs

3. **Error Handling**
   - Check LastError regularly
   - Set up alerts for failures

4. **Documentation**
   - Use Title field for descriptions
   - Document destination URLs

5. **Access Control**
   - Limit who can modify the list
   - Use SharePoint permissions

## Troubleshooting

### Subscription Not in List?
Run sync function: `/api/webhook-sync`

### Renewal Failing?
1. Check Graph API permissions
2. Verify subscription still exists
3. Check LastError in list

### Notifications Not Forwarding?
1. Verify DestinationUrl is correct
2. Check webhook-handler logs
3. Ensure destination is accessible

## Future Enhancements

1. **PowerBI Integration**
   - Connect to list for analytics
   - Track notification volumes
   - Monitor reliability

2. **Approval Workflow**
   - Require approval for new webhooks
   - Validate destination URLs

3. **Bulk Operations**
   - Bulk renewal interface
   - Mass update capabilities

4. **Health Checks**
   - Periodic destination validation
   - Automatic error recovery

This management system provides complete visibility and control over your SharePoint webhook infrastructure!