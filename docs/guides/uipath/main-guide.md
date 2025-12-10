# UiPath Integration Guide

## Overview

The UiPath integration enables automatic processing of SharePoint list items through UiPath Orchestrator queues. When specific conditions are met (such as status changes), the system fetches the complete item data, transforms it using predefined handlers, and submits it to UiPath queues for robotic process automation.

### Key Capabilities

- **Real-time Queue Submission**: SharePoint changes trigger immediate UiPath queue items
- **Multi-Environment Support**: Route to DEV or PROD environments dynamically per webhook
- **Multiple Handlers**: Document, COSTCO, and custom handlers with specific trigger logic
- **Flexible Configuration**: Per-webhook environment and queue targeting
- **Production Ready**: Token caching, retry logic, error handling, and monitoring

---

## Architecture

### System Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Webhook Handler** | Entry point for SharePoint notifications | `src/functions/webhook-handler.js` |
| **Processor Registry** | Routes notifications to appropriate handler | `src/shared/uipath-processor-registry.js` |
| **UiPath Authentication** | OAuth2 authentication with token caching | `src/shared/uipath-auth.js` |
| **UiPath Queue Client** | Submits items to Orchestrator with retry logic | `src/shared/uipath-queue-client.js` |
| **Document Handler** | Processes document libraries | `src/templates/generic-document-processor.js` |
| **COSTCO Handler** | Business-specific COSTCO routing | `src/templates/costco-inline-routing.js` |

### Processing Flow

```
SharePoint Change → Webhook Notification → webhook-handler
                                              ↓
                                    Parse clientState
                                              ↓
                                    Check destination:uipath
                                              ↓
                            ┌─────────────────┴─────────────────┐
                            ↓                                   ↓
                    handler:document                    handler:costco
                            ↓                                   ↓
                    Extract Metadata                   Validate Status/Fields
                            ↓                                   ↓
                    Transform to Queue Format          Transform to Queue Format
                            ↓                                   ↓
                    ┌───────┴────────┐                 ┌───────┴────────┐
                    ↓                ↓                 ↓                ↓
              UiPath DEV      UiPath PROD       UiPath DEV      UiPath PROD
           (tenant:DEV)     (tenant:PROD)    (tenant:DEV)     (tenant:PROD)
           folder:277500    folder:376892    folder:277500    folder:376892
```

---

## Configuration

### Environment Variables

Configure these in your Azure Function App settings:

```bash
# Azure AD Configuration (for SharePoint access)
AZURE_CLIENT_ID=<YOUR_AZURE_CLIENT_ID>
AZURE_CLIENT_SECRET=<YOUR_AZURE_CLIENT_SECRET>
AZURE_TENANT_ID=<YOUR_AZURE_TENANT_ID>

# SharePoint Configuration
SHAREPOINT_SITE_URL=https://tenant.sharepoint.com/sites/yoursite
WEBHOOK_LIST_ID=82a105da-8206-4bd0-851b-d3f2260043f4

# UiPath Orchestrator Configuration (Default Environment)
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/org/tenant/orchestrator_
UIPATH_TENANT_NAME=FAMBrands_RPAOPS
UIPATH_CLIENT_ID=your-client-id
UIPATH_CLIENT_SECRET=<YOUR_CLIENT_SECRET>
UIPATH_ORGANIZATION_UNIT_ID=277500
UIPATH_DEFAULT_QUEUE=Default_Queue

# Feature Flags
UIPATH_ENABLED=true
UIPATH_AUTO_RETRY=true
UIPATH_LOGGING=true
ENABLE_TOKEN_CACHE=true
```

**Setting via Azure CLI**:
```bash
az functionapp config appsettings set \
  --name <function-app> \
  --resource-group <resource-group> \
  --settings \
    UIPATH_ORCHESTRATOR_URL="https://cloud.uipath.com/org/tenant/orchestrator_" \
    UIPATH_TENANT_NAME="FAMBrands_RPAOPS" \
    UIPATH_ORGANIZATION_UNIT_ID="277500" \
    UIPATH_DEFAULT_QUEUE="Default_Queue" \
    UIPATH_ENABLED="true"
```

---

## Understanding UiPath Environments

Your organization typically has multiple UiPath environments for different purposes:

### Environment Configuration

