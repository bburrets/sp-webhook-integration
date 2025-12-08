# Complete Guide: SharePoint Webhooks to UiPath Queue Integration

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Processor Types](#processor-types)
4. [Setup Process](#setup-process)
5. [Production Scaling](#production-scaling)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This guide provides a comprehensive walkthrough for establishing webhook connections between SharePoint lists/libraries and UiPath Orchestrator queues. The system supports multiple processor types for different use cases and can scale to handle enterprise workloads.

### Key Capabilities
- **Real-time Processing**: SharePoint changes trigger immediate queue items
- **Multiple Processors**: Document, COSTCO, and custom processors
- **Flexible Routing**: Route to different queues based on content or metadata
- **Production Ready**: Auto-renewal, monitoring, and error handling built-in

---

## Architecture

### System Flow

```
SharePoint Change → Webhook Notification → Azure Function
                                               ↓
                                        Process & Route
                                               ↓
                            ┌──────────────────┼──────────────────┐
                            ↓                  ↓                  ↓
                    Document Processor  COSTCO Processor   Custom Processor
                            ↓                  ↓                  ↓
                         UiPath             UiPath            UiPath
                         Queue              Queue             Queue
```

### Components

| Component | Purpose | Location |
|-----------|---------|----------|
| Webhook Handler | Receives notifications | `src/functions/webhook-handler.js` |
| Processor Registry | Routes to appropriate processor | `src/shared/uipath-processor-registry.js` |
| Document Processor | Handles document libraries | `src/templates/generic-document-processor.js` |
| COSTCO Processor | COSTCO-specific workflow | `src/templates/costco-inline-routing.js` |
| UiPath Client | Submits to Orchestrator | `src/shared/uipath-queue-client.js` |

---

## Processor Types

### 1. Document Processor

**Purpose**: Process documents from SharePoint libraries with metadata extraction.

**Activation**: `processor:document` in clientState

**Payload Structure**:
```json
{
  "ItemId": "19",
  "Title": "Invoice_2025.pdf",
  "WebUrl": "https://tenant.sharepoint.com/.../Invoice_2025.pdf",
  "FileName": "Invoice_2025.pdf",
  "FileSize": "959868",
  "ContentType": "Document",
  "Author": "user@company.com",
  "Modified": "2025-11-13T01:34:50Z",
  "Created": "2025-07-16T23:00:20Z",
  "DocIcon": "pdf",
  "Version": "11.0",
  // ... 30+ additional metadata fields
}
```

**Example Use Cases**:
- Invoice processing
- Contract management
- Document archival
- Compliance documentation

### 2. COSTCO Processor

**Purpose**: Handle COSTCO-specific routing forms and workflows.

**Activation**: `processor:costco` or resource containing "costco"

**Required Fields**:
- Ship To Email
- Ship Date
- Style
- PO Number

**Trigger Condition**: Status = "Send Generated Form"

**Payload Structure**:
```json
{
  "ItemId": "123",
  "Status": "Send Generated Form",
  "ShipToEmail": "warehouse@costco.com",
  "ShipDate": "2025-12-01",
  "Style": "PROD-12345",
  "PONumber": "PO-98765",
  "Priority": "High",
  // Additional COSTCO-specific fields
}
```

### 3. Generic/Custom Processor

**Purpose**: Flexible processor for custom business logic.

**Activation**: Custom clientState patterns

**Configuration**: Define in processor registry

---

## Setup Process

### Prerequisites

1. **Azure Resources**:
   - Azure Function App (running)
   - Application Insights (monitoring)
   - Storage Account (state management)

2. **SharePoint Access**:
   - Site/List permissions
   - App registration with Graph API access

3. **UiPath Orchestrator**:
   - Tenant access
   - Client credentials
   - Queue(s) created
   - Folder/Organization Unit ID

### Step 1: Configure Environment Variables

```bash
# Azure AD Configuration
AZURE_CLIENT_ID=<YOUR_AZURE_CLIENT_ID>
AZURE_CLIENT_SECRET=<YOUR_AZURE_CLIENT_SECRET>
AZURE_TENANT_ID=<YOUR_AZURE_TENANT_ID>

# SharePoint Configuration
SHAREPOINT_SITE_URL=https://tenant.sharepoint.com/sites/yoursite
WEBHOOK_LIST_ID=82a105da-8206-4bd0-851b-d3f2260043f4

# UiPath Configuration
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/org/tenant/orchestrator_
UIPATH_TENANT_NAME=YourTenant
UIPATH_CLIENT_ID=your-client-id
UIPATH_CLIENT_SECRET=your-client-secret
UIPATH_ORGANIZATION_UNIT_ID=277500
UIPATH_DEFAULT_QUEUE=Default_Queue
UIPATH_ENABLED=true
```

### Step 2: Identify Your SharePoint Resource

```javascript
// Run discovery script to find your list/library
node discover-sharepoint-resources.js
```

**Example Output**:
```
📋 Available Lists/Libraries:
1. Documents
   ID: 1073e81c-e8ea-483c-ac8c-680148d9e215
   Resource: sites/tenant.sharepoint.com:/sites/site:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215
```

### Step 3: Create Webhook with Processor

#### For Document Processing:
```bash
curl -X POST "https://your-function.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/LIST_ID",
    "changeType": "updated",
    "notificationUrl": "https://your-function.azurewebsites.net/api/webhook-handler",
    "clientState": "processor:uipath;processor:document;uipath:Invoice_Queue;env:PROD;folder:277500"
  }'
```

#### For COSTCO Processing:
```bash
curl -X POST "https://your-function.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/LIST_ID",
    "changeType": "updated",
    "notificationUrl": "https://your-function.azurewebsites.net/api/webhook-handler",
    "clientState": "processor:uipath;processor:costco;uipath:COSTCO_Queue;env:PROD"
  }'
```

### Step 4: Verify Webhook is Active

```bash
# List active subscriptions
curl "https://your-function.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" | jq '.'

# Sync to tracking list
curl -X POST "https://your-function.azurewebsites.net/api/webhook-sync?code=YOUR_KEY" -d '{}' | jq '.'
```

### Step 5: Test the Flow

1. **Make a change** in SharePoint (upload document or update item)
2. **Monitor logs** in Application Insights
3. **Check UiPath queue** for new items

---

## Production Scaling

### Multiple Environments

```javascript
// Development
{
  "clientState": "processor:uipath;processor:document;env:DEV;folder:277500;queue:Test_Queue"
}

// Staging
{
  "clientState": "processor:uipath;processor:document;env:STAGING;folder:376892;queue:Staging_Queue"
}

// Production
{
  "clientState": "processor:uipath;processor:document;env:PROD;folder:428901;queue:Production_Queue"
}
```

### Multiple Queues Strategy

```javascript
// Route by document type
{
  "clientState": "processor:document;route:byType;invoice:Invoice_Queue;contract:Contract_Queue;default:General_Queue"
}

// Route by department
{
  "clientState": "processor:document;route:byDept;finance:Finance_Queue;hr:HR_Queue;ops:Operations_Queue"
}
```

### High-Volume Considerations

1. **Queue Throttling**:
   ```javascript
   // Implement rate limiting in uipath-queue-client.js
   const RATE_LIMIT = 100; // items per minute
   const BATCH_SIZE = 10;  // items per batch
   ```

2. **Parallel Processing**:
   ```javascript
   // Process multiple notifications concurrently
   const promises = notifications.map(n => processNotification(n));
   await Promise.all(promises);
   ```

3. **Error Recovery**:
   ```javascript
   // Implement dead letter queue
   if (retryCount > MAX_RETRIES) {
     await sendToDeadLetterQueue(notification);
   }
   ```

### Custom Processor Implementation

```javascript
// src/templates/custom-processor.js
class CustomProcessor {
  constructor(context) {
    this.logger = createLogger(context);
    this.queueClient = createUiPathQueueClient(context);
  }

  shouldProcessItem(item, previousItem) {
    // Custom trigger logic
    return item.ApprovalStatus === 'Approved' &&
           item.ProcessingStatus !== 'Completed';
  }

  validateRequiredFields(item) {
    const required = ['Department', 'Amount', 'Approver'];
    const missing = required.filter(field => !item[field]);

    if (missing.length > 0) {
      throw new Error(`Missing fields: ${missing.join(', ')}`);
    }
  }

  transformItemData(item) {
    return {
      Department: item.Department,
      Amount: parseFloat(item.Amount),
      Approver: item.Approver,
      ApprovalDate: item.Modified,
      Priority: item.Amount > 10000 ? 'High' : 'Normal'
    };
  }

  async processItem(item, previousItem, queueName) {
    if (!this.shouldProcessItem(item, previousItem)) {
      return { processed: false, reason: 'Trigger conditions not met' };
    }

    this.validateRequiredFields(item);
    const transformedData = this.transformItemData(item);

    const result = await this.queueClient.addQueueItem({
      queueName: queueName || 'Custom_Queue',
      itemData: transformedData,
      priority: transformedData.Priority,
      reference: `CUSTOM_${item.ID}_${Date.now()}`
    });

    return { processed: true, queueItemId: result.Id };
  }
}

// Register the processor
registerProcessor({
  name: 'custom-processor',
  matches: ({ tokens }) => tokens.includes('processor:custom'),
  factory: context => new CustomProcessor(context)
});
```

---

## Monitoring & Maintenance

### Key Metrics to Monitor

1. **Webhook Health**:
   - Active subscription count
   - Expiration dates
   - Renewal success rate

2. **Processing Metrics**:
   - Notifications received/hour
   - Queue items created/hour
   - Error rate
   - Average processing time

3. **UiPath Integration**:
   - Authentication success rate
   - Queue submission failures
   - API response times

### Application Insights Queries

```kusto
// Successful queue submissions
traces
| where message contains "Successfully submitted item to UiPath queue"
| summarize count() by bin(timestamp, 1h)

// Processing errors
traces
| where severityLevel >= 3
| where message contains "UiPath" or message contains "processor"
| project timestamp, message, customDimensions

// Average processing time
traces
| where message contains "Response 200"
| extend duration = toint(customDimensions.duration)
| summarize avg(duration), percentiles(duration, 50, 95, 99) by bin(timestamp, 1h)
```

### Maintenance Tasks

#### Daily:
- Check active webhook count
- Review error logs
- Monitor queue depths

#### Weekly:
- Verify webhook expiration dates
- Review processing metrics
- Check authentication token refresh

#### Monthly:
- Rotate function keys
- Update processor configurations
- Performance analysis

### Auto-Renewal Configuration

The system automatically renews webhooks every hour:

```javascript
// Timer function runs hourly
app.timer('webhook-sync-timer', {
  schedule: '0 0 * * * *',
  handler: async (myTimer, context) => {
    await renewExpiringWebhooks();
    await syncToTrackingList();
  }
});
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Webhook Not Triggering

**Symptoms**: Changes in SharePoint don't create notifications

**Checks**:
```bash
# Verify webhook is active
curl "https://your-function.azurewebsites.net/api/subscription-manager?code=KEY"

# Check tracking list sync
curl -X POST "https://your-function.azurewebsites.net/api/webhook-sync?code=KEY" -d '{}'
```

**Solution**: Recreate webhook if expired

#### 2. Queue Items Not Created

**Symptoms**: Notifications received but no UiPath queue items

**Checks**:
- Verify `processor:uipath` in clientState
- Check UiPath credentials are valid
- Confirm queue name exists in folder
- Review trigger conditions in processor

**Debug Logging**:
```javascript
// Add to processor
this.logger.debug('Processing decision', {
  shouldProcess: this.shouldProcessItem(item),
  item: item,
  triggerField: item.Status
});
```

#### 3. Wrong Processor Activated

**Symptoms**: Items processed by wrong template

**Solution**: Check processor registration order and matching logic:
```javascript
// More specific patterns should be registered first
registerProcessor(costcoProcessor);    // Specific
registerProcessor(documentProcessor);  // General
```

#### 4. Authentication Failures

**Symptoms**: 401/403 errors in logs

**Checks**:
```bash
# Test Azure AD auth
node validate-system.js

# Test UiPath auth
curl -X POST "https://account.uipath.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=YOUR_ID&client_secret=YOUR_SECRET&scope=OR.Queues"
```

### Performance Optimization

#### 1. Enable Token Caching
```javascript
// Already implemented, ensure enabled
ENABLE_TOKEN_CACHE=true
```

#### 2. Batch Processing
```javascript
// Process multiple items in one API call
const batchResults = await queueClient.addQueueItems(items);
```

#### 3. Async Processing
```javascript
// Don't wait for non-critical operations
updateNotificationCount(subscriptionId).catch(logError);
```

---

## Appendix

### ClientState Format Reference

```
processor:{type};uipath:{queue};env:{environment};folder:{id};config:{name}

Components (all optional):
- processor: Activates specific processor (document, costco, custom)
- uipath: Target queue name
- env: Environment (DEV, STAGING, PROD)
- folder: UiPath organization unit ID
- config: Named configuration
- forward: URL for webhook forwarding
- mode: Processing mode (withData, withChanges)
```

### Function Keys Reference

Get current function keys:
```bash
# Subscription Manager
az functionapp function keys list \
  --name your-function \
  --resource-group your-rg \
  --function-name subscription-manager

# Webhook Sync
az functionapp function keys list \
  --name your-function \
  --resource-group your-rg \
  --function-name webhook-sync
```

### Validation Script

Save as `validate-webhook.js`:
```javascript
const axios = require('axios');

async function validateWebhookSetup() {
  console.log('🔍 Validating Webhook Setup...\n');

  // Check active webhooks
  const webhooks = await getActiveWebhooks();
  console.log(`✅ Active webhooks: ${webhooks.length}`);

  // Check UiPath connection
  const uipathConnected = await testUiPathConnection();
  console.log(`✅ UiPath connection: ${uipathConnected ? 'OK' : 'FAILED'}`);

  // Check recent activity
  const recentActivity = await getRecentActivity();
  console.log(`✅ Recent queue items: ${recentActivity.count}`);

  console.log('\n📊 System Status: OPERATIONAL');
}

validateWebhookSetup().catch(console.error);
```

---

## Next Steps

1. **Set up monitoring dashboard** in Application Insights
2. **Create runbooks** for common operations
3. **Implement custom processors** for your business logic
4. **Configure alerts** for critical failures
5. **Document your specific workflows** for team reference

For support and updates, refer to the project repository and Azure Function logs.