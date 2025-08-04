# SharePoint List Webhook Viewing

## Overview

This solution now includes functionality to automatically sync all webhook subscriptions to a SharePoint list, allowing you to view and track webhook status directly in SharePoint.

## Features

### 1. Automatic Sync on Create/Delete
- When a webhook is created via `subscription-manager`, it's automatically added to the SharePoint list
- When a webhook is deleted, it's marked as "Deleted" in the SharePoint list
- Sync happens immediately, no delay

### 2. Webhook Sync Function (`webhook-sync`)
- Manual sync endpoint: `POST /api/webhook-sync`
- Syncs all current webhooks from Microsoft Graph to SharePoint
- Updates existing records and creates new ones
- Marks deleted webhooks appropriately

### 3. Scheduled Sync
- Runs every 30 minutes automatically
- Ensures SharePoint list stays up-to-date
- Handles webhooks created outside this solution

### 4. Notification Tracking
- `webhook-handler` updates notification count for each webhook
- Tracks last notification date/time
- Provides visibility into webhook activity

## SharePoint List Structure

The list at https://fambrandsllc.sharepoint.com/sites/sphookmanagement/_layouts/15/listedit.aspx?List=%7B82a105da-8206-4bd0-851b-d3f2260043f4%7D has these columns:

| Column Name | Type | Description | Notes |
|-------------|------|-------------|-------|
| Title | Single line of text | Format: "{ResourceType} - {ListName}" | Auto-generated |
| SubscriptionId | Single line of text | Unique webhook ID | **Not indexed - cannot filter** |
| Status | Choice | Active/Deleted | Values: Active, Deleted |
| ResourceType | Choice | List or Library | Values: List, Library |
| ChangeType | Single line of text | Types of changes monitored | Usually "updated" |
| NotificationUrl | Single line of text | Webhook endpoint URL | Your function URL |
| ExpirationDateTime | Date and Time | When webhook expires | Max 6 months |
| SiteUrl | Single line of text | SharePoint site URL | Full site path |
| ListId | Single line of text | SharePoint list/library ID | GUID |
| ListName | Single line of text | Display name of list/library | Human-readable name |
| AutoRenew | Yes/No | Auto-renewal flag | Currently always true |
| NotificationCount | Number | Total notifications received | Increments on each notification |

**Important**: The SubscriptionId field is not indexed in SharePoint, so all queries fetch all items and filter in memory to avoid errors.

## Configuration

The webhook management list ID is configured via environment variable:

```
WEBHOOK_LIST_ID=82a105da-8206-4bd0-851b-d3f2260043f4
```

This is the SharePoint list where all webhook information is synchronized for viewing.

## Usage

### View All Webhooks in SharePoint
1. Navigate to: https://fambrandsllc.sharepoint.com/sites/sphookmanagement
2. Open the webhook list
3. View all active and deleted webhooks

### Manual Sync
```bash
POST /api/webhook-sync
```

This will:
- Fetch all webhooks from Microsoft Graph
- Update the SharePoint list
- Return sync statistics

### Monitor Webhook Activity
- Check `NotificationCount` to see how active each webhook is
- Review `LastNotificationDateTime` to see recent activity
- Filter by `Status` to see only active webhooks

## Benefits

1. **Centralized View**: See all webhooks across your tenant in one place
2. **Activity Tracking**: Monitor which webhooks are active and receiving notifications
3. **Expiration Monitoring**: Easily see which webhooks are about to expire
4. **Historical Data**: Keep records of deleted webhooks
5. **No Code Access**: Business users can view webhook status without technical access

## Troubleshooting

### Webhooks Not Appearing in List
1. Check function logs for sync errors
2. Verify SharePoint list permissions
3. Ensure list columns match expected schema
4. Run manual sync via `/api/webhook-sync`

### Notification Count Not Updating
1. Verify webhook-handler is receiving notifications
2. Check function logs for update errors
3. Ensure SharePoint list item exists for the webhook

### Sync Failing
1. Verify Azure AD app has SharePoint permissions
2. Check SHAREPOINT_SITE_URL and WEBHOOK_LIST_ID are correct
3. Review function logs for specific error messages