# Change Detection Design for SharePoint Webhooks

## Overview

Since SharePoint webhooks only notify that something changed (not what changed), we need to implement our own change detection system. Based on API exploration, we'll use a hybrid approach combining webhook notifications with state tracking.

## Architecture

```
1. Webhook Notification Received
         ↓
2. Fetch Current Item State (Graph API)
         ↓
3. Compare with Previous State (Azure Table Storage)
         ↓
4. Calculate Changes
         ↓
5. Forward Enriched Notification
         ↓
6. Update Stored State
```

## Implementation Plan

### Phase 1: Basic Change Detection

#### 1. Azure Table Storage Setup

```javascript
// Table: SharePointItemStates
// PartitionKey: {siteId}-{listId}
// RowKey: {itemId}
// Data: JSON serialized item fields + metadata
```

#### 2. Change Detection Module

```javascript
// src/shared/change-detector.js
const { TableClient } = require("@azure/data-tables");

class ChangeDetector {
    constructor(connectionString) {
        this.tableClient = TableClient.fromConnectionString(
            connectionString, 
            "SharePointItemStates"
        );
    }

    async detectChanges(notification, currentItem) {
        const key = {
            partitionKey: `${notification.siteId}-${notification.resource}`,
            rowKey: notification.resourceData.id
        };
        
        // Get previous state
        const previousState = await this.getPreviousState(key);
        
        // Compare states
        const changes = this.compareStates(previousState, currentItem);
        
        // Save new state
        await this.saveState(key, currentItem);
        
        return changes;
    }
}
```

### Phase 2: Enhanced Payload

#### Enriched Notification Format

```json
{
  "timestamp": "2024-11-27T10:30:45.123Z",
  "source": "SharePoint-Webhook-Proxy",
  "notification": {
    // Original SharePoint notification
  },
  "itemDetails": {
    "id": "15",
    "title": "New Item Updated!!!!",
    "version": "3.0",
    "lastModified": "2025-08-04T20:55:06Z",
    "modifiedBy": {
      "id": "12",
      "email": "bburrets@fambrands.com",
      "displayName": "Bryan Burrets"
    }
  },
  "changes": {
    "detected": true,
    "fields": {
      "Title": {
        "old": "New Item Updated!!",
        "new": "New Item Updated!!!!",
        "type": "text"
      },
      "_UIVersionString": {
        "old": "2.0",
        "new": "3.0",
        "type": "version"
      }
    },
    "summary": "Title changed, version incremented"
  }
}
```

### Phase 3: Delta Query Integration

For lists with frequent changes, we can use delta query for batch processing:

```javascript
async function processDeltaChanges(listId, lastDeltaToken) {
    const deltaUrl = lastDeltaToken || 
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/delta`;
    
    const response = await graphClient.api(deltaUrl).get();
    
    // Process changes
    for (const item of response.value) {
        // Compare with stored state
        // Update notifications
    }
    
    // Store new delta token
    await storeDeltaToken(listId, response['@odata.deltaLink']);
}
```

## Configuration

### Environment Variables

```bash
# Existing
AZURE_CLIENT_ID=xxx
AZURE_CLIENT_SECRET=xxx
AZURE_TENANT_ID=xxx
WEBHOOK_LIST_ID=xxx

# New for change detection
AZURE_STORAGE_CONNECTION_STRING=xxx
ENABLE_CHANGE_DETECTION=true
CHANGE_DETECTION_FIELDS=Title,Status,Priority,AssignedTo
```

### Feature Flags

```javascript
// Per webhook configuration in clientState
clientState: "forward:https://webhook.site/xxx;detectChanges:true;fields:Title,Status"
```

## Performance Considerations

1. **Caching**: Cache frequently accessed items
2. **Batch Processing**: Process multiple notifications together
3. **Field Selection**: Only track specified fields to reduce storage
4. **Compression**: Compress stored state for large items

## Limitations

1. **No Historical Data**: Can't detect changes before system deployment
2. **Storage Costs**: Each item state stored in Azure Table Storage
3. **Processing Time**: Adds 50-200ms per notification
4. **Field Types**: Complex fields (lookups, people) need special handling

## Alternative: Simple Version Tracking

If full change detection is too complex, we can just track version changes:

```javascript
// Simpler approach - just track version
const currentVersion = currentItem.fields._UIVersionString;
const previousVersion = await getStoredVersion(itemId);

if (currentVersion !== previousVersion) {
    enrichedPayload.versionChange = {
        from: previousVersion,
        to: currentVersion,
        changed: true
    };
}
```

## Next Steps

1. Create Azure Table Storage account
2. Implement basic change detector
3. Update webhook-handler to use change detection
4. Test with real SharePoint changes
5. Monitor performance and costs