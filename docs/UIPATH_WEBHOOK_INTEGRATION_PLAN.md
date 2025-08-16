# UiPath Orchestrator Integration with SharePoint Webhooks

## Overview

This plan outlines the development of a new Azure Function that processes SharePoint webhook notifications and sends structured payloads to UiPath Orchestrator queues. The system will support configurable webhook-to-function mappings, allowing different SharePoint lists to trigger specific UiPath processes with custom payload structures.

## Architecture Design

```
SharePoint List Change
    ↓
SharePoint Webhook Notification
    ↓
webhook-handler (existing)
    ↓
uipath-dispatcher (NEW)
    ↓
UiPath Orchestrator Queue
```

## Core Components

### 1. Enhanced Webhook Configuration

Extend the clientState to include function mappings and parameters:

```javascript
// Example clientState configuration
{
  "forward": "https://webhook.site/debug",
  "processor": "uipath",
  "config": {
    "queueName": "SharePointChanges",
    "mappingTemplate": "costcoTrafficking",
    "includeChanges": true,
    "customFields": {
      "processType": "COSTCO_INLINE",
      "priority": "High"
    }
  }
}
```

### 2. New Function: uipath-dispatcher

```javascript
// src/functions/uipath-dispatcher.js
const { app } = require('@azure/functions');
const UiPathProcessor = require('../shared/uipath-processor');

app.http('uipath-dispatcher', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        const processor = new UiPathProcessor(context);
        const result = await processor.processWebhookNotification(request);
        return { status: 200, body: result };
    }
});
```

### 3. UiPath Processor Class

```javascript
// src/shared/uipath-processor.js
class UiPathProcessor {
    constructor(context) {
        this.context = context;
        this.orchestratorUrl = process.env.UIPATH_ORCHESTRATOR_URL;
        this.tenantName = process.env.UIPATH_TENANT_NAME;
        this.clientId = process.env.UIPATH_CLIENT_ID;
        this.clientSecret = process.env.UIPATH_CLIENT_SECRET;
    }

    async processWebhookNotification(request) {
        // 1. Parse webhook notification
        const notification = await request.json();
        
        // 2. Get configuration from notification
        const config = this.extractConfiguration(notification);
        
        // 3. Fetch item details and changes
        const itemData = await this.fetchItemData(notification);
        
        // 4. Transform to UiPath payload
        const payload = await this.transformToUiPathPayload(itemData, config);
        
        // 5. Send to UiPath Orchestrator
        const result = await this.sendToOrchestrator(payload, config.queueName);
        
        return result;
    }

    async transformToUiPathPayload(itemData, config) {
        // Use mapping templates for different list types
        const template = this.getMappingTemplate(config.mappingTemplate);
        return template.transform(itemData, config.customFields);
    }
}
```

## Payload Mapping Templates

### Template System Design

Different SharePoint lists require different payload structures for UiPath. We'll create a template system:

```javascript
// src/shared/payload-templates/costco-trafficking.js
module.exports = {
    name: 'costcoTrafficking',
    transform: (itemData, customFields) => {
        return {
            Name: `SP_${itemData.id}_${Date.now()}`,
            Priority: customFields.priority || 'Normal',
            SpecificContent: {
                ItemId: itemData.id,
                ListName: itemData.listName,
                SiteUrl: itemData.siteUrl,
                
                // Business-specific fields
                TrackingNumber: itemData.fields.TrackingNumber,
                Vendor: itemData.fields.Vendor,
                Status: itemData.fields.Status,
                DueDate: itemData.fields.DueDate,
                
                // Change information
                ModifiedBy: itemData.fields.Editor,
                ModifiedDate: itemData.fields.Modified,
                Changes: itemData.changes,
                
                // Process metadata
                ProcessType: customFields.processType,
                Timestamp: new Date().toISOString()
            },
            Reference: `SharePoint-${itemData.listId}-${itemData.id}`
        };
    }
};
```

### Template Examples

#### 1. Invoice Processing Template
```javascript
// src/shared/payload-templates/invoice-processing.js
module.exports = {
    name: 'invoiceProcessing',
    transform: (itemData, customFields) => {
        return {
            Name: `INV_${itemData.fields.InvoiceNumber}`,
            Priority: itemData.fields.Amount > 10000 ? 'High' : 'Normal',
            SpecificContent: {
                InvoiceNumber: itemData.fields.InvoiceNumber,
                VendorName: itemData.fields.Vendor,
                Amount: itemData.fields.Amount,
                DueDate: itemData.fields.DueDate,
                ApprovalStatus: itemData.fields.ApprovalStatus,
                Attachments: itemData.attachments,
                RequiresReview: itemData.changes?.includes('Amount')
            }
        };
    }
};
```

