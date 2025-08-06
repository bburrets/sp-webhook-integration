# Complete Webhook Setup Guide

This guide walks through the complete process of setting up SharePoint webhooks with enhanced change detection.

## Prerequisites

- Azure Function App deployed and running
- SharePoint site with appropriate permissions
- Azure Storage Account configured (for enhanced modes)
- Function key for API authentication

## Setup Process

### Step 1: Choose Your Webhook Mode

#### Simple Forwarding
Just forwards notifications without fetching data:
```
clientState: "forward:https://your-endpoint.com/webhook"
```

#### With Current Data
Includes the current state of the changed item:
```
clientState: "forward:https://your-endpoint.com/webhook;mode:withData"
```

#### With Change Detection (Recommended)
Includes current state, previous state, and what specifically changed:
```
clientState: "forward:https://your-endpoint.com/webhook;mode:withChanges"
```

### Step 2: Create the Webhook

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/<tenant>.sharepoint.com:/sites/<site>:/lists/<listId>",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "forward:https://your-endpoint.com/webhook;mode:withChanges"
  }'
```

**Response:**
```json
{
  "id": "16fb8419-87f8-4046-af0b-42def1c0ec0c",
  "resource": "sites/tenant.sharepoint.com:/sites/mysite:/lists/listId",
  "changeType": "updated",
  "clientState": "forward:https://your-endpoint.com/webhook;mode:withChanges",
  "notificationUrl": "https://function-app.azurewebsites.net/api/webhook-handler",
  "expirationDateTime": "2025-08-09T04:40:17.081Z"
}
```

### Step 3: Initialize Item States (For Enhanced Mode)

**Important**: This step prevents empty change notifications on the first modification of existing items.

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/initialize-item-states?code=<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/<tenant>.sharepoint.com:/sites/<site>:/lists/<listId>"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Initialized states for 84 items out of 89 total",
  "resource": "sites/tenant.sharepoint.com:/sites/mysite:/lists/listId"
}
```

### Step 4: Verify Webhook is Active

```bash
curl "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<key>"
```

Look for your webhook in the response to confirm it's active.

## What Happens Next

### First Notification (Without Initialization)
If you skip Step 3, the first change to any item will show:
```json
{
  "changes": {
    "summary": {
      "addedFields": 0,
      "modifiedFields": 0,
      "removedFields": 0,
      "isFirstTimeTracking": true
    },
    "message": "This is the first time tracking this item. Future notifications will show specific changes."
  },
  "previousState": null
}
```

### Subsequent Notifications (Or After Initialization)
You'll see actual changes:
```json
{
  "changes": {
    "summary": {
      "addedFields": 0,
      "modifiedFields": 2,
      "removedFields": 0,
      "isFirstTimeTracking": false
    },
    "details": {
      "modified": {
        "Status": {
          "old": "Pending",
          "new": "Approved"
        },
        "Modified": {
          "old": "2025-08-05T16:30:00Z",
          "new": "2025-08-05T17:40:54Z"
        }
      }
    }
  }
}
```

## Best Practices

1. **Always Initialize**: Run `initialize-item-states` when setting up webhooks on existing lists
2. **Use withChanges Mode**: Provides the most context for your automations
3. **Handle First-Time Gracefully**: Check for `isFirstTimeTracking` in your endpoint
4. **Monitor Expiration**: Webhooks expire after 180 days maximum
5. **Test First**: Use webhook.site to test before pointing to production endpoints

## Troubleshooting

### Empty Changes on First Notification
- **Cause**: No previous state exists for comparison
- **Solution**: Run `initialize-item-states` after creating the webhook

### No Notifications Received
- Check webhook is active: `GET /api/subscription-manager`
- Verify SharePoint permissions
- Check Azure Function logs for errors

### Webhook Creation Fails
- Ensure notification URL is publicly accessible
- Verify resource path format is correct
- Check SharePoint site permissions

## Complete Example

```bash
# 1. Get a test endpoint
# Visit https://webhook.site to get a unique URL

# 2. Create webhook with change detection
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/DWI:/lists/9e35f709-48be-4995-8b28-79730ad12b89",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "forward:https://webhook.site/your-unique-id;mode:withChanges"
  }'

# 3. Initialize existing items
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/initialize-item-states?code=<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/DWI:/lists/9e35f709-48be-4995-8b28-79730ad12b89"
  }'

# 4. Make a change in SharePoint and watch the notifications arrive!
```

## Security Considerations

1. **Rotate Function Keys**: Regularly rotate your function keys
2. **Use HTTPS**: Always use HTTPS endpoints for forwarding
3. **Validate Payloads**: Implement validation on your receiving endpoints
4. **Monitor Access**: Use Application Insights to monitor webhook usage
5. **Implement Rate Limiting**: Protect your endpoints from notification floods