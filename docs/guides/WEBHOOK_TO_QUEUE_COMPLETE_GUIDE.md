# Complete Guide: SharePoint Webhooks to UiPath Queue Integration

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Handler Types](#handler-types)
4. [Setup Process](#setup-process)
5. [Production Scaling](#production-scaling)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This guide provides a comprehensive walkthrough for establishing webhook connections between SharePoint lists/libraries and UiPath Orchestrator queues. The system supports multiple handler types for different use cases and can scale to handle enterprise workloads.

### Key Capabilities
- **Real-time Processing**: SharePoint changes trigger immediate queue items
- **Multiple Handlers**: Document, COSTCO, and custom handlers
- **Multi-Environment Support**: Route to DEV or PROD environments dynamically
- **Flexible Routing**: Route to different queues based on content or metadata
- **Production Ready**: Auto-renewal, monitoring, and error handling built-in

### Understanding the Terminology

| Term | Definition | Example |
|------|------------|---------|
| **Destination** | Where notifications route | `uipath`, `forward`, `none` |
| **Handler** | Processing template for UiPath destination | `document`, `costco`, `custom` |
| **Tenant** | UiPath environment identifier | `DEV`, `PROD` |
| **Folder** | UiPath organization unit ID | `277500` (DEV), `376892` (PROD) |
| **Queue** | Target UiPath Orchestrator queue name | `Invoice_Processing_Queue` |
| **Label** | Human-readable webhook identifier | `AccountingInvoices` |

---

## Architecture

### System Flow

```
SharePoint Change → Webhook Notification → Azure Function (webhook-handler)
                                               ↓
                                    Parse ClientState Configuration
                                               ↓
                            ┌──────────────────┼──────────────────┐
                            ↓                  ↓                  ↓
                    Document Handler    COSTCO Handler    Custom Handler
                            ↓                  ↓                  ↓
                    Extract Metadata    Validate Fields   Custom Logic
                            ↓                  ↓                  ↓
                         UiPath             UiPath            UiPath
                      (DEV or PROD)      (DEV or PROD)     (DEV or PROD)
                         Queue              Queue             Queue
```

### Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Webhook Handler** | Receives notifications from SharePoint | `src/functions/webhook-handler.js` |
| **Processor Registry** | Routes to appropriate handler | `src/shared/uipath-processor-registry.js` |
| **Document Handler** | Handles document libraries | `src/templates/generic-document-processor.js` |
| **COSTCO Handler** | COSTCO-specific workflow | `src/templates/costco-inline-routing.js` |
| **UiPath Queue Client** | Submits to Orchestrator with environment support | `src/shared/uipath-queue-client.js` |
| **ClientState Parser** | Parses configuration (supports dual formats) | `src/shared/clientstate-parser.js` |

### Configuration Format Evolution

**New Format** (Current - Recommended):
```
destination:uipath|handler:document|queue:QueueName|tenant:PROD|folder:376892|label:MyWebhook
```

**Legacy Format** (Still Supported):
```
processor:uipath;processor:document;uipath:QueueName;env:PROD;folder:376892;config:MyWebhook
```

> **Note**: The system supports both formats through a dual-format parser for backward compatibility.

---

## Handler Types

### 1. Document Handler

**Purpose**: Process documents from SharePoint libraries with comprehensive metadata extraction.

**Activation**: `handler:document` in clientState

**Configuration Example**:
```
destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892|label:InvoiceProcessing
```

**Payload Structure**:
```json
{
  "ItemId": "19",
  "Title": "Invoice_2025.pdf",
  "WebUrl": "https://tenant.sharepoint.com/sites/Finance/Documents/Invoice_2025.pdf",
  "FileName": "Invoice_2025.pdf",
  "FileSize": "959868",
  "ContentType": "Document",
  "Author": "user@company.com",
  "Modified": "2025-12-10T01:34:50Z",
  "Created": "2025-07-16T23:00:20Z",
  "DocIcon": "pdf",
  "Version": "11.0",
  "FileType": "pdf",
  "ServerRedirectedEmbedUrl": "https://...",
  "CheckoutUser": null,
  "Editor": "user@company.com",
  "_UIVersionString": "11.0",
  "LinkFilename": "Invoice_2025.pdf",
  "ItemChildCount": "0",
  "FolderChildCount": "0"
  // ... 30+ additional metadata fields
}
```

**Example Use Cases**:
- **Invoice Processing**: Extract invoice metadata, route to accounting workflow
- **Contract Management**: Process legal documents with version tracking
- **Document Archival**: Automated compliance documentation
- **Multi-Format Support**: PDF, Word, Excel, images, etc.

**Customization Options**:
```javascript
// In src/templates/generic-document-processor.js
const processor = new GenericDocumentProcessor(context, {
  includeFields: ['Department', 'DocumentType', 'ApprovalStatus'],
  excludeFields: ['_UIVersionString', '_ComplianceFlags'],
  defaultQueue: 'Fallback_Queue',
  referencePrefix: 'DOC'
});
```

---

### 2. COSTCO Handler

**Purpose**: Handle COSTCO-specific routing forms and workflows with validation.

**Activation**: `handler:costco` in clientState (or legacy: resource containing "costco")

**Configuration Example**:
```
destination:uipath|handler:costco|queue:COSTCO_Routing_Queue|tenant:PROD|folder:376892|label:COSTCOInline
```

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
  "TraffickingNumber": "TRF-2025-001",
  "ShipmentDetails": "Standard shipping",
  "SpecialInstructions": "Handle with care"
  // Additional COSTCO-specific fields
}
```

**Validation Logic**:
```javascript
// Automatic validation before queue submission
if (!item.ShipToEmail || !item.ShipDate || !item.Style || !item.PONumber) {
  throw new Error('Missing required fields for COSTCO processing');
}

if (item.Status !== 'Send Generated Form') {
  // Skip processing - trigger condition not met
  return { processed: false, reason: 'Status not ready' };
}
```

---

### 3. Custom Handler

**Purpose**: Flexible handler for custom business logic and workflows.

**Activation**: `handler:custom` in clientState

**Configuration**: Define in processor registry (`src/shared/uipath-processor-registry.js`)

**Example Implementation**:

See [Custom Processor Implementation](#custom-processor-implementation) section below for complete code.

---

## Setup Process

### Prerequisites

1. **Azure Resources**:
   - Azure Function App (deployed and running)
   - Application Insights (monitoring configured)
   - Azure Storage Account (for change detection)

2. **SharePoint Access**:
   - Site/List permissions
   - App registration with Graph API access (`Sites.ReadWrite.All`)

3. **UiPath Orchestrator**:
   - Tenant access (DEV and/or PROD)
   - Client credentials (ID and secret)
   - Queue(s) created in target folder(s)
   - Folder/Organization Unit IDs:
     - DEV: `277500` (Tenant: `FAMBrands_RPAOPS`)
     - PROD: `376892` (Tenant: `FAMBrands_RPAOPS_PROD`)

### Step 1: Configure Environment Variables

**Azure Function App Settings**:

```bash
# Azure AD Configuration
AZURE_CLIENT_ID=<YOUR_AZURE_CLIENT_ID>
AZURE_CLIENT_SECRET=<YOUR_AZURE_CLIENT_SECRET>
AZURE_TENANT_ID=<YOUR_AZURE_TENANT_ID>

# SharePoint Configuration
SHAREPOINT_SITE_URL=https://tenant.sharepoint.com/sites/yoursite
WEBHOOK_LIST_ID=82a105da-8206-4bd0-851b-d3f2260043f4

# UiPath Configuration (Default Environment)
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/org/tenant/orchestrator_
UIPATH_TENANT_NAME=FAMBrands_RPAOPS
UIPATH_CLIENT_ID=your-client-id
UIPATH_CLIENT_SECRET=<YOUR_CLIENT_SECRET>
UIPATH_ORGANIZATION_UNIT_ID=277500
UIPATH_DEFAULT_QUEUE=Default_Queue
UIPATH_ENABLED=true

# Azure Storage (for change detection)
AZURE_STORAGE_CONNECTION_STRING=<YOUR_CONNECTION_STRING>
```

**Setting via Azure CLI**:
```bash
az functionapp config appsettings set \
  --name <function-app> \
  --resource-group <resource-group> \
  --settings \
    AZURE_CLIENT_ID="<value>" \
    UIPATH_TENANT_NAME="FAMBrands_RPAOPS" \
    UIPATH_ORGANIZATION_UNIT_ID="277500"
```

---

### Step 2: Identify Your SharePoint Resource

Use the discovery script to find your list/library resource path:

```bash
# Run discovery (requires environment variables set)
node discover-sharepoint-resources.js
```

**Example Output**:
```
📋 Available Lists/Libraries:

1. Invoice Documents
   ID: 1073e81c-e8ea-483c-ac8c-680148d9e215
   Resource: sites/tenant.sharepoint.com:/sites/Finance:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215
   Type: Document Library
   Item Count: 1,245

2. COSTCO Routing Forms
   ID: a347ee9b-51b8-4ae2-bdb3-ebdfae5683ae
   Resource: sites/tenant.sharepoint.com:/sites/DWI/COSTCO:/lists/a347ee9b-51b8-4ae2-bdb3-ebdfae5683ae
   Type: List
   Item Count: 89
```

---

### Step 3: Create Webhook with Handler

#### Example 1: Document Processing (DEV)

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing_Test|tenant:DEV|folder:277500|label:InvoicesDev"
  }'
```

**What This Does**:
1. Monitors SharePoint document library for changes
2. Routes to **document handler**
3. Submits to `Invoice_Processing_Test` queue
4. Uses **DEV environment** (tenant: FAMBrands_RPAOPS, folder: 277500)
5. Labels webhook as "InvoicesDev" for tracking

#### Example 2: COSTCO Processing (PROD)

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/DWI/COSTCO:/lists/a347ee9b-51b8-4ae2-bdb3-ebdfae5683ae",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:costco|queue:COSTCO_Routing_Queue|tenant:PROD|folder:376892|label:COSTCOInline"
  }'
```

**What This Does**:
1. Monitors COSTCO routing forms
2. Routes to **COSTCO handler**
3. Validates required fields (Ship To Email, Ship Date, Style, PO Number)
4. Only processes when Status = "Send Generated Form"
5. Submits to `COSTCO_Routing_Queue` in **PROD environment**

#### Example 3: Custom Handler with Conditions

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/accounting-research-id",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:custom|queue:Accounting_Research_Queue|tenant:PROD|folder:376892|label:AccountingResearch"
  }'
```

> **Note**: Requires custom handler implementation. See [Custom Processor Implementation](#custom-processor-implementation).

---

### Step 4: Verify Webhook is Active

```bash
# List active subscriptions
curl -X GET "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Accept: application/json" | jq '.'

# Sync to tracking list (also renews expiring webhooks)
curl -X POST "https://<function-app>.azurewebsites.net/api/webhook-sync?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.'
```

**Response Example**:
```json
{
  "subscriptions": [
    {
      "id": "16fb8419-87f8-4046-af0b-42def1c0ec0c",
      "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/...",
      "clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892|label:Invoices",
      "expirationDateTime": "2025-12-13T04:40:17Z",
      "description": "UiPath document processing: Invoice_Queue (PROD)"
    }
  ]
}
```

---

### Step 5: Test the Flow

#### Testing Workflow:

1. **Make a change** in SharePoint:
   - For document handler: Upload a document
   - For COSTCO handler: Update item with Status = "Send Generated Form"

2. **Monitor Azure Function logs**:
   ```bash
   az webapp log tail --name <function-app> --resource-group <resource-group>
   ```

3. **Check UiPath queue**:
   - Log into UiPath Orchestrator
   - Navigate to specified environment (DEV or PROD)
   - Check target queue for new items

4. **Verify in Application Insights**:
   ```kusto
   traces
   | where timestamp > ago(10m)
   | where message contains "Successfully submitted item to UiPath queue"
   | project timestamp, message, customDimensions
   ```

---

## Production Scaling

### Multiple Environments Strategy

Configure webhooks to target specific UiPath environments independently of Function App defaults:

```javascript
// Webhook 1: Development Testing
{
  "clientState": "destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500|label:TestInvoices"
}

// Webhook 2: Staging Validation
{
  "clientState": "destination:uipath|handler:document|queue:Staging_Queue|tenant:DEV|folder:277500|label:StagingInvoices"
}

// Webhook 3: Production Processing
{
  "clientState": "destination:uipath|handler:document|queue:Production_Queue|tenant:PROD|folder:376892|label:ProdInvoices"
}
```

**Environment Configuration Override**:
The system dynamically creates UiPath clients based on webhook configuration:

```javascript
// src/shared/uipath-queue-client.js
function createDynamicUiPathQueueClient(context, configOverrides = null) {
  if (!configOverrides) {
    // Use default environment variables
    return new UiPathQueueClient(context);
  }

  // Override with webhook-specific environment
  const envConfig = {
    orchestratorUrl: getOrchestratorUrl(configOverrides.tenant),
    tenantName: getTenantName(configOverrides.tenant),
    organizationUnitId: configOverrides.folder,
    clientId: process.env.UIPATH_CLIENT_ID,
    clientSecret: process.env.UIPATH_CLIENT_SECRET
  };

  return new UiPathQueueClient(context, envConfig);
}
```

### Multiple Queues Strategy

#### By Document Type:
```javascript
// Route invoices vs contracts to different queues
{
  "clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892|label:Invoices"
}
{
  "clientState": "destination:uipath|handler:document|queue:Contract_Queue|tenant:PROD|folder:376892|label:Contracts"
}
```

#### By Department:
```javascript
// Finance webhook
{
  "clientState": "destination:uipath|handler:document|queue:Finance_Queue|tenant:PROD|folder:376892|label:FinanceDocs"
}

// HR webhook
{
  "clientState": "destination:uipath|handler:document|queue:HR_Queue|tenant:PROD|folder:376892|label:HRDocs"
}

// Operations webhook
{
  "clientState": "destination:uipath|handler:document|queue:Operations_Queue|tenant:PROD|folder:376892|label:OpsDocs"
}
```

### High-Volume Considerations

#### 1. Queue Throttling

Implement rate limiting to prevent overwhelming UiPath Orchestrator:

```javascript
// In uipath-queue-client.js
const RATE_LIMIT = 100; // items per minute
const BATCH_SIZE = 10;  // items per batch

async addQueueItemWithThrottling(itemData) {
  await this.rateLimiter.acquire();
  return await this.addQueueItem(itemData);
}
```

#### 2. Parallel Processing

Process multiple notifications concurrently:

```javascript
// In webhook-handler.js
const notifications = req.body.value || [];
const promises = notifications.map(notification =>
  processNotification(notification, context)
);

const results = await Promise.all(promises);
```

#### 3. Error Recovery

Implement retry logic with exponential backoff:

```javascript
// In uipath-queue-client.js
async addQueueItemWithRetry(itemData, maxRetries = 3) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await this.addQueueItem(itemData);
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        await this.sendToDeadLetterQueue(itemData, error);
        throw error;
      }

      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

### Custom Processor Implementation

Create custom handlers for specific business logic:

```javascript
// src/templates/custom-accounting-processor.js
const { createLogger } = require('../shared/logging');
const { createDynamicUiPathQueueClient } = require('../shared/uipath-queue-client');

class CustomAccountingProcessor {
  constructor(context, configOverrides = null) {
    this.logger = createLogger(context);

    // Accept configOverrides for multi-environment support
    this.queueClient = createDynamicUiPathQueueClient(context, configOverrides);
  }

  /**
   * Determine if this item should be processed
   */
  shouldProcessItem(item, previousItem) {
    // Custom trigger logic
    const isApproved = item.ApprovalStatus === 'Approved';
    const isHighValue = parseFloat(item.Amount || 0) > 10000;
    const notAlreadyProcessed = item.ProcessingStatus !== 'Completed';

    this.logger.info('Evaluating processing criteria', {
      isApproved,
      isHighValue,
      notAlreadyProcessed,
      itemId: item.ID
    });

    return isApproved && isHighValue && notAlreadyProcessed;
  }

  /**
   * Validate required fields before processing
   */
  validateRequiredFields(item) {
    const required = ['Department', 'Amount', 'Approver', 'RequestDate'];
    const missing = required.filter(field => !item[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Validate data types
    if (isNaN(parseFloat(item.Amount))) {
      throw new Error('Amount must be a valid number');
    }

    this.logger.debug('Validation passed', { itemId: item.ID });
  }

  /**
   * Transform item data for queue payload
   */
  transformItemData(item) {
    const amount = parseFloat(item.Amount);

    return {
      // Core fields
      ItemId: item.ID,
      Department: item.Department,
      Amount: amount,
      Approver: item.Approver,
      RequestDate: item.RequestDate,
      ApprovalDate: item.Modified,

      // Calculated fields
      Priority: amount > 50000 ? 'Critical' : amount > 10000 ? 'High' : 'Normal',
      ProcessingType: this.determineProcessingType(item),

      // Metadata
      RequestedBy: item.Author,
      LastModifiedBy: item.Editor,
      SharePointUrl: item.WebUrl || `Item ${item.ID}`
    };
  }

  /**
   * Custom business logic for processing type
   */
  determineProcessingType(item) {
    if (item.Department === 'Finance' && parseFloat(item.Amount) > 50000) {
      return 'ExecutiveReview';
    } else if (item.RequestType === 'Audit') {
      return 'ComplianceCheck';
    } else {
      return 'StandardProcessing';
    }
  }

  /**
   * Main processing method
   */
  async processItem(item, previousItem, queueName, configOverrides = null) {
    try {
      // Check trigger conditions
      if (!this.shouldProcessItem(item, previousItem)) {
        this.logger.info('Skipping item - trigger conditions not met', {
          itemId: item.ID,
          status: item.ApprovalStatus,
          amount: item.Amount
        });
        return {
          processed: false,
          reason: 'Trigger conditions not met'
        };
      }

      // Validate required fields
      this.validateRequiredFields(item);

      // Transform data
      const transformedData = this.transformItemData(item);

      // Submit to UiPath queue
      const result = await this.queueClient.addQueueItem({
        queueName: queueName || 'Accounting_Research_Queue',
        itemData: transformedData,
        priority: transformedData.Priority,
        reference: `ACCT_${item.ID}_${Date.now()}`,
        deferDate: null,
        dueDate: this.calculateDueDate(transformedData.Priority)
      });

      this.logger.info('Successfully submitted to UiPath queue', {
        itemId: item.ID,
        queueItemId: result.Id,
        queue: queueName,
        priority: transformedData.Priority
      });

      return {
        processed: true,
        queueItemId: result.Id,
        priority: transformedData.Priority
      };

    } catch (error) {
      this.logger.error('Failed to process item', {
        itemId: item.ID,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Calculate due date based on priority
   */
  calculateDueDate(priority) {
    const now = new Date();
    switch (priority) {
      case 'Critical':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day
      case 'High':
        return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
      default:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    }
  }
}

module.exports = CustomAccountingProcessor;
```

**Register the Custom Processor**:

```javascript
// src/shared/uipath-processor-registry.js
const CustomAccountingProcessor = require('../templates/custom-accounting-processor');

// Register custom processor
registerProcessor({
  name: 'custom-accounting-processor',
  description: 'Accounting research request processor with custom validation',
  matches: ({ tokens }) => tokens.includes('handler:custom'),
  factory: (context, configOverrides) => new CustomAccountingProcessor(context, configOverrides)
});
```

---

## Monitoring & Maintenance

### Key Metrics to Monitor

#### 1. Webhook Health
- **Active subscription count**: Should match expected webhooks
- **Expiration dates**: Webhooks approaching expiration
- **Renewal success rate**: Percentage of successful auto-renewals

**Application Insights Query**:
```kusto
traces
| where message contains "Successfully renewed webhook"
| summarize RenewalCount = count() by bin(timestamp, 1d)
| render timechart
```

#### 2. Processing Metrics
- **Notifications received/hour**: Volume tracking
- **Queue items created/hour**: Throughput measurement
- **Error rate**: Failed processing attempts
- **Average processing time**: Performance monitoring

**Application Insights Query**:
```kusto
traces
| where message contains "Successfully submitted item to UiPath queue"
| extend queue = tostring(customDimensions.queue)
| summarize SubmissionCount = count() by bin(timestamp, 1h), queue
| render timechart
```

#### 3. UiPath Integration
- **Authentication success rate**: Token acquisition reliability
- **Queue submission failures**: API errors
- **API response times**: Performance tracking
- **Environment distribution**: DEV vs PROD usage

**Application Insights Query**:
```kusto
traces
| where message contains "UiPath" or message contains "queue"
| where severityLevel >= 3
| project timestamp, message, customDimensions
| order by timestamp desc
| limit 50
```

### Application Insights Queries

#### Processing Success by Handler:
```kusto
traces
| where message contains "Successfully submitted"
| extend handler = tostring(customDimensions.handler)
| summarize count() by handler, bin(timestamp, 1h)
| render columnchart
```

#### Average Processing Time:
```kusto
traces
| where message contains "Response 200"
| extend duration = toint(customDimensions.duration)
| summarize
    avg_duration = avg(duration),
    p50 = percentile(duration, 50),
    p95 = percentile(duration, 95),
    p99 = percentile(duration, 99)
  by bin(timestamp, 1h)
| render timechart
```

#### Failed Processing by Error Type:
```kusto
traces
| where severityLevel >= 3
| where message contains "Failed to process"
| extend errorType = tostring(customDimensions.errorType)
| summarize count() by errorType, bin(timestamp, 1d)
| render barchart
```

### Maintenance Tasks

#### Daily:
- ✅ Check active webhook count
- ✅ Review error logs for critical failures
- ✅ Monitor UiPath queue depths
- ✅ Verify authentication tokens are refreshing

#### Weekly:
- ✅ Verify webhook expiration dates (should be auto-renewing)
- ✅ Review processing metrics and trends
- ✅ Check Azure Function App health
- ✅ Validate environment configurations (DEV vs PROD)

#### Monthly:
- ✅ Rotate Azure Function keys
- ✅ Update processor configurations if needed
- ✅ Performance analysis and optimization
- ✅ Review and update documentation

### Auto-Renewal Configuration

The system automatically renews webhooks every hour via timer function:

```javascript
// src/functions/webhook-sync-timer.js
app.timer('webhook-sync-timer', {
  schedule: '0 0 * * * *', // Every hour at :00
  handler: async (myTimer, context) => {
    const logger = createLogger(context);

    try {
      // Get all active webhooks
      const webhooks = await getActiveWebhooks();

      // Renew webhooks expiring within 24 hours
      const expiringWebhooks = webhooks.filter(webhook => {
        const expirationDate = new Date(webhook.expirationDateTime);
        const hoursUntilExpiration = (expirationDate - new Date()) / (1000 * 60 * 60);
        return hoursUntilExpiration < 24;
      });

      logger.info(`Found ${expiringWebhooks.length} webhooks expiring within 24 hours`);

      // Renew each webhook
      for (const webhook of expiringWebhooks) {
        await renewWebhook(webhook.id);
        logger.info('Successfully renewed webhook', { subscriptionId: webhook.id });
      }

      // Sync to tracking list
      await syncToTrackingList();

    } catch (error) {
      logger.error('Webhook sync timer failed', { error: error.message });
    }
  }
});
```

**Renewal Behavior**:
- **Trigger**: Webhooks expiring within 24 hours
- **New Expiration**: 3 days from renewal time (SharePoint maximum)
- **Failed Renewals**: Logged to Application Insights, require manual intervention

**Manual Renewal**:
```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/webhook-sync?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Webhook Not Triggering

**Symptoms**: Changes in SharePoint don't create notifications.

**Diagnostic Steps**:
```bash
# 1. Verify webhook is active
curl -X GET "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>"

# 2. Check expiration date
# Look for "expirationDateTime" in response

# 3. Check tracking list sync
curl -X POST "https://<function-app>.azurewebsites.net/api/webhook-sync?code=<FUNCTION_KEY>" -d '{}'
```

**Solutions**:
- If expired: Recreate webhook
- If missing: Check SharePoint permissions (`Sites.ReadWrite.All`)
- If active but not firing: Verify notification URL is accessible

---

#### 2. Queue Items Not Created

**Symptoms**: Notifications received but no UiPath queue items appear.

**Diagnostic Steps**:

1. **Verify Configuration**:
   ```bash
   curl "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" | jq '.subscriptions[].clientState'
   ```
   Check for `destination:uipath` in output.

2. **Check Handler Trigger Conditions**:
   - **Document handler**: Processes all changes
   - **COSTCO handler**: Requires `Status = "Send Generated Form"`
   - **Custom handler**: Check implementation-specific conditions

3. **Verify Queue Exists**:
   ```bash
   # Check UiPath Orchestrator
   # Navigate to: Tenant > Folder > Queues
   # Verify queue name matches exactly
   ```

4. **Check Environment Configuration**:
   ```bash
   az functionapp config appsettings list \
     --name <function-app> \
     --resource-group <resource-group> \
     --query "[?name=='UIPATH_TENANT_NAME'].value"
   ```

**Solutions**:
- Update clientState with correct `destination:uipath|handler:...`
- Verify trigger conditions are met (e.g., Status field)
- Create missing queue in UiPath Orchestrator
- Correct `tenant:` and `folder:` parameters

---

#### 3. Wrong Processor Activated

**Symptoms**: Items processed by wrong handler template.

**Cause**: Processor matching logic priority issue.

**Solution**: Check processor registration order in `uipath-processor-registry.js`:

```javascript
// More specific patterns should be registered first
registerProcessor(costcoProcessor);    // Specific: matches handler:costco
registerProcessor(documentProcessor);  // General: matches handler:document
registerProcessor(customProcessor);    // Specific: matches handler:custom
```

**Debug Logging**:
```javascript
// Add to webhook-handler.js
logger.debug('Processor matching', {
  tokens: parsedConfig.tokens,
  matchedProcessor: processor.name
});
```

---

#### 4. Authentication Failures

**Symptoms**: 401/403 errors in Application Insights logs.

**Diagnostic Steps**:

1. **Test Azure AD Auth**:
   ```bash
   node validate-system.js
   ```

2. **Test UiPath Auth**:
   ```bash
   curl -X POST "https://account.uipath.com/oauth/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&scope=OR.Queues"
   ```

3. **Check Token Expiration**:
   ```kusto
   traces
   | where message contains "Token" or message contains "authentication"
   | where severityLevel >= 2
   | project timestamp, message
   | order by timestamp desc
   ```

**Solutions**:
- Rotate expired client secrets
- Verify scopes include `OR.Queues` for UiPath
- Check app registration permissions in Azure AD

---

#### 5. Environment Mismatch

**Symptoms**: Items go to wrong UiPath environment (DEV instead of PROD or vice versa).

**Cause**: Incorrect `tenant:` or `folder:` in clientState.

**Diagnostic**:
```bash
# Check webhook configuration
curl "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  | jq '.subscriptions[] | {id, clientState}'
```

**Expected Values**:
- **DEV**: `tenant:DEV|folder:277500` → Routes to FAMBrands_RPAOPS
- **PROD**: `tenant:PROD|folder:376892` → Routes to FAMBrands_RPAOPS_PROD

**Solution**:
```bash
# Delete incorrect webhook
curl -X DELETE "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>&subscriptionId=<webhook-id>"

# Recreate with correct environment
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/listId",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:QueueName|tenant:PROD|folder:376892"
  }'
```

---

### Performance Optimization

#### 1. Enable Token Caching

```javascript
// Already implemented in uipath-queue-client.js
const ENABLE_TOKEN_CACHE = process.env.ENABLE_TOKEN_CACHE !== 'false';
```

Ensure environment variable is set to `true` (default).

#### 2. Batch Processing

For high-volume scenarios, batch multiple queue items:

```javascript
// Batch API support (if available in UiPath version)
const batchResults = await queueClient.addQueueItems([item1, item2, item3]);
```

#### 3. Async Background Operations

Don't wait for non-critical operations:

```javascript
// Update notification count asynchronously
updateNotificationCount(subscriptionId).catch(error =>
  logger.warn('Failed to update notification count', { error: error.message })
);

// Immediately return 200 OK to SharePoint
return { status: 200, body: 'OK' };
```

---

## Appendix

### ClientState Configuration Reference

**New Format**:
```
destination:{type}|handler:{name}|queue:{queueName}|tenant:{env}|folder:{id}|label:{identifier}

Components (all optional except destination):
- destination: uipath | forward | none
- handler: document | costco | custom (required if destination=uipath)
- queue: Target queue name (required if destination=uipath)
- tenant: DEV | PROD (recommended for uipath)
- folder: Organization unit ID (recommended for uipath)
- label: Human-readable identifier (optional)
```

**Legacy Format** (Still Supported):
```
processor:{type};uipath:{queue};env:{environment};folder:{id};config:{name}

Components:
- processor: uipath | document | costco | custom
- uipath: Queue name
- env: DEV | PROD
- folder: Organization unit ID
- config: Named configuration
```

### Environment Presets

| Preset | Tenant Name | Folder ID | Typical Queues |
|--------|-------------|-----------|----------------|
| **DEV** | FAMBrands_RPAOPS | 277500 | test_webhook, Invoice_Processing_Test, Test_Queue |
| **PROD** | FAMBrands_RPAOPS_PROD | 376892 | Invoice_Queue, COSTCO_Routing_Queue, Accounting_Research_Queue |

### Function Keys Reference

Get current function keys:

```bash
# Subscription Manager
az functionapp function keys list \
  --name <function-app> \
  --resource-group <resource-group> \
  --function-name subscription-manager

# Webhook Sync
az functionapp function keys list \
  --name <function-app> \
  --resource-group <resource-group> \
  --function-name webhook-sync

# Webhook Handler (no key required - anonymous)
# Uses webhook validation instead
```

### Validation Script

Save as `validate-uipath-webhook.js`:

```javascript
const axios = require('axios');

async function validateUiPathWebhookSetup() {
  console.log('🔍 Validating UiPath Webhook Setup...\n');

  try {
    // 1. Check active webhooks
    const webhooksResponse = await axios.get(
      `https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>`
    );
    const webhooks = webhooksResponse.data.subscriptions || [];
    console.log(`✅ Active webhooks: ${webhooks.length}`);

    // 2. Verify UiPath destinations
    const uipathWebhooks = webhooks.filter(w =>
      w.clientState && w.clientState.includes('destination:uipath')
    );
    console.log(`✅ UiPath webhooks: ${uipathWebhooks.length}`);

    // 3. Check environment distribution
    const devWebhooks = uipathWebhooks.filter(w => w.clientState.includes('tenant:DEV'));
    const prodWebhooks = uipathWebhooks.filter(w => w.clientState.includes('tenant:PROD'));
    console.log(`📊 Environment distribution: DEV=${devWebhooks.length}, PROD=${prodWebhooks.length}`);

    // 4. Test UiPath connection (using default config)
    const tokenResponse = await axios.post(
      'https://account.uipath.com/oauth/token',
      'grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&scope=OR.Queues',
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    console.log('✅ UiPath authentication: OK');

    console.log('\n📊 System Status: OPERATIONAL');

  } catch (error) {
    console.error('❌ Validation failed:', error.message);
  }
}

validateUiPathWebhookSetup();
```

---

## Next Steps

1. **Set up monitoring dashboard** in Application Insights with custom queries
2. **Create runbooks** for common operations (webhook creation, renewal, troubleshooting)
3. **Implement custom handlers** for your specific business logic
4. **Configure alerts** for critical failures (authentication, queue submission errors)
5. **Document your workflows** for team reference and knowledge transfer

---

## 📚 Related Documentation

- **[Quick Start: Document Processor](./QUICK_START_DOCUMENT_PROCESSOR.md)** - Fast setup guide
- **[Webhook Setup Guide](./WEBHOOK_SETUP_GUIDE.md)** - Comprehensive webhook configuration
- **[UiPath Main Guide](./uipath/main-guide.md)** - UiPath-specific details
- **[Visitor Onboarding Guide](./VISITOR_ONBOARDING_GUIDE.md)** - New user orientation
- **[Documentation Index](./INDEX.md)** - Complete documentation hub

---

*Last Updated: December 2025 | Version 3.0*