| Environment | Tenant Name | Folder ID | Orchestrator URL | Purpose |
|-------------|-------------|-----------|------------------|---------|
| **Development (DEV)** | FAMBrands_RPAOPS | 277500 | `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_` | Testing, development, validation |
| **Production (PROD)** | FAMBrands_RPAOPS_PROD | 376892 | `https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_` | Live business processes |

### Environment Selection Behavior

1. **Default Environment**: Uses Function App environment variables
2. **Per-Webhook Override**: Specify `tenant:` and `folder:` in clientState to override defaults
3. **Dynamic Client Creation**: System creates appropriate UiPath client based on webhook configuration

**Example**:
```javascript
// Function App defaults to DEV (277500)
// But this webhook routes to PROD:
"clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892"

// System dynamically creates UiPath client for PROD environment
// Connects to: FAMBrands_RPAOPS_PROD, folder 376892
```

---

## Webhook Configuration for UiPath

### ClientState Format

**New Format** (Current - Recommended):
```
destination:uipath|handler:{type}|queue:{name}|tenant:{env}|folder:{id}|label:{identifier}
```

**Legacy Format** (Still Supported):
```
processor:uipath;processor:{type};uipath:{name};env:{env};folder:{id};config:{identifier}
```

### Configuration Parameters

| Parameter | New Format | Legacy Format | Description | Required | Example |
|-----------|------------|---------------|-------------|----------|---------|
| Destination | `destination:uipath` | `processor:uipath` | Routes to UiPath | ✅ Yes | `destination:uipath` |
| Handler | `handler:document` | `processor:document` | Processing template | ✅ Yes | `handler:document` or `handler:costco` |
| Queue | `queue:QueueName` | `uipath:QueueName` | Target queue name | ✅ Yes | `queue:Invoice_Queue` |
| Environment | `tenant:DEV` | `env:DEV` | UiPath environment | ⚠️ Recommended | `tenant:PROD` |
| Folder | `folder:277500` | `folder:277500` | Organization unit ID | ⚠️ Recommended | `folder:376892` |
| Label | `label:MyWebhook` | `config:MyWebhook` | Human-readable ID | ❌ Optional | `label:InvoiceProcessing` |

---

## Available Handlers

### 1. Document Handler

**Purpose**: Process documents from SharePoint libraries with metadata extraction.

**Activation**: `handler:document` in clientState

**Trigger Condition**: Any document change (upload, update, delete)

**Configuration Examples**:

```bash
# DEV Environment
destination:uipath|handler:document|queue:Invoice_Processing_Test|tenant:DEV|folder:277500|label:InvoicesDev

# PROD Environment
destination:uipath|handler:document|queue:Invoice_Processing_Queue|tenant:PROD|folder:376892|label:InvoicesProd
```

**Use Cases**:
- Invoice processing with metadata extraction
- Contract document management
- Compliance documentation archival
- Multi-format document workflows (PDF, Word, Excel)

**Payload Fields** (30+ metadata fields):
- ItemId, Title, FileName, FileSize, FileType
- Author, Editor, Created, Modified
- WebUrl, ContentType, Version
- Custom metadata columns

---

### 2. COSTCO Handler

**Purpose**: Handle COSTCO-specific routing forms with field validation.

**Activation**: `handler:costco` in clientState

**Trigger Condition**: Status = "Send Generated Form"

**Required Fields**:
- Ship To Email
- Ship Date
- Style
- PO Number

**Configuration Examples**:

```bash
# DEV Environment
destination:uipath|handler:costco|queue:COSTCO_Test_Queue|tenant:DEV|folder:277500|label:COSTCODev

# PROD Environment
destination:uipath|handler:costco|queue:COSTCO_Routing_Queue|tenant:PROD|folder:376892|label:COSTCOProd
```

**Validation Logic**:
```javascript
// Handler only processes items when:
if (item.Status === 'Send Generated Form' &&
    item.ShipToEmail && item.ShipDate && item.Style && item.PONumber) {
  // Submit to queue
}
```

**Payload Structure**:
- ItemId, Status, ShipToEmail, ShipDate, Style, PONumber
- Priority, TraffickingNumber, ShipmentDetails
- Custom COSTCO-specific fields

---

### 3. Custom Handler

**Purpose**: Implement custom business logic for specific workflows.