#### 2. Document Approval Template
```javascript
// src/shared/payload-templates/document-approval.js
module.exports = {
    name: 'documentApproval',
    transform: (itemData, customFields) => {
        return {
            Name: `DOC_APPROVAL_${itemData.id}`,
            Priority: 'Normal',
            SpecificContent: {
                DocumentName: itemData.fields.Title,
                DocumentType: itemData.fields.DocumentType,
                Author: itemData.fields.Author,
                ApprovalChain: itemData.fields.Approvers,
                CurrentStatus: itemData.fields.ApprovalStatus,
                DocumentUrl: itemData.documentUrl,
                Changes: itemData.changes
            }
        };
    }
};
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

1. **Create uipath-dispatcher function**
   ```javascript
   // Basic structure that receives notifications and processes them
   ```

2. **Implement UiPath authentication**
   ```javascript
   async authenticateWithOrchestrator() {
       const response = await axios.post(
           `${this.orchestratorUrl}/identity/connect/token`,
           {
               grant_type: 'client_credentials',
               client_id: this.clientId,
               client_secret: this.clientSecret,
               scope: 'OR.Queues'
           }
       );
       return response.data.access_token;
   }
   ```

3. **Create queue item submission**
   ```javascript
   async addQueueItem(queueName, itemData, token) {
       return await axios.post(
           `${this.orchestratorUrl}/odata/Queues/UiPathODataSvc.AddQueueItem`,
           {
               queueName: queueName,
               itemData: itemData
           },
           {
               headers: {
                   'Authorization': `Bearer ${token}`,
                   'X-UIPATH-TenantName': this.tenantName
               }
           }
       );
   }
   ```

### Phase 2: Webhook Configuration System (Week 1-2)

1. **Extend subscription-manager to support processor configuration**
   ```javascript
   // Enhanced webhook creation
   {
       "resource": "sites/.../lists/...",
       "changeType": "updated",
       "notificationUrl": "https://.../api/webhook-handler",
       "clientState": {
           "processor": "uipath",
           "config": {
               "queueName": "SharePointChanges",
               "mappingTemplate": "costcoTrafficking"
           }
       }
   }
   ```

2. **Store configuration in Azure Table Storage**
   ```javascript
   // Configuration entity
   {
       PartitionKey: "webhook-config",
       RowKey: subscriptionId,
       ProcessorType: "uipath",
       QueueName: "SharePointChanges",
       MappingTemplate: "costcoTrafficking",
       CustomFields: JSON.stringify(customFields)
   }
   ```

### Phase 3: Change Detection Integration (Week 2)

1. **Integrate with existing change detection**
   ```javascript
   async getItemChanges(notification) {
       const changeDetector = new ChangeDetector(this.context);
       const changes = await changeDetector.detectChanges(
           notification.resource,
           notification.resourceData.id
       );
       return {
           current: changes.currentState,
           previous: changes.previousState,
           changes: changes.differences
       };
   }
   ```

2. **Include change details in UiPath payload**
   ```javascript
   {
       SpecificContent: {
           // ... other fields
           Changes: {
               fields: ["Status", "Amount"],
               oldValues: {
                   Status: "Pending",
                   Amount: 5000
               },
               newValues: {
                   Status: "Approved",
                   Amount: 5500
               }
           }
       }
   }
   ```

### Phase 4: Testing & Deployment (Week 2-3)

1. **Local testing setup**
   ```bash
   # Test with mock UiPath endpoint
   npm run dev
   
   # Create test webhook
   curl -X POST http://localhost:7071/api/subscription-manager \
     -d '{"processor": "uipath", "config": {...}}'
   
   # Simulate notification
   curl -X POST http://localhost:7071/api/webhook-handler \
     -d '{"value": [...]}'
   ```

2. **Integration testing with UiPath**
   - Set up test Orchestrator tenant
   - Create test queues
   - Validate payload structures

## Configuration Examples

### Example 1: COSTCO Trafficking List
```json
{
  "resource": "sites/fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:/lists/a347ee9b-51b8-4ae2-bdb3-ebdfae5683ae",
  "processor": "uipath",
  "config": {
    "queueName": "COSTCO_Trafficking",
    "mappingTemplate": "costcoTrafficking",
    "includeChanges": true,
    "triggerFields": ["Status", "Priority", "DueDate"],
    "customFields": {
      "processType": "COSTCO_INLINE",
      "department": "Logistics",
      "autoApprove": false
    }
  }
}
```

### Example 2: Invoice Processing List
```json
{
  "resource": "sites/fambrandsllc.sharepoint.com:/sites/Finance:/lists/invoices",
  "processor": "uipath",
  "config": {
    "queueName": "InvoiceProcessing",
    "mappingTemplate": "invoiceProcessing",
    "includeChanges": true,
    "triggerFields": ["Amount", "ApprovalStatus"],
    "customFields": {
      "processType": "AP_INVOICE",
      "requiresManagerApproval": true,
      "threshold": 10000
    }
  }
}
```

## Environment Variables

Add to local.settings.json:
```json
{
  "Values": {
    // Existing settings...
    
    // UiPath Configuration
    "UIPATH_ORCHESTRATOR_URL": "https://cloud.uipath.com/[account]/[tenant]/orchestrator_",
    "UIPATH_TENANT_NAME": "DefaultTenant",
    "UIPATH_CLIENT_ID": "your-client-id",
    "UIPATH_CLIENT_SECRET": "your-client-secret",
    
    // Feature Flags
    "ENABLE_UIPATH_PROCESSOR": "true",
    "UIPATH_RETRY_ATTEMPTS": "3",
    "UIPATH_TIMEOUT_MS": "30000"
  }
}
```

## Monitoring & Logging

### Structured Logging
```javascript
logger.info('UiPath queue item created', {
    queueName: config.queueName,
    itemId: result.Id,
    sharePointResource: notification.resource,
    processingTime: Date.now() - startTime,
    template: config.mappingTemplate
});
```

### Metrics to Track
- Queue items created per hour
- Processing time per template
- Error rates by queue
- Retry attempts
- Payload sizes

## Error Handling

### Retry Logic
```javascript
async sendToOrchestratorWithRetry(payload, queueName, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await this.sendToOrchestrator(payload, queueName);
        } catch (error) {
            if (attempt === maxRetries) throw error;
            
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
            await this.delay(delay);
            
            logger.warn(`Retry attempt ${attempt} for queue ${queueName}`, {
                error: error.message,
                nextRetryIn: delay
            });
        }
    }
}
```

### Dead Letter Queue
Store failed items in Azure Table Storage for manual review:
```javascript
async storeFailedItem(notification, error) {
    const entity = {
        PartitionKey: 'failed-items',
        RowKey: `${Date.now()}_${notification.subscriptionId}`,
        Notification: JSON.stringify(notification),
        Error: error.message,
        Stack: error.stack,
        Timestamp: new Date().toISOString()
    };
    await this.tableClient.createEntity(entity);
}
```

## Security Considerations

1. **Credential Storage**
   - Use Azure Key Vault for UiPath credentials
   - Rotate client secrets regularly
   - Use managed identities where possible

2. **Payload Validation**
   - Validate all data before sending to UiPath
   - Sanitize user inputs
   - Limit payload sizes

3. **Access Control**
   - Restrict function access with function keys
   - Implement IP whitelisting if needed
   - Audit all queue submissions

## Testing Strategy

### Unit Tests
```javascript
describe('UiPathProcessor', () => {
    test('transforms COSTCO trafficking data correctly', async () => {
        const processor = new UiPathProcessor(mockContext);
        const result = await processor.transformToUiPathPayload(
            mockItemData,
            { mappingTemplate: 'costcoTrafficking' }
        );
        
        expect(result.SpecificContent.TrackingNumber).toBe('TRK123');
        expect(result.Priority).toBe('High');
    });
});
```

### Integration Tests
```javascript
test('end-to-end webhook to UiPath flow', async () => {
    // 1. Create webhook with UiPath processor
    // 2. Trigger SharePoint change
    // 3. Verify queue item created in UiPath
    // 4. Check payload structure
});
```

## Deployment Checklist

- [ ] UiPath Orchestrator credentials configured
- [ ] Queue created in UiPath
- [ ] Mapping templates deployed
- [ ] Azure Table Storage configured
- [ ] Function keys generated
- [ ] Monitoring alerts set up
- [ ] Error handling tested
- [ ] Documentation updated
- [ ] Team trained on new functionality

## Next Steps

1. **Immediate Actions**
   - Set up UiPath Orchestrator test tenant
   - Create prototype uipath-dispatcher function
   - Test authentication with Orchestrator

2. **Short-term Goals**
   - Implement first mapping template
   - Test with real SharePoint list
   - Set up monitoring dashboard

3. **Long-term Vision**
   - Support multiple processor types (Power Automate, Logic Apps)
   - Build UI for configuring mappings
   - Implement advanced filtering and routing rules