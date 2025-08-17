# Enhanced SharePoint Webhook Features - Detailed Explanation

This document provides an in-depth explanation of the enhanced features available in the SharePoint webhook solution.

## 1. Enhanced Forwarding Modes

### Simple Mode (Default)
**What it does**: Forwards just the basic notification that something changed.

**Use case**: When you only need to know that a change occurred and plan to fetch details yourself.

**Example clientState**: 
```
"forward:https://your-app.com/webhook"
```

**What you receive**:
```json
{
  "timestamp": "2025-08-05T18:30:00Z",
  "source": "SharePoint-Webhook-Proxy",
  "notification": {
    "subscriptionId": "abc-123",
    "resource": "sites/.../lists/123",
    "changeType": "updated"
  }
}
```

### WithData Mode
**What it does**: Includes the current state of the changed item with all its field values.

**Use case**: When you need to see the current data without making another API call.

**Example clientState**: 
```
"forward:https://your-app.com/webhook;mode:withData"
```

**What you receive**:
```json
{
  "timestamp": "2025-08-05T18:30:00Z",
  "notification": { ... },
  "currentState": {
    "id": "295",
    "lastModified": "2025-08-05T17:40:54Z",
    "fields": {
      "Title": "Project Alpha",
      "Status": "Approved",
      "Priority": "High",
      "DueDate": "2025-09-01",
      // ... all other fields
    }
  }
}
```

### WithChanges Mode
**What it does**: Includes current state, previous state, and exactly what changed.

**Use case**: When you need to know specifically which fields were modified and their before/after values.

**Example clientState**: 
```
"forward:https://your-app.com/webhook;mode:withChanges"
```

**What you receive**:
```json
{
  "timestamp": "2025-08-05T18:30:00Z",
  "notification": { ... },
  "currentState": { ... },
  "changes": {
    "summary": {
      "addedFields": 0,
      "modifiedFields": 2,
      "removedFields": 0
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
  },
  "previousState": { ... }
}
```

## 2. Field Filtering

### Include Fields
**What it does**: Only includes specified fields in the forwarded data.

**Use case**: When you only care about specific fields and want to reduce payload size.

**Example clientState**: 
```
"forward:https://your-app.com/webhook;mode:withData;includeFields:Title,Status,Priority,DueDate"
```

**Result**: Only these 4 fields appear in the `fields` object, all others are filtered out.

### Exclude Fields
**What it does**: Removes specified fields from the forwarded data.

**Use case**: When you want most fields but need to exclude sensitive or system fields.

**Example clientState**: 
```
"forward:https://your-app.com/webhook;mode:withData;excludeFields:AuthorLookupId,EditorLookupId,_ComplianceTag,_UIVersionString"
```

**Result**: All fields except the excluded ones are included.

### Combining Filters
- If both include and exclude are specified, include is applied first
- System fields like `id`, `lastModified` are always included in the state metadata

## 3. Change Detection and Comparison

### How it works:
1. **Fetch Current State**: When notification arrives, fetch the current item data
2. **Retrieve Previous State**: Get the last known state from Azure Table Storage
3. **Compare Fields**: Deep comparison of all field values
4. **Categorize Changes**:
   - **Added**: Fields that exist now but didn't before
   - **Modified**: Fields that exist in both but have different values
   - **Removed**: Fields that existed before but don't now

### Example Change Detection:
```javascript
// Previous state
{
  "Title": "Project Alpha",
  "Status": "Pending",
  "Priority": "Medium",
  "AssignedTo": "John"
}

// Current state
{
  "Title": "Project Alpha",
  "Status": "Approved",
  "Priority": "High",
  "DueDate": "2025-09-01"
}

// Detected changes
{
  "added": {
    "DueDate": "2025-09-01"
  },
  "modified": {
    "Status": { "old": "Pending", "new": "Approved" },
    "Priority": { "old": "Medium", "new": "High" }
  },
  "removed": {
    "AssignedTo": "John"
  }
}
```

## 4. Previous State Storage

### Storage Mechanism:
**Azure Table Storage** is used to store previous states for comparison.

### Table Structure:
- **Table Name**: `SharePointItemStates`
- **Partition Key**: Resource path (with special chars replaced)
- **Row Key**: `item_{itemId}`
- **Data**: JSON serialized previous state

### Storage Process:
1. **After Comparison**: Current state is stored for next time
2. **Retention**: States are kept for 30 days (configurable)
3. **Update Strategy**: "Replace" - always overwrites previous state

### Example Storage Entry:
```json
{
  "partitionKey": "sites_fambrandsllc_sharepoint_com__sites_DWI__lists_123",
  "rowKey": "item_295",
  "resource": "sites/fambrandsllc.sharepoint.com:/sites/DWI:/lists/123",
  "itemId": "295",
  "lastModified": "2025-08-05T17:40:54Z",
  "previousState": "{\"id\":\"295\",\"fields\":{...}}",
  "timestamp": "2025-08-05T17:41:00Z"
}
```

### Benefits:
- **No API calls** to get previous state
- **Fast comparison** - data is already available
- **Reliable history** - survives function restarts
- **Scalable** - Azure Table Storage handles millions of records

### Limitations:
- **First notification** won't have previous state
- **Storage costs** for high-volume lists
- **30-day retention** - older changes aren't tracked

## Practical Examples

### Example 1: Track Status Changes Only
Monitor when items move through a workflow:
```
clientState: "forward:https://myapp.com/status-changes;mode:withChanges;includeFields:Title,Status,Modified,ModifiedBy"
```

### Example 2: Audit Trail
Track all changes except system fields:
```
clientState: "forward:https://myapp.com/audit;mode:withChanges;excludeFields:_UIVersionString,_ComplianceFlags,Attachments"
```

### Example 3: Data Sync
Get full current state for syncing to another system:
```
clientState: "forward:https://myapp.com/sync;mode:withData"
```

### Example 4: Notification Only
Just know something changed, handle details internally:
```
clientState: "forward:https://myapp.com/notify"
```

## Performance Considerations

1. **Simple Mode**: Fastest, no additional API calls
2. **WithData Mode**: One additional API call to fetch current state
3. **WithChanges Mode**: One API call + Table Storage read/write

## Error Handling

- If current state can't be fetched, falls back to simple mode
- If previous state doesn't exist, still provides current state
- Failed forwards are logged but don't block notification processing
- Table Storage failures are logged but don't stop forwarding

These features combine to give you complete visibility into SharePoint list changes without requiring multiple API calls or complex client-side logic.