**Activation**: `handler:custom` in clientState

**Implementation Required**: Define in `src/shared/uipath-processor-registry.js`

**Configuration Example**:
```bash
destination:uipath|handler:custom|queue:Accounting_Research_Queue|tenant:PROD|folder:376892|label:AccountingResearch
```

See [WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md](../WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md#custom-processor-implementation) for full implementation details.

---

## Setup Examples

### Example 1: Document Processing (DEV)

**Scenario**: Test invoice processing in development environment.

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/invoice-library-id",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing_Test|tenant:DEV|folder:277500|label:InvoicesDev"
  }'
```

**What Happens**:
1. Document uploaded to SharePoint
2. Webhook triggers, handler extracts metadata
3. Item submitted to `Invoice_Processing_Test` queue
4. **Environment**: DEV (FAMBrands_RPAOPS, folder 277500)
5. Robot processes from test queue

---

### Example 2: COSTCO Routing (PROD)

**Scenario**: Production COSTCO form routing workflow.

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/DWI/COSTCO:/lists/costco-list-id",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:costco|queue:COSTCO_Routing_Queue|tenant:PROD|folder:376892|label:COSTCOInline"
  }'
```

**What Happens**:
1. User updates form, sets Status = "Send Generated Form"
2. Handler validates required fields
3. Item submitted to `COSTCO_Routing_Queue`
4. **Environment**: PROD (FAMBrands_RPAOPS_PROD, folder 376892)
5. Robot generates and emails form

---

### Example 3: Multi-Environment Strategy

**Scenario**: Same list with different environments for different users.

```bash
# Test Webhook (DEV)
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/invoice-library-id",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500|label:TestInvoices"
  }'

# Production Webhook (PROD)
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/invoice-library-id",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Production_Queue|tenant:PROD|folder:376892|label:ProductionInvoices"
  }'
```

**Result**: Both webhooks monitor the same list, but route to different environments based on configuration.

---

## Testing UiPath Integration

### Test Function Endpoint

The system provides a dedicated test endpoint:

**URL**: `/api/uipath-test?code=<FUNCTION_KEY>`

**Available Tests**:

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `test=auth` | Test UiPath authentication | Verifies token acquisition |
| `test=queue` | Test queue submission | Submits test item to default queue |
| `test=costco` | Test COSTCO handler | Validates COSTCO processing logic |
| `test=dispatcher` | Test full workflow | End-to-end integration test |
| `test=config` | Test configuration | Validates environment variables |
| `test=all` | Run all tests | Comprehensive system validation |

**Example Usage**:
```bash
# Test authentication
curl "https://<function-app>.azurewebsites.net/api/uipath-test?code=<FUNCTION_KEY>&test=auth"

# Test queue submission
curl "https://<function-app>.azurewebsites.net/api/uipath-test?code=<FUNCTION_KEY>&test=queue"

# Run all tests
curl "https://<function-app>.azurewebsites.net/api/uipath-test?code=<FUNCTION_KEY>&test=all"
```

### End-to-End SharePoint Testing

**Testing Workflow**:

1. **Create test webhook** (use DEV environment):
   ```bash
   curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
     -H "Content-Type: application/json" \
     -d '{
       "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/test-list-id",
       "changeType": "updated",
       "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
       "clientState": "destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500|label:Testing"
     }'
   ```

2. **Make a change in SharePoint**:
   - For document handler: Upload a test document
   - For COSTCO handler: Update item with Status = "Send Generated Form"

3. **Monitor Azure Function logs**:
   ```bash
   az webapp log tail --name <function-app> --resource-group <resource-group>
   ```

4. **Check UiPath Orchestrator**:
   - Log into UiPath Cloud
   - Navigate to: Tenant → Folder (277500) → Queues → Test_Queue
   - Verify queue item appears

5. **Verify in Application Insights**:
   ```kusto
   traces
   | where timestamp > ago(10m)
   | where message contains "Successfully submitted item to UiPath queue"
   | project timestamp, message, customDimensions
   ```

---

## Monitoring and Troubleshooting

### Key Metrics to Monitor

#### Application Insights Queries

