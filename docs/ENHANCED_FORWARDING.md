# Enhanced Webhook Forwarding

## Overview

The SharePoint webhook solution now supports enhanced forwarding modes that can include the actual data and change details, not just the notification that something changed.

## ClientState Format

The `clientState` parameter now supports multiple options separated by semicolons:

```
forward:<url>;mode:<mode>;includeFields:<fields>;excludeFields:<fields>
```

### Parameters

- **forward**: (Required) The URL to forward notifications to
- **mode**: (Optional) The forwarding mode - `simple`, `withData`, or `withChanges`
- **includeFields**: (Optional) Comma-separated list of fields to include
- **excludeFields**: (Optional) Comma-separated list of fields to exclude

## Forwarding Modes

### 1. Simple Mode (Default)
```
clientState: "forward:https://webhook.site/your-url"
```

Forwards just the basic notification:
```json
{
  "timestamp": "2025-08-05T17:50:00Z",
  "source": "SharePoint-Webhook-Proxy",
  "notification": {
    "subscriptionId": "...",
    "resource": "...",
    "changeType": "updated"
  },
  "metadata": {
    "processedBy": "webhook-handler",
    "forwardingMode": "simple"
  }
}
```

### 2. With Data Mode
```
clientState: "forward:https://webhook.site/your-url;mode:withData"
```

Includes the current state of the changed item:
```json
{
  "timestamp": "2025-08-05T17:50:00Z",
  "source": "SharePoint-Webhook-Proxy-Enhanced",
  "notification": { ... },
  "metadata": {
    "processedBy": "webhook-handler",
    "forwardingMode": "withData"
  },
  "currentState": {
    "id": "295",
    "lastModified": "2025-08-05T17:40:54Z",
    "webUrl": "https://sharepoint.com/...",
    "fields": {
      "PO_x0023_": "1740708300",
      "Order0": "5962265",
      "Status": "Approved for Routing",
      // ... all other fields
    }
  }
}
```

### 3. With Changes Mode
```
clientState: "forward:https://webhook.site/your-url;mode:withChanges"
```

Includes current state, previous state, and what changed:
```json
{
  "timestamp": "2025-08-05T17:50:00Z",
  "source": "SharePoint-Webhook-Proxy-Enhanced",
  "notification": { ... },
  "metadata": {
    "processedBy": "webhook-handler",
    "forwardingMode": "withChanges"
  },
  "currentState": {
    "id": "295",
    "lastModified": "2025-08-05T17:40:54Z",
    "webUrl": "https://sharepoint.com/...",
    "fields": { ... }
  },
  "changes": {
    "summary": {
      "addedFields": 0,
      "modifiedFields": 2,
      "removedFields": 0
    },
    "details": {
      "added": {},
      "modified": {
        "Status": {
          "old": "Pending",
          "new": "Approved for Routing"
        },
        "Modified": {
          "old": "2025-08-05T16:30:00Z",
          "new": "2025-08-05T17:40:54Z"
        }
      },
      "removed": {}
    }
  },
  "previousState": {
    "lastModified": "2025-08-05T16:30:00Z",
    "fields": { ... }
  }
}
```

## Field Filtering

### Include Only Specific Fields
```
clientState: "forward:https://webhook.site/your-url;mode:withData;includeFields:PO_x0023_,Status,ShipDate"
```

Only includes the specified fields in the response.

### Exclude Sensitive Fields
```
clientState: "forward:https://webhook.site/your-url;mode:withData;excludeFields:AuthorLookupId,EditorLookupId,_ComplianceTag"
```

Excludes the specified fields from the response.

## Examples

### Example 1: Track Status Changes Only
```
clientState: "forward:https://myapp.com/webhook;mode:withChanges;includeFields:Status,Modified,id"
```

### Example 2: Full Data Without System Fields
```
clientState: "forward:https://myapp.com/webhook;mode:withData;excludeFields:_UIVersionString,_ComplianceFlags,AuthorLookupId,EditorLookupId"
```

### Example 3: Detect Any Changes with Full Context
```
clientState: "forward:https://myapp.com/webhook;mode:withChanges"
```

## Implementation Notes

1. **Performance**: `withChanges` mode requires storing previous states in Azure Table Storage
2. **First Run**: The first notification in `withChanges` mode won't have previous state
3. **Rate Limits**: Enhanced modes make additional Graph API calls - be mindful of limits
4. **Storage**: Previous states are stored for 30 days by default

## Setting Up Enhanced Webhooks

```bash
# Create webhook with enhanced forwarding
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/mysite:/lists/<listId>",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "forward:https://myapp.com/webhook;mode:withChanges;includeFields:Status,Priority"
  }'
```

## Benefits

1. **No Additional Calls**: Your endpoint receives all data in one payload
2. **Change Tracking**: Know exactly what changed, not just that something changed
3. **Field Control**: Include only the fields you need
4. **Performance**: Reduces the need for follow-up API calls
5. **Flexibility**: Choose the right mode for your use case

## Limitations

1. SharePoint doesn't provide item IDs in notifications, so we fetch the most recent change
2. If multiple items change simultaneously, you might not get all changes
3. Requires Azure Table Storage for `withChanges` mode
4. Additional Graph API calls may impact rate limits