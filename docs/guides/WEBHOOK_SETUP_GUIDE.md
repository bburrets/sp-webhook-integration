# Complete Webhook Setup Guide

This guide walks through the complete process of setting up SharePoint webhooks for various use cases: external forwarding, UiPath queue integration, and enhanced change detection.

## Prerequisites

- Azure Function App deployed and running
- SharePoint site with appropriate permissions
- Azure Storage Account configured (for change detection)
- Function key for API authentication
- For UiPath integration: Orchestrator access credentials

## Table of Contents

1. [Understanding Webhook Destinations](#understanding-webhook-destinations)
2. [Setting Up External Forwarding](#setting-up-external-forwarding)
3. [Setting Up UiPath Integration](#setting-up-uipath-integration)
4. [Webhook Management](#webhook-management)
5. [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)

---

## Understanding Webhook Destinations

SharePoint webhooks in this system can route notifications to different **destinations**, each with specific **handlers** for processing.

### Destination Types

| Destination | Purpose | Use Cases |
|-------------|---------|-----------|
| **forward** | Send to external URL | Teams/Slack notifications, external monitoring, custom webhooks |
| **uipath** | Submit to UiPath queue | Document processing, form routing, business process automation |
| **none** | Monitor only | Audit logging, state tracking, no external action |

### Handler Types (for UiPath destination)

| Handler | Purpose | Typical Use |
|---------|---------|-------------|
| **document** | Process documents with metadata | Invoice processing, contract management, document archival |
| **costco** | COSTCO routing forms | Specific COSTCO workflow processing |
| **custom** | Custom business logic | Department-specific workflows, custom validations |

### Configuration Format

**New Format** (Current):
```
destination:forward|url:https://example.com/webhook|changeDetection:enabled
destination:uipath|handler:document|queue:QueueName|tenant:DEV|folder:277500|label:MyWebhook
```

**Legacy Format** (Still Supported):
```
forward:https://example.com/webhook;mode:withChanges
processor:uipath;processor:document;uipath:QueueName;env:DEV;folder:277500;config:MyWebhook
```

> **Note**: The system supports both formats for backward compatibility. New webhooks should use the new format.

---

## Setting Up External Forwarding

External forwarding sends SharePoint change notifications to any HTTPS endpoint you specify.

### Step 1: Choose Your Change Detection Level

#### Simple Forwarding
Just forwards basic notification without fetching item data:
```
destination:forward|url:https://your-endpoint.com/webhook
```

**What You Receive**:
```json
{
  "subscriptionId": "abc-123",
  "resource": "sites/.../lists/...",
  "changeType": "updated",
  "resourceData": {
    "id": "15"
  }
}
```

#### With Current State
Fetches and includes the current state of the changed item:
```
destination:forward|url:https://your-endpoint.com/webhook|includeData:true
```

**What You Receive**:
```json
{
  "subscriptionId": "abc-123",
  "resource": "sites/.../lists/...",
  "changeType": "updated",
  "resourceData": {
    "id": "15"
  },
  "currentState": {
    "ID": "15",
    "Title": "Purchase Order #12345",
    "Status": "Approved",
    "Modified": "2025-12-10T15:30:00Z",
    // ... all item fields
  }
}
```

#### With Change Detection (Recommended)
Includes current state, previous state, and what specifically changed:
```
destination:forward|url:https://your-endpoint.com/webhook|changeDetection:enabled
```

**What You Receive**:
```json
{
  "subscriptionId": "abc-123",
  "resource": "sites/.../lists/...",
  "changeType": "updated",
  "resourceData": {
    "id": "15"
  },
  "currentState": {
    "ID": "15",
    "Title": "Purchase Order #12345",
    "Status": "Approved",
    "Modified": "2025-12-10T15:30:00Z"
  },
  "previousState": {
    "ID": "15",
    "Title": "Purchase Order #12345",
    "Status": "Pending",
    "Modified": "2025-12-09T10:00:00Z"
  },
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
          "old": "2025-12-09T10:00:00Z",
          "new": "2025-12-10T15:30:00Z"
        }
      }
    }
  }
}
```

### Step 2: Create the Webhook

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/<tenant>.sharepoint.com:/sites/<site>:/lists/<listId>",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:forward|url:https://your-endpoint.com/webhook|changeDetection:enabled"
  }'
```

**Response Example**:
```json
{
  "id": "16fb8419-87f8-4046-af0b-42def1c0ec0c",
  "resource": "sites/tenant.sharepoint.com:/sites/mysite:/lists/listId",
  "changeType": "updated",
  "clientState": "destination:forward|url:https://your-endpoint.com/webhook|changeDetection:enabled",
  "notificationUrl": "https://function-app.azurewebsites.net/api/webhook-handler",
  "expirationDateTime": "2025-12-13T04:40:17.081Z",
  "description": "Forward to external endpoint with change detection"
}
```

### Step 3: Initialize Item States (For Change Detection)

**Important**: This step prevents empty change notifications on the first modification of existing items.

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/initialize-item-states?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/<tenant>.sharepoint.com:/sites/<site>:/lists/<listId>"
  }'
```

**Response**:
```json
{
  "success": true,
  "message": "Initialized states for 84 items out of 89 total",
  "resource": "sites/tenant.sharepoint.com:/sites/mysite:/lists/listId"
}
```

### Step 4: Test Your Webhook

1. **Get a test endpoint** from [webhook.site](https://webhook.site)
2. **Create webhook** pointing to your unique webhook.site URL
3. **Make a change** in SharePoint (edit an item)
4. **Watch the notification** appear on webhook.site

---

## Setting Up UiPath Integration

UiPath integration automatically submits items from SharePoint lists to UiPath Orchestrator queues for robotic process automation.

### Understanding UiPath Environments

Your organization likely has multiple UiPath environments:

| Environment | Tenant Name | Folder ID | Purpose |
|-------------|-------------|-----------|---------|
| **Development** | FAMBrands_RPAOPS | 277500 | Testing and development |
| **Production** | FAMBrands_RPAOPS_PROD | 376892 | Live business processes |

> **Important**: Queue names must exist in the specified folder before creating the webhook.

### Configuration Components

When setting up UiPath integration, you'll specify:

| Component | Parameter | Description | Required | Example |
|-----------|-----------|-------------|----------|---------|
| Destination | `destination:uipath` | Routes to UiPath | ✅ Yes | `destination:uipath` |
| Handler | `handler:document` | Processing template | ✅ Yes | `handler:document` or `handler:costco` |
| Queue Name | `queue:QueueName` | Target Orchestrator queue | ✅ Yes | `queue:Invoice_Processing_Queue` |
| Environment | `tenant:DEV` or `tenant:PROD` | Which UiPath tenant | ⚠️ Recommended | `tenant:PROD` |
| Folder | `folder:277500` | Organization unit ID | ⚠️ Recommended | `folder:376892` |
| Label | `label:MyWebhook` | Human-readable identifier | ❌ Optional | `label:AccountingInvoices` |

### Example 1: Document Processing (DEV Environment)

**Use Case**: Process invoices uploaded to SharePoint document library in development environment.

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

**What Happens**:
1. User uploads invoice to SharePoint
2. Webhook triggers notification
3. Document processor extracts 30+ metadata fields
4. Item submitted to `Invoice_Processing_Test` queue in DEV environment (folder 277500)
5. Robot picks up queue item and processes invoice

**Queue Item Payload**:
```json
{
  "ItemId": "19",
  "Title": "Invoice_2025.pdf",
  "WebUrl": "https://tenant.sharepoint.com/.../Invoice_2025.pdf",
  "FileName": "Invoice_2025.pdf",
  "FileSize": "959868",
  "ContentType": "Document",
  "Author": "user@company.com",
  "Modified": "2025-12-10T15:34:50Z",
  "Created": "2025-07-16T23:00:20Z",
  "DocIcon": "pdf",
  "Version": "11.0"
  // ... 20+ additional metadata fields
}
```

### Example 2: COSTCO Form Routing (PROD Environment)

**Use Case**: Route COSTCO trafficking forms to production automation when status changes to "Send Generated Form".

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

**What Happens**:
1. User updates COSTCO form, sets Status = "Send Generated Form"
2. COSTCO processor validates required fields (Ship To Email, Ship Date, Style, PO Number)
3. Item submitted to `COSTCO_Routing_Queue` in PROD environment (folder 376892)
4. Robot generates form and emails to recipient

**Queue Item Payload**:
```json
{
  "ItemId": "123",
  "Status": "Send Generated Form",
  "ShipToEmail": "warehouse@costco.com",
  "ShipDate": "2025-12-15",
  "Style": "PROD-12345",
  "PONumber": "PO-98765",
  "Priority": "High"
  // ... COSTCO-specific fields
}
```

### Example 3: Custom Handler with Specific Conditions

**Use Case**: Process accounting research requests only when status is "Approved" and amount exceeds $10,000.

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/research-list-id",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:custom|queue:Accounting_Research_Queue|tenant:PROD|folder:376892|label:AccountingResearch"
  }'
```

> **Note**: Custom handlers require code implementation in `src/templates/`. See [WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md) for custom handler development.

### Environment Configuration Override

If webhook-specific environment differs from default configuration:

```bash
# Webhook uses PROD environment, but function defaults to DEV
"clientState": "destination:uipath|handler:document|queue:Production_Queue|tenant:PROD|folder:376892|label:ProdInvoices"
```

The webhook will:
1. Override default environment variables
2. Connect to PROD tenant (FAMBrands_RPAOPS_PROD)
3. Use folder 376892
4. Submit to `Production_Queue`

---

## Webhook Management

### List Active Webhooks

```bash
curl -X GET "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Accept: application/json"
```

**Response**:
```json
{
  "subscriptions": [
    {
      "id": "16fb8419-87f8-4046-af0b-42def1c0ec0c",
      "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/...",
      "clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892",
      "expirationDateTime": "2025-12-13T04:40:17Z",
      "notificationUrl": "https://function-app.azurewebsites.net/api/webhook-handler"
    }
  ]
}
```

### Update an Existing Webhook

To modify configuration (e.g., change queue name, switch environments):

```bash
# Delete old webhook
curl -X DELETE "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>&subscriptionId=16fb8419-87f8-4046-af0b-42def1c0ec0c"

# Create new webhook with updated configuration
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/...",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:New_Queue_Name|tenant:PROD|folder:376892"
  }'
```

### Sync Webhooks to Tracking List

The system maintains a SharePoint tracking list for monitoring webhook health:

```bash
curl -X POST "https://<function-app>.azurewebsites.net/api/webhook-sync?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**What This Does**:
- Retrieves all active webhooks from Microsoft Graph API
- Syncs to SharePoint tracking list
- Updates notification counts
- Renews webhooks expiring within 24 hours

### Webhook Auto-Renewal

Webhooks automatically renew every hour via timer function:
- **Renewal Trigger**: Webhooks expiring within 24 hours
- **New Expiration**: 3 days from renewal time (SharePoint maximum)
- **Failed Renewals**: Logged to Application Insights

Manual renewal: Use the `webhook-sync` endpoint shown above.

---

## Monitoring and Troubleshooting

### Best Practices

1. **Always Initialize States**: Run `initialize-item-states` when setting up webhooks on existing lists with change detection
2. **Use Descriptive Labels**: Include `label:` parameter for easy identification
3. **Test in DEV First**: Create webhooks with `tenant:DEV` before moving to production
4. **Monitor Expiration**: Check tracking list regularly for upcoming expirations
5. **Validate Queue Names**: Ensure queue exists in target folder before creating webhook
6. **Use HTTPS Endpoints**: Always use secure URLs for external forwarding

### Common Issues and Solutions

#### Issue 1: Empty Changes on First Notification

**Symptoms**: Change detection shows `isFirstTimeTracking: true` with no details.

**Cause**: No previous state exists for comparison.

**Solution**:
```bash
# Initialize states after webhook creation
curl -X POST "https://<function-app>.azurewebsites.net/api/initialize-item-states?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/listId"
  }'
```

#### Issue 2: UiPath Queue Items Not Created

**Symptoms**: Webhook triggers but no items appear in UiPath queue.

**Checks**:
1. **Verify Configuration**:
   ```bash
   # List webhooks and check clientState
   curl "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>"
   ```
   Ensure `destination:uipath` is present.

2. **Check Queue Exists**:
   - Log into UiPath Orchestrator
   - Navigate to specified folder (e.g., 376892 for PROD)
   - Verify queue name matches exactly

3. **Verify Environment**:
   ```bash
   # Check Azure Function configuration
   az functionapp config appsettings list \
     --name <function-app> \
     --resource-group <resource-group> \
     --query "[?name=='UIPATH_TENANT_NAME'].value"
   ```

4. **Review Trigger Conditions**:
   - **Document handler**: Triggers on any document change
   - **COSTCO handler**: Requires `Status = "Send Generated Form"`
   - **Custom handler**: Check implementation-specific conditions

**Solution**: Update webhook with correct configuration or create missing queue.

#### Issue 3: Wrong UiPath Environment

**Symptoms**: Items go to DEV queue instead of PROD (or vice versa).

**Cause**: Incorrect `tenant:` or `folder:` parameter in clientState.

**Solution**:
```bash
# Delete incorrect webhook
curl -X DELETE "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>&subscriptionId=<webhook-id>"

# Create with correct environment
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/listId",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:QueueName|tenant:PROD|folder:376892"
  }'
```

#### Issue 4: No Notifications Received

**Checks**:
1. **Verify Webhook Active**:
   ```bash
   curl "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>"
   ```
   Look for your webhook in the response.

2. **Check Expiration Date**: Webhooks expire after 3 days if not renewed.

3. **Verify SharePoint Permissions**: Ensure app registration has `Sites.Read.All` permission.

4. **Review Azure Function Logs**:
   ```bash
   az webapp log tail --name <function-app> --resource-group <resource-group>
   ```

**Solution**: Recreate webhook if expired, check permissions if active.

#### Issue 5: Webhook Creation Fails

**Error**: `400 Bad Request` or `403 Forbidden`

**Checks**:
1. **Notification URL Accessible**: Ensure URL is publicly reachable (Azure Function not behind firewall)
2. **Resource Path Format**: Verify format: `sites/<tenant>.sharepoint.com:/sites/<site>:/lists/<listId>`
3. **SharePoint Permissions**: App registration needs `Sites.ReadWrite.All` for webhook creation
4. **Function Key Valid**: Check function key hasn't rotated

**Solution**: Correct resource path format, verify permissions, update function key.

#### Issue 6: Authentication Failures (401/403)

**Symptoms**: Logs show "Authentication failed" or "Access denied" errors.

**Checks**:
1. **Azure AD Configuration**:
   ```bash
   # Verify client credentials
   az functionapp config appsettings list \
     --name <function-app> \
     --resource-group <resource-group> \
     --query "[?starts_with(name, 'AZURE_')].{name:name,value:value}"
   ```

2. **UiPath Credentials**:
   ```bash
   # Test UiPath authentication
   curl -X POST "https://account.uipath.com/oauth/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&scope=OR.Queues"
   ```

**Solution**: Rotate expired credentials, verify scopes match requirements.

### Monitoring with Application Insights

**Query: Recent Webhook Activity**
```kusto
traces
| where timestamp > ago(1h)
| where message contains "webhook-handler" or message contains "subscription-manager"
| order by timestamp desc
| limit 50
```

**Query: UiPath Queue Submissions**
```kusto
traces
| where message contains "Successfully submitted item to UiPath queue"
| summarize count() by bin(timestamp, 1h)
| render timechart
```

**Query: Processing Errors**
```kusto
traces
| where severityLevel >= 3
| where message contains "UiPath" or message contains "webhook"
| project timestamp, message, customDimensions
| order by timestamp desc
```

---

## Complete Examples

### Example 1: Teams/Slack Notification

```bash
# Get unique webhook.site URL: https://webhook.site/abc-123

curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Projects:/lists/project-list-id",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:forward|url:https://webhook.site/abc-123|changeDetection:enabled"
  }'
```

**Result**: Every project update sends notification with change details to Teams/Slack via webhook integration.

### Example 2: Development Testing Workflow

```bash
# Step 1: Create DEV webhook
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/DWI:/lists/test-list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500|label:TestingWebhook"
  }'

# Step 2: Test in SharePoint (upload document)

# Step 3: Verify in UiPath Orchestrator DEV environment

# Step 4: When ready, promote to PROD
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/DWI:/lists/prod-list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Production_Queue|tenant:PROD|folder:376892|label:ProductionWebhook"
  }'
```

### Example 3: Hybrid Monitoring and Processing

```bash
# Monitor changes AND send to UiPath (two destinations)
curl -X POST "https://<function-app>.azurewebsites.net/api/subscription-manager?code=<FUNCTION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/invoice-list-id",
    "changeType": "updated",
    "notificationUrl": "https://<function-app>.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892;destination:forward|url:https://monitoring.example.com/webhook|changeDetection:enabled"
  }'
```

**Result**: Each invoice upload:
1. Submits to UiPath `Invoice_Queue` for processing
2. Sends change notification to monitoring system

---

## Security Considerations

### Function Key Management

1. **Rotate Keys Regularly**: Use Azure Portal to rotate function keys monthly
2. **Use Named Keys**: Create separate keys for different consumers
3. **Revoke Compromised Keys**: Immediately revoke if key is exposed

```bash
# List function keys
az functionapp function keys list \
  --name <function-app> \
  --resource-group <resource-group> \
  --function-name subscription-manager

# Delete compromised key
az functionapp function keys delete \
  --name <function-app> \
  --resource-group <resource-group> \
  --function-name subscription-manager \
  --key-name compromised-key
```

### Endpoint Security

1. **HTTPS Only**: Always use HTTPS for forwarding URLs
2. **Validate Payloads**: Implement signature validation on receiving endpoints
3. **Rate Limiting**: Protect endpoints from notification floods
4. **IP Whitelisting**: Restrict access to Azure Function IP ranges

### Secret Management

1. **Use Key Vault**: Store UiPath credentials in Azure Key Vault
2. **Managed Identity**: Use managed identity for Azure resource access
3. **No Hardcoded Secrets**: Never commit credentials to source control
4. **Environment Variables**: Store all secrets as Function App settings

---

## 📚 Additional Documentation

### UiPath Integration
- **[Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)** - Comprehensive guide for UiPath integration
- **[Quick Start: Document Processor](./QUICK_START_DOCUMENT_PROCESSOR.md)** - Fast setup for document processing
- **[UiPath Main Guide](./uipath/main-guide.md)** - UiPath-specific configuration details

### Production Deployment
- **[Production Scaling Guide](./PRODUCTION_SCALING_GUIDE.md)** - Enterprise scaling strategies
- **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Azure deployment procedures

### Reference Documentation
- **[Documentation Index](./INDEX.md)** - Complete documentation hub
- **[Function Reference](../api/FUNCTION_REFERENCE.md)** - API documentation
- **[Enhanced Forwarding API](../api/ENHANCED_FORWARDING.md)** - Change detection details

---

## Quick Reference: ClientState Formats

### External Forwarding
```bash
# Simple
destination:forward|url:https://example.com/webhook

# With data
destination:forward|url:https://example.com/webhook|includeData:true

# With change detection
destination:forward|url:https://example.com/webhook|changeDetection:enabled
```

### UiPath Integration
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

### Hybrid (Multiple Destinations)
```bash
# UiPath + External monitoring
destination:uipath|handler:document|queue:Queue1|tenant:PROD|folder:376892;destination:forward|url:https://monitor.com/webhook
```

---

*Last Updated: December 2025 | Version 3.0*