**UiPath Queue Submissions**:
```kusto
traces
| where message contains "Successfully submitted item to UiPath queue"
| extend queue = tostring(customDimensions.queue)
| extend environment = tostring(customDimensions.environment)
| summarize count() by queue, environment, bin(timestamp, 1h)
| render timechart
```

**Authentication Success Rate**:
```kusto
traces
| where message contains "UiPath" and message contains "token"
| extend success = message contains "Successfully"
| summarize SuccessRate = countif(success) * 100.0 / count() by bin(timestamp, 1h)
| render timechart
```

**Processing Errors by Handler**:
```kusto
traces
| where severityLevel >= 3
| where message contains "UiPath" or message contains "handler"
| extend handler = tostring(customDimensions.handler)
| summarize ErrorCount = count() by handler, bin(timestamp, 1d)
| render barchart
```

### Common Issues and Solutions

#### Issue 1: "Queue does not exist" Error

**Symptoms**: Error message: `Queue '{QueueName}' does not exist in folder {FolderId}`

**Diagnostic**:
```bash
# Check webhook configuration
curl "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  | jq '.subscriptions[] | {clientState}'
```

**Cause**: Queue name mismatch or queue created in wrong folder

**Solution**:
1. Log into UiPath Orchestrator
2. Navigate to specified folder (e.g., 277500 for DEV)
3. Create queue with exact name from clientState
4. Verify queue name matches exactly (case-sensitive)

---

#### Issue 2: Wrong Environment (DEV vs PROD)

**Symptoms**: Items appear in DEV queue instead of PROD (or vice versa)

**Diagnostic**:
```bash
# Check Application Insights for environment routing
az monitor app-insights query \
  --app <app-insights-name> \
  --analytics-query "traces | where message contains 'UiPath environment' | project timestamp, customDimensions"
```

**Cause**: Incorrect `tenant:` or `folder:` parameter

**Solution**:
```bash
# Verify environment parameters
# DEV: tenant:DEV, folder:277500
# PROD: tenant:PROD, folder:376892

# Update webhook with correct configuration
curl -X DELETE "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>&subscriptionId=<webhook-id>"

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

#### Issue 3: Authentication Failures

**Symptoms**: 401 Unauthorized errors in logs

**Diagnostic**:
```bash
# Test authentication directly
curl "https://<function-app>.azurewebsites.net/api/uipath-test?code=<FUNCTION_KEY>&test=auth"
```

**Cause**: Expired client secret or incorrect credentials

**Solution**:
1. **Rotate UiPath Client Secret**:
   - Log into UiPath Cloud
   - Navigate to Admin → External Applications
   - Regenerate client secret

2. **Update Function App Settings**:
   ```bash
   az functionapp config appsettings set \
     --name <function-app> \
     --resource-group <resource-group> \
     --settings UIPATH_CLIENT_SECRET="<NEW_SECRET>"
   ```

3. **Restart Function App**:
   ```bash
   az functionapp restart --name <function-app> --resource-group <resource-group>
   ```

---

#### Issue 4: Item Not Processed

**Symptoms**: Webhook triggers but no queue item created

**Diagnostic Steps**:

1. **Check Handler Trigger Conditions**:
   - **Document handler**: Processes all changes
   - **COSTCO handler**: Requires Status = "Send Generated Form"
   - **Custom handler**: Check implementation conditions

2. **Review Logs**:
   ```kusto
   traces
   | where timestamp > ago(10m)
   | where message contains "shouldProcessItem" or message contains "Skipping item"
   | project timestamp, message, customDimensions
   ```

3. **Verify Required Fields**:
   - COSTCO handler requires: Ship To Email, Ship Date, Style, PO Number
   - Check item has all required fields populated

**Solution**: Ensure trigger conditions are met or adjust handler logic.

---

### Performance Considerations

#### Token Caching

The system implements token caching to reduce authentication overhead:

```javascript
// Enabled by default
ENABLE_TOKEN_CACHE=true

// Tokens cached in memory for duration of token lifetime (typically 1 hour)
// Reduces API calls to UiPath authentication endpoint
```

#### Retry Logic

Automatic retry with exponential backoff for transient failures:

```javascript
// Configurable retry behavior
UIPATH_AUTO_RETRY=true

// Retries: 3 attempts
// Delay: 1s, 2s, 4s (exponential backoff)
```

#### Async Processing

Background operations prevent webhook timeouts:

```javascript
// Notification count updates happen asynchronously
// SharePoint receives 200 OK immediately
// Processing continues in background
```

---

## Security Best Practices

### Credential Management

1. **Use Azure Key Vault**: Store UiPath credentials in Key Vault
   ```bash
   # Reference secrets from Key Vault
   UIPATH_CLIENT_SECRET=@Microsoft.KeyVault(SecretUri=https://keyvault.vault.azure.net/secrets/UiPathClientSecret/)
   ```

2. **Rotate Credentials Regularly**: Update client secrets every 90 days

3. **Principle of Least Privilege**: Grant only required permissions
   - UiPath API: `OR.Queues` scope (queue operations only)
   - SharePoint: `Sites.Read.All` (read access only)

### Network Security

1. **HTTPS Only**: All API calls use TLS encryption
2. **IP Whitelisting**: Restrict UiPath Orchestrator access to Azure Function IPs
3. **Managed Identity**: Use Azure Managed Identity for Azure resource access

### Input Validation

All inputs validated before processing:
- ClientState format validation
- Field presence and type checking
- Queue name sanitization
- Environment parameter validation

---

## Migration from Legacy Format

### Format Comparison

| Component | Legacy Format | New Format |
|-----------|---------------|------------|
| Destination | `processor:uipath` | `destination:uipath` |
| Handler | `processor:document` | `handler:document` |
| Queue | `uipath:QueueName` | `queue:QueueName` |
| Environment | `env:PROD` | `tenant:PROD` |
| Folder | `folder:376892` | `folder:376892` |
| Label | `config:Label` | `label:Label` |
| Separator | `;` (semicolon) | `|` (pipe) |

### Migration Steps

1. **Identify Legacy Webhooks**:
   ```bash
   curl "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
     | jq '.subscriptions[] | select(.clientState | contains("processor:uipath"))'
   ```

2. **Convert Format**:
   ```bash
   # Legacy:
   processor:uipath;processor:document;uipath:Invoice_Queue;env:PROD;folder:376892;config:Invoices

   # New:
   destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892|label:Invoices
   ```

3. **Update Webhook**:
   ```bash
   # Delete old webhook
   curl -X DELETE "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>&subscriptionId=<webhook-id>"

   # Create new webhook with updated format
   curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
     -H "Content-Type: application/json" \
     -d '{
       "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/listId",
       "changeType": "updated",
       "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
       "clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892|label:Invoices"
     }'
   ```

4. **Test Migration**: Verify webhook processes items correctly

> **Note**: Both formats are supported. Migration can be done gradually without disrupting existing webhooks.

---

## 📚 Related Documentation

### Core Guides
- **[Quick Start: Document Processor](../QUICK_START_DOCUMENT_PROCESSOR.md)** - Fast setup for document processing
- **[Webhook Setup Guide](../WEBHOOK_SETUP_GUIDE.md)** - Comprehensive webhook configuration
- **[Complete Webhook to Queue Guide](../WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)** - Full technical documentation
- **[Visitor Onboarding Guide](../VISITOR_ONBOARDING_GUIDE.md)** - New user orientation

### Reference Documentation
- **[Documentation Index](../INDEX.md)** - Complete documentation hub
- **[Enhanced Forwarding API](../../api/ENHANCED_FORWARDING.md)** - Change detection details

---

## Quick Reference

### Environment Presets

| Environment | Tenant Name | Folder ID | Typical Queues |
|-------------|-------------|-----------|----------------|
| **DEV** | FAMBrands_RPAOPS | 277500 | test_webhook, Invoice_Processing_Test, Test_Queue |
| **PROD** | FAMBrands_RPAOPS_PROD | 376892 | Invoice_Queue, COSTCO_Routing_Queue, Production_Queue |

### ClientState Templates

```bash
# Document processing (DEV)
destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500|label:TestDocs

# Document processing (PROD)
destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892|label:Invoices

# COSTCO routing (PROD)
destination:uipath|handler:costco|queue:COSTCO_Queue|tenant:PROD|folder:376892|label:COSTCO

# Custom handler
destination:uipath|handler:custom|queue:Custom_Queue|tenant:PROD|folder:376892|label:CustomFlow
```

---

*Last Updated: December 2025 | Version 3.0*
