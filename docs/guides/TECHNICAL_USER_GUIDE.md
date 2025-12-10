# SharePoint Webhooks Technical User Guide

**Audience:** Technical users, automation engineers, business analysts with technical background
**Purpose:** Comprehensive guide for configuring and managing SharePoint webhooks with UiPath integration
**Level:** Technical but accessible - bridges user-friendly guidance with technical depth

---

## Welcome

This guide helps you configure, manage, and troubleshoot SharePoint webhooks that automatically process list/library changes. Whether you're routing notifications to external systems, processing documents with UiPath robots, or tracking changes for compliance, this guide provides everything you need.

### What You'll Learn

- ✅ How to create webhooks for any SharePoint list or library
- ✅ Route notifications to external services (Teams, Slack, custom endpoints)
- ✅ Integrate with UiPath for automated document and form processing
- ✅ Configure multi-environment workflows (DEV/PROD)
- ✅ Monitor webhook health and troubleshoot issues
- ✅ Implement production-ready configurations

### Prerequisites

Before you begin, ensure you have:
- **SharePoint Access**: Site owner or appropriate permissions
- **Azure Access**: Function App admin access for configuration
- **UiPath Access** (if applicable): Orchestrator access with queue management permissions
- **Basic Command Line**: Ability to run bash/PowerShell commands
- **API Testing Tool**: Postman, cURL, or similar (optional but recommended)

---

## Table of Contents

### Part 1: Foundation
1. [Understanding the System](#part-1-understanding-the-system)
2. [Key Concepts](#key-concepts)
3. [Architecture Overview](#architecture-overview)

### Part 2: Getting Started
4. [Quick Start: Your First Webhook](#part-2-quick-start-your-first-webhook)
5. [Configuration Basics](#configuration-basics)
6. [Finding Your SharePoint Resource](#finding-your-sharepoint-resource)

### Part 3: Webhook Destinations
7. [Monitoring Without Actions](#monitoring-without-actions)
8. [Forwarding to External Services](#forwarding-to-external-services)
9. [UiPath Queue Integration](#uipath-queue-integration)

### Part 4: UiPath Deep Dive
10. [Understanding UiPath Handlers](#understanding-uipath-handlers)
11. [Multi-Environment Configuration](#multi-environment-configuration)
12. [Document Processing Workflows](#document-processing-workflows)
13. [Business Process Automation](#business-process-automation)

### Part 5: Management & Operations
14. [Managing Active Webhooks](#managing-active-webhooks)
15. [Monitoring and Health Checks](#monitoring-and-health-checks)
16. [Understanding Auto-Renewal](#understanding-auto-renewal)

### Part 6: Advanced Features
17. [Change Detection](#change-detection)
18. [Hybrid Processing](#hybrid-processing)
19. [Custom Business Logic](#custom-business-logic)

### Part 7: Troubleshooting
20. [Common Issues and Solutions](#common-issues-and-solutions)
21. [Diagnostic Commands](#diagnostic-commands)
22. [When to Escalate](#when-to-escalate)

### Part 8: Best Practices
23. [Production Deployment Checklist](#production-deployment-checklist)
24. [Security Considerations](#security-considerations)
25. [Performance Optimization](#performance-optimization)

---

# Part 1: Understanding the System

## What Are SharePoint Webhooks?

SharePoint webhooks are real-time notifications that fire when items change in a SharePoint list or library. Instead of polling SharePoint every few minutes to check for changes, webhooks push notifications to your system within 1-2 seconds of a change occurring.

### Real-World Analogy

Think of webhooks like a doorbell:
- **Without webhooks**: You check the door every 5 minutes to see if anyone arrived (polling)
- **With webhooks**: The doorbell rings immediately when someone arrives (push notification)

### What This System Does

Our webhook system acts as the "doorbell receiver" that:
1. ✅ **Receives** notifications from SharePoint
2. 🎯 **Routes** them to the right destination
3. 🔧 **Processes** the data using predefined handlers
4. 📊 **Delivers** to external services or UiPath queues
5. 📝 **Tracks** all activity for monitoring

---

## Key Concepts

### 1. Destinations

**Where notifications go** after being received.

| Destination | What It Does | Use When |
|-------------|--------------|----------|
| **none** | Just count and log | You want to monitor notification volume |
| **forward** | Send to external URL | Integrating with Teams, Slack, or custom webhook |
| **uipath** | Send to UiPath queue | Automating business processes with robots |

**Example**:
```bash
# Just monitor (no action)
(no clientState needed)

# Send to Teams
destination:forward|url:https://outlook.office.com/webhook/...

# Process with UiPath
destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD
```

---

### 2. Handlers (for UiPath destination)

**How data is processed** before sending to UiPath.

| Handler | Purpose | Best For |
|---------|---------|----------|
| **document** | Extract document metadata | Document libraries, file processing |
| **costco** | COSTCO-specific validation | COSTCO routing forms |
| **custom** | Your business logic | Department-specific workflows |

**Think of handlers as templates**:
- They define what data to extract
- They validate required fields
- They determine when to process (trigger conditions)
- They format data for UiPath robots

---

### 3. Environments (UiPath)

**Which UiPath tenant** to send queue items to.

| Environment | Purpose | Typical Use |
|-------------|---------|-------------|
| **DEV** | Testing, development | Validating new workflows before production |
| **PROD** | Live business processes | Running production automation |

**Your Organization's Environments**:

```
DEV Environment:
├── Tenant: FAMBrands_RPAOPS
├── Folder: 277500
└── URL: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_

PROD Environment:
├── Tenant: FAMBrands_RPAOPS_PROD
├── Folder: 376892
└── URL: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_
```

---

### 4. ClientState Configuration

**The "recipe" that tells the system what to do** with notifications.

**Format**:
```
destination:{target}|handler:{template}|queue:{name}|tenant:{env}|folder:{id}|label:{identifier}
```

**Components**:
- `destination` = Where to send (forward, uipath, none)
- `handler` = How to process (document, costco, custom) - only for uipath
- `queue` = Which UiPath queue - only for uipath
- `tenant` = Which environment (DEV, PROD) - only for uipath
- `folder` = Organization unit ID - only for uipath
- `label` = Human-readable name (optional)

**Examples**:

```bash
# External forwarding
destination:forward|url:https://webhook.site/abc123

# Document processing in DEV
destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500

# Document processing in PROD
destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892

# COSTCO routing in PROD
destination:uipath|handler:costco|queue:COSTCO_Queue|tenant:PROD|folder:376892
```

---

## Architecture Overview

### System Flow

```
┌─────────────────────┐
│  SharePoint List    │  User uploads document or updates item
│  or Library        │
└──────────┬──────────┘
           │
           ↓ (Change detected - webhook fires in 1-2 seconds)
           │
┌──────────┴──────────┐
│  SharePoint         │  Sends notification with item ID
│  Webhook System     │
└──────────┬──────────┘
           │
           ↓ (Notification sent to Azure Function)
           │
┌──────────┴──────────┐
│  Azure Function:    │  Receives notification
│  webhook-handler    │  Parses clientState configuration
└──────────┬──────────┘
           │
           ├─────────────────┬──────────────────┬──────────────────┐
           ↓                 ↓                  ↓                  ↓
    ┌──────────┐     ┌──────────┐      ┌──────────┐      ┌──────────┐
    │ None     │     │ Forward  │      │ UiPath   │      │ UiPath   │
    │ (Monitor)│     │ (External│      │ Document │      │ COSTCO   │
    └──────────┘     │  URL)    │      │ Handler  │      │ Handler  │
                     └────┬─────┘      └────┬─────┘      └────┬─────┘
                          │                 │                  │
                          ↓                 ↓                  ↓
                   ┌──────────┐      ┌──────────┐      ┌──────────┐
                   │ Teams/   │      │ Extract  │      │ Validate │
                   │ Slack/   │      │ Metadata │      │ Fields   │
                   │ Custom   │      │ (37+     │      │ (Status, │
                   │ Webhook  │      │ fields)  │      │ Email,   │
                   └──────────┘      └────┬─────┘      │ Date...) │
                                          │            └────┬─────┘
                                          ↓                 ↓
                                   ┌──────────────────────────┐
                                   │    UiPath Orchestrator   │
                                   │    (DEV or PROD)         │
                                   └────────┬─────────────────┘
                                            │
                                            ↓
                                   ┌──────────────────────────┐
                                   │    Queue Item Created    │
                                   │    Robot Picks Up Work   │
                                   └──────────────────────────┘
```

### Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Webhook Handler** | Receives all SharePoint notifications | Azure Function App |
| **Processor Registry** | Routes to appropriate handler | Backend logic |
| **Document Handler** | Extracts metadata from documents | Processing template |
| **COSTCO Handler** | Validates COSTCO forms | Processing template |
| **UiPath Client** | Submits items to Orchestrator | Backend logic |
| **Tracking List** | Monitors webhook health | SharePoint list |

---

# Part 2: Quick Start: Your First Webhook

Let's create your first webhook step-by-step. This example will monitor a SharePoint list and forward notifications to a test endpoint.

## Step 1: Get Your Function Keys

Function keys protect your webhook management endpoints. You'll need two keys:

```bash
# Get subscription-manager key (for creating/managing webhooks)
az functionapp function keys list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --function-name subscription-manager \
  --query default -o tsv

# Get webhook-sync key (for manual sync operations)
az functionapp function keys list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --function-name webhook-sync \
  --query default -o tsv
```

**Save these keys** - you'll use them in every API call.

> 💡 **Tip**: Store keys in environment variables for easier command line use:
> ```bash
> export WEBHOOK_MANAGER_KEY="your-subscription-manager-key"
> export WEBHOOK_SYNC_KEY="your-webhook-sync-key"
> ```

---

## Step 2: Find Your SharePoint List/Library

You need the **resource path** for your SharePoint list or library. This identifies exactly what to monitor.

### Option A: Use the Discovery Tool

```bash
# Set environment variables
export AZURE_CLIENT_ID="your-azure-client-id"
export AZURE_CLIENT_SECRET="your-azure-client-secret"
export AZURE_TENANT_ID="your-azure-tenant-id"

# Run discovery
node discover-sharepoint-resources.js
```

### Option B: Construct Manually

**Format**: `sites/{tenant}.sharepoint.com:/sites/{siteName}:/lists/{listId}`

**Example**:
```
sites/fambrandsllc.sharepoint.com:/sites/Finance:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215
```

**To find your List ID**:
1. Navigate to your SharePoint list
2. Click Settings (gear icon) → List settings
3. Look at the URL: `...List=%7B1073e81c-e8ea-483c-ac8c-680148d9e215%7D`
4. The GUID between `%7B` and `%7D` is your list ID (remove the URL encoding)

---

## Step 3: Create Your First Webhook

### Example: Monitor List Changes

Let's start simple - just monitor a list without processing:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/YourSite:/lists/your-list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler"
  }'
```

**What this does**:
- ✅ Creates webhook subscription
- ✅ Monitors for changes (add, update, delete)
- ✅ Counts notifications
- ✅ Logs activity

**Expected Response**:
```json
{
  "id": "abc123-webhook-id",
  "resource": "sites/fambrandsllc.sharepoint.com:/sites/YourSite:/lists/your-list-id",
  "changeType": "updated",
  "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
  "expirationDateTime": "2025-12-13T15:30:00Z"
}
```

> ✅ **Success**: You should receive a JSON response with an `id` field!

---

## Step 4: Test Your Webhook

1. **Make a change** in your SharePoint list (add or edit an item)
2. **Check the logs** to verify the notification was received:

```bash
# Stream live logs
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --filter "webhook-handler"
```

You should see log entries like:
```
[webhook-handler] Received notification for subscription abc123-webhook-id
[webhook-handler] Processing change for item 15
[webhook-handler] Notification count: 1
```

---

## Step 5: Verify Webhook Is Active

List all your active webhooks:

```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | jq '.'
```

**Look for**:
- ✅ Your webhook ID in the list
- ✅ Expiration date in the future (3 days from creation)
- ✅ Correct resource path

---

## Configuration Basics

### Understanding ClientState

ClientState is **optional** configuration that tells the system what to do with notifications. If omitted, the system just monitors and counts.

**Three Scenarios**:

#### 1. No ClientState (Monitor Only)
```bash
# Omit clientState entirely
{
  "resource": "...",
  "changeType": "updated",
  "notificationUrl": "..."
}
```

#### 2. With ClientState (Forward to External URL)
```bash
{
  "resource": "...",
  "changeType": "updated",
  "notificationUrl": "...",
  "clientState": "destination:forward|url:https://your-endpoint.com/webhook"
}
```

#### 3. With ClientState (Process with UiPath)
```bash
{
  "resource": "...",
  "changeType": "updated",
  "notificationUrl": "...",
  "clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892"
}
```

---

### ClientState Parameters Reference

| Parameter | Required | Purpose | Example Values |
|-----------|----------|---------|----------------|
| `destination` | Yes | Where to route | `forward`, `uipath`, `none` |
| `handler` | When destination=uipath | Processing template | `document`, `costco`, `custom` |
| `queue` | When destination=uipath | UiPath queue name | `Invoice_Queue`, `Test_Queue` |
| `tenant` | When destination=uipath | Which environment | `DEV`, `PROD` |
| `folder` | When destination=uipath | Organization unit ID | `277500`, `376892` |
| `label` | Optional | Human-readable ID | `InvoiceProcessing`, `TestWebhook` |
| `url` | When destination=forward | Forwarding URL | `https://webhook.site/abc` |
| `changeDetection` | Optional | Include change details | `enabled` |

---

## Finding Your SharePoint Resource

### Method 1: SharePoint UI

1. **Navigate** to your list/library in SharePoint
2. **Copy the URL** from your browser
3. **Extract components**:
   - Tenant: `fambrandsllc.sharepoint.com`
   - Site: `Finance` (from URL: `/sites/Finance/`)
   - List ID: Found in List Settings URL

### Method 2: Microsoft Graph Explorer

1. Go to [Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)
2. Sign in with your account
3. Run query: `GET /sites/{tenant}.sharepoint.com:/sites/{siteName}:/lists`
4. Find your list in the response

### Method 3: Discovery Script

Use the provided discovery script (requires environment variables):

```bash
# Set credentials
export AZURE_CLIENT_ID="..."
export AZURE_CLIENT_SECRET="..."
export AZURE_TENANT_ID="..."

# Run discovery
node scripts/discover-sharepoint-resources.js
```

**Output Example**:
```
📋 Available Lists/Libraries:

1. Invoice Documents
   ID: 1073e81c-e8ea-483c-ac8c-680148d9e215
   Resource: sites/fambrandsllc.sharepoint.com:/sites/Finance:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215
   Type: Document Library
   Items: 1,245

2. Project Tasks
   ID: a347ee9b-51b8-4ae2-bdb3-ebdfae5683ae
   Resource: sites/fambrandsllc.sharepoint.com:/sites/Projects:/lists/a347ee9b-51b8-4ae2-bdb3-ebdfae5683ae
   Type: List
   Items: 89
```

---

# Part 3: Webhook Destinations

## Monitoring Without Actions

**Use Case**: Track notification volume without taking action.

**When to Use**:
- Testing webhook setup
- Monitoring list activity
- Compliance auditing
- Performance baseline

**Configuration**:
```bash
# Simply omit clientState
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler"
  }'
```

**What Happens**:
1. SharePoint sends notification
2. System logs the notification
3. Notification counter increments
4. No further processing

**Monitoring**:
```bash
# Check notification counts in SharePoint tracking list
# View logs in Application Insights
# Stream live logs to see activity
```

---

## Forwarding to External Services

**Use Case**: Send notifications to Teams, Slack, or custom webhooks.

### Simple Forwarding

Just send the basic notification:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:forward|url:https://your-endpoint.com/webhook"
  }'
```

**Payload Received**:
```json
{
  "subscriptionId": "abc-123",
  "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id",
  "changeType": "updated",
  "resourceData": {
    "id": "15"
  }
}
```

---

### Forwarding with Current State

Include the complete current item data:

```bash
"clientState": "destination:forward|url:https://your-endpoint.com/webhook|includeData:true"
```

**Payload Received**:
```json
{
  "subscriptionId": "abc-123",
  "resource": "...",
  "changeType": "updated",
  "resourceData": {
    "id": "15"
  },
  "currentState": {
    "ID": "15",
    "Title": "Purchase Order #12345",
    "Status": "Approved",
    "Amount": "50000",
    "Modified": "2025-12-10T15:30:00Z",
    "Author": { "Email": "user@company.com" }
    // ... all item fields
  }
}
```

---

### Forwarding with Change Detection (Recommended)

Include what specifically changed:

```bash
"clientState": "destination:forward|url:https://your-endpoint.com/webhook|changeDetection:enabled"
```

**Payload Received**:
```json
{
  "subscriptionId": "abc-123",
  "resource": "...",
  "currentState": {
    "ID": "15",
    "Title": "Purchase Order #12345",
    "Status": "Approved",
    "Amount": "50000"
  },
  "previousState": {
    "ID": "15",
    "Title": "Purchase Order #12345",
    "Status": "Pending",
    "Amount": "50000"
  },
  "changes": {
    "summary": {
      "modifiedFields": 1,
      "addedFields": 0,
      "removedFields": 0
    },
    "details": {
      "modified": {
        "Status": {
          "old": "Pending",
          "new": "Approved"
        }
      }
    }
  }
}
```

**Important**: Initialize item states after creating webhook:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/initialize-item-states?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id"
  }'
```

This captures the current state of all existing items so future changes can be compared.

---

### Integrating with Teams

**Microsoft Teams Incoming Webhook**:

1. In Teams, go to your channel → Connectors → Incoming Webhook
2. Configure webhook, copy URL
3. Create SharePoint webhook:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:forward|url:https://outlook.office.com/webhook/YOUR-WEBHOOK-ID|changeDetection:enabled"
  }'
```

**Result**: Teams channel receives notifications when SharePoint items change, with details about what changed.

---

### Testing with webhook.site

Before integrating with production systems, test with webhook.site:

1. Go to [webhook.site](https://webhook.site)
2. Copy your unique URL (e.g., `https://webhook.site/abc-123`)
3. Create webhook:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:forward|url:https://webhook.site/abc-123|changeDetection:enabled"
  }'
```

4. Make a change in SharePoint
5. Watch the notification appear on webhook.site immediately

---

## UiPath Queue Integration

**Use Case**: Automatically process SharePoint changes with UiPath robots.

### Understanding the Flow

```
SharePoint Change
    ↓
Webhook Notification
    ↓
Handler Processes Data
    ↓
Queue Item Created in UiPath
    ↓
Robot Picks Up and Processes
```

### Basic UiPath Configuration

**Minimum Required**:
- `destination:uipath` - Route to UiPath
- `handler:{type}` - Which processing template
- `queue:{name}` - Target queue name

**Example**:
```bash
"clientState": "destination:uipath|handler:document|queue:Invoice_Processing"
```

**Recommended** (with environment):
```bash
"clientState": "destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:376892"
```

---

### Environment Selection

**Scenario 1: Use Default Environment**
```bash
# Uses environment variables from Function App configuration
"clientState": "destination:uipath|handler:document|queue:Test_Queue"
```

**Scenario 2: Override to DEV**
```bash
# Forces DEV environment for this webhook
"clientState": "destination:uipath|handler:document|queue:Test_Queue|tenant:DEV|folder:277500"
```

**Scenario 3: Override to PROD**
```bash
# Forces PROD environment for this webhook
"clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892"
```

**Why Override?**
- Function App defaults to DEV, but this specific workflow needs PROD
- Testing in DEV before promoting to PROD
- Different workflows need different environments

---

# Part 4: UiPath Deep Dive

## Understanding UiPath Handlers

Handlers are processing templates that determine:
- ✅ **When** to process (trigger conditions)
- ✅ **What** data to extract
- ✅ **How** to validate
- ✅ **Where** to send (queue name)

---

### Document Handler

**Purpose**: Process documents from SharePoint libraries.

**Best For**:
- Invoice processing
- Contract management
- Document archival
- Receipt scanning
- Any document-based workflow

**Trigger**: Any document change (upload, update, delete)

**Configuration**:
```bash
destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:376892
```

**What Gets Extracted** (37+ fields):

```javascript
// File Information
{
  "FileName": "Invoice_2025.pdf",
  "FileSize": "959868",
  "FileType": "pdf",
  "FilePath": "/sites/Finance/Documents/Invoice_2025.pdf",
  "FileDirectory": "/sites/Finance/Documents",

  // Metadata
  "Title": "Invoice_2025.pdf",
  "ContentType": "Document",
  "Created": "2025-07-16T23:00:20Z",
  "Modified": "2025-12-10T01:34:50Z",
  "Version": "11.0",

  // Users
  "Author": "bburrets@fambrands.com",
  "Editor": "jdoe@fambrands.com",

  // URLs
  "WebUrl": "https://tenant.sharepoint.com/sites/Finance/Documents/Invoice_2025.pdf",
  "ServerUrl": "https://tenant.sharepoint.com",

  // Identifiers
  "ItemId": "19",
  "UniqueId": "b5e7f3a1-9d2c-4e8f-a1c3-7b9d4e2f6a8c",

  // Custom Fields
  "Department": "Accounting",
  "Category": "Invoices",
  "ApprovalStatus": "Approved"
  // ... any custom SharePoint columns
}
```

**Queue Item Structure**:
```json
{
  "Name": "Invoice Processing - Invoice_2025.pdf",
  "Priority": "Normal",
  "Reference": "SPDOC_Invoice_2025_pdf_19_1733850123456",
  "SpecificContent": {
    // All extracted fields above
  }
}
```

**Example Webhook**:
```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Finance:/lists/1073e81c-e8ea-483c-ac8c-680148d9e215",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:376892|label:FinanceInvoices"
  }'
```

---

### COSTCO Handler

**Purpose**: Handle COSTCO-specific routing forms with validation.

**Best For**:
- COSTCO inline routing forms
- Workflows requiring status-based triggers
- Forms with mandatory field validation

**Trigger**: Status field = "Send Generated Form"

**Configuration**:
```bash
destination:uipath|handler:costco|queue:COSTCO_Routing|tenant:PROD|folder:376892
```

**Required Fields**:
- Ship To Email
- Ship Date
- Style
- PO Number

**Validation Logic**:
```
IF Status != "Send Generated Form"
    → Skip processing (don't create queue item)

IF Status == "Send Generated Form" AND missing required fields
    → Log error, don't create queue item

IF Status == "Send Generated Form" AND all required fields present
    → Create queue item for processing
```

**What Gets Sent to Queue**:
```json
{
  "Name": "COSTCO Routing - Form 123",
  "Priority": "Normal",
  "Reference": "COSTCO_123_1733850123456",
  "SpecificContent": {
    "ItemId": "123",
    "Status": "Send Generated Form",
    "ShipToEmail": "warehouse@costco.com",
    "ShipDate": "2025-12-15",
    "Style": "PROD-12345",
    "PONumber": "PO-98765",
    "TraffickingNumber": "TRF-2025-001",
    "Priority": "High",
    "SpecialInstructions": "Handle with care"
  }
}
```

**Example Webhook**:
```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/DWI/COSTCO:/lists/a347ee9b-51b8-4ae2-bdb3-ebdfae5683ae",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:costco|queue:COSTCO_Routing_Queue|tenant:PROD|folder:376892|label:COSTCOInline"
  }'
```

**What Happens**:
1. User updates COSTCO form, sets Status = "Send Generated Form"
2. Webhook fires notification
3. Handler validates all required fields present
4. Queue item created in PROD environment
5. Robot picks up item, generates routing form PDF
6. Robot emails form to recipient from ShipToEmail field

---

### Custom Handler

**Purpose**: Implement your own business logic.

**Best For**:
- Department-specific workflows
- Complex validation rules
- Custom data transformations
- Specialized trigger conditions

**When to Use**:
- Document and COSTCO handlers don't meet your needs
- You need custom field validation
- You need to route to different queues based on conditions
- You need custom data transformation

**Implementation Required**: Custom handlers must be coded and deployed. See [Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md#custom-processor-implementation) for full implementation details.

**Example Use Cases**:

**1. Accounting Research Processor**
```
Trigger: ApprovalStatus == "Approved" AND Amount > 10000
Validation: Department, Amount, Approver, RequestDate required
Priority: High if Amount > 50000, else Normal
```

**2. HR Document Processor**
```
Trigger: DocumentType == "Employee_Record" AND Status == "Ready_for_Processing"
Validation: EmployeeID, Department, HireDate required
Route: Different queues based on Department
```

**3. Legal Contract Processor**
```
Trigger: DocumentType == "Contract" AND ApprovalStatus == "Final"
Validation: ContractValue, Parties, ExpirationDate required
Priority: Critical if ContractValue > 1M
```

**Configuration**:
```bash
destination:uipath|handler:custom|queue:Accounting_Research|tenant:PROD|folder:376892
```

---

## Multi-Environment Configuration

### Understanding Environments

Your organization has separate UiPath environments for different purposes:

**Development (DEV)**:
- **Purpose**: Testing new workflows, validating configurations
- **Tenant**: FAMBrands_RPAOPS
- **Folder**: 277500
- **Queue Names**: Typically prefixed with "Test_" or "_Dev"

**Production (PROD)**:
- **Purpose**: Live business processes
- **Tenant**: FAMBrands_RPAOPS_PROD
- **Folder**: 376892
- **Queue Names**: Production queue names

---

### Configuration Strategy

**Strategy 1: Separate Webhooks for Each Environment**

Create two webhooks - one for DEV, one for PROD:

```bash
# DEV Webhook
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/TestSite:/lists/test-list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing_Test|tenant:DEV|folder:277500|label:InvoicesDev"
  }'

# PROD Webhook (different SharePoint list)
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/prod-list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:376892|label:InvoicesProd"
  }'
```

**Benefits**:
- ✅ Clear separation of test vs production data
- ✅ Can test in DEV without affecting PROD
- ✅ Different SharePoint lists for each environment

---

**Strategy 2: Same Webhook, Different Queues**

Single webhook routing to environment-specific queues:

```bash
# During testing phase
"clientState": "destination:uipath|handler:document|queue:Invoice_Processing_Test|tenant:DEV|folder:277500"

# After validation, update to PROD
# Delete webhook, recreate with PROD config
"clientState": "destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:376892"
```

**Benefits**:
- ✅ Single SharePoint list
- ✅ Easy to promote from DEV to PROD
- ✅ Less configuration to manage

---

**Strategy 3: Dynamic Routing Based on Field Value**

This requires a custom handler that reads a field value to determine environment:

```javascript
// Custom handler pseudo-code
if (item.Environment === 'DEV') {
  queueName = 'Test_Queue';
  environment = { tenant: 'DEV', folder: '277500' };
} else if (item.Environment === 'PROD') {
  queueName = 'Production_Queue';
  environment = { tenant: 'PROD', folder: '376892' };
}
```

**Benefits**:
- ✅ Single webhook handles both
- ✅ Users control routing via SharePoint field
- ✅ Flexible switching

---

### Testing Workflow Recommendation

1. **Create DEV Webhook First**
   ```bash
   tenant:DEV|folder:277500|queue:Test_Queue
   ```

2. **Validate Complete Flow**
   - Upload test document
   - Verify queue item created
   - Confirm robot processes successfully
   - Check output is correct

3. **Create PROD Webhook**
   ```bash
   tenant:PROD|folder:376892|queue:Production_Queue
   ```

4. **Monitor Initial Production Use**
   - Watch Application Insights for errors
   - Verify queue items in PROD Orchestrator
   - Confirm robot processing

5. **Delete DEV Webhook** (if no longer needed)
   ```bash
   curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY&subscriptionId=dev-webhook-id"
   ```

---

## Document Processing Workflows

### Scenario 1: Invoice Processing

**Business Need**: Automatically process invoices uploaded to SharePoint.

**Setup**:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/Accounting:/lists/invoice-library-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:376892|label:Invoices"
  }'
```

**Flow**:
1. ✅ Accountant uploads invoice PDF to SharePoint
2. 🔔 Webhook fires within 1-2 seconds
3. 📊 Document handler extracts all metadata
4. 🎯 Queue item created with file path, size, metadata
5. 🤖 Robot downloads PDF from SharePoint
6. 🔍 Robot extracts invoice data (OCR/intelligent document processing)
7. 💾 Robot enters data into accounting system
8. ✅ Robot updates SharePoint item: ProcessingStatus = "Complete"

**UiPath Robot Receives**:
```json
{
  "FileName": "Invoice_12345.pdf",
  "FilePath": "/sites/Accounting/Invoices/Invoice_12345.pdf",
  "WebUrl": "https://tenant.sharepoint.com/sites/Accounting/Invoices/Invoice_12345.pdf",
  "FileSize": "259482",
  "Author": "accounting@company.com",
  "Created": "2025-12-10T14:30:00Z",
  "Department": "Finance",
  "VendorName": "Acme Corp",  // Custom SharePoint column
  "InvoiceNumber": "INV-12345"  // Custom SharePoint column
}
```

---

### Scenario 2: Contract Management

**Business Need**: Track contract versions and approval workflows.

**Setup**:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Legal:/lists/contracts-library-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Contract_Processing|tenant:PROD|folder:376892|label:Contracts"
  }'
```

**Flow**:
1. ✅ Legal team uploads contract with metadata (Party1, Party2, Value, ExpirationDate)
2. 🔔 Webhook fires
3. 📊 Handler extracts metadata including version tracking
4. 🎯 Queue item created
5. 🤖 Robot validates contract completeness
6. 📧 Robot sends notification to stakeholders
7. 📅 Robot creates calendar reminder for expiration
8. 💾 Robot archives in document management system

---

### Scenario 3: Receipt Scanning

**Business Need**: Process employee expense receipts.

**Setup**:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/HR:/lists/receipts-library-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Receipt_Processing|tenant:PROD|folder:376892|label:Receipts"
  }'
```

**Flow**:
1. ✅ Employee uploads receipt photo
2. 🔔 Webhook fires
3. 📊 Handler extracts file metadata
4. 🎯 Queue item created
5. 🤖 Robot performs OCR on receipt image
6. 💰 Robot extracts amount, date, vendor
7. ✅ Robot validates against expense policy
8. 📝 Robot creates expense report entry
9. 📧 Robot notifies manager for approval

---

## Business Process Automation

### Scenario 4: Purchase Order Approval

**Business Need**: Route purchase orders through approval workflow based on amount.

**Custom Handler Needed**: Yes (to implement approval logic)

**Logic**:
```
IF Amount < $5,000
    → Auto-approve, update Status

IF Amount >= $5,000 AND Amount < $50,000
    → Send to Manager approval queue

IF Amount >= $50,000
    → Send to Executive approval queue
```

**Setup**:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Procurement:/lists/po-list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:custom|queue:PO_Routing|tenant:PROD|folder:376892|label:POApproval"
  }'
```

**Custom Handler**:
```javascript
// Simplified pseudo-code
processItem(item) {
  const amount = parseFloat(item.Amount);

  if (amount < 5000) {
    // Auto-approve
    return {
      queueName: 'PO_Auto_Approve',
      priority: 'Low',
      action: 'auto_approve'
    };
  } else if (amount < 50000) {
    // Manager approval
    return {
      queueName: 'PO_Manager_Approval',
      priority: 'Normal',
      approver: item.ManagerEmail
    };
  } else {
    // Executive approval
    return {
      queueName: 'PO_Executive_Approval',
      priority: 'High',
      approver: 'cfo@company.com'
    };
  }
}
```

---

# Part 5: Management & Operations

## Managing Active Webhooks

### List All Webhooks

```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | jq '.'
```

**Output**:
```json
{
  "subscriptions": [
    {
      "id": "16fb8419-87f8-4046-af0b-42def1c0ec0c",
      "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/...",
      "clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892",
      "expirationDateTime": "2025-12-13T04:40:17Z",
      "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler"
    },
    {
      "id": "a2c4e6f8-1b3d-5f7h-9j1l-3n5p7r9t1v3x",
      "resource": "sites/tenant.sharepoint.com:/sites/HR:/lists/...",
      "clientState": "destination:forward|url:https://webhook.site/abc123",
      "expirationDateTime": "2025-12-12T10:15:30Z",
      "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler"
    }
  ]
}
```

---

### Find Specific Webhook

**By Resource**:
```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | \
  jq '.subscriptions[] | select(.resource | contains("Finance"))'
```

**By Handler**:
```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | \
  jq '.subscriptions[] | select(.clientState | contains("handler:costco"))'
```

**By Environment**:
```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | \
  jq '.subscriptions[] | select(.clientState | contains("tenant:PROD"))'
```

---

### Update Webhook Configuration

SharePoint webhooks are immutable - you cannot update them. Instead:

1. **Delete the old webhook**
2. **Create a new webhook** with updated configuration

**Example**: Change queue name from Test_Queue to Production_Queue

```bash
# Step 1: Get webhook ID
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | \
  jq '.subscriptions[] | select(.clientState | contains("Test_Queue")) | .id'

# Output: "16fb8419-87f8-4046-af0b-42def1c0ec0c"

# Step 2: Delete old webhook
curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY&subscriptionId=16fb8419-87f8-4046-af0b-42def1c0ec0c"

# Step 3: Create new webhook with updated config
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/...",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Production_Queue|tenant:PROD|folder:376892"
  }'
```

---

### Delete Webhook

```bash
curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY&subscriptionId=WEBHOOK-ID-HERE"
```

**When to Delete**:
- ✅ Webhook no longer needed
- ✅ Migrating to new configuration
- ✅ List/library being decommissioned
- ✅ Testing completed

---

### Sync Webhooks to Tracking List

The system maintains a SharePoint tracking list for monitoring. Sync updates this list:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=$WEBHOOK_SYNC_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**What This Does**:
1. ✅ Retrieves all active webhooks from Microsoft Graph
2. ✅ Updates SharePoint tracking list
3. ✅ Syncs notification counts
4. ✅ Renews webhooks expiring within 24 hours
5. ✅ Generates human-readable descriptions

**Response**:
```json
{
  "success": true,
  "synchronized": 5,
  "created": 1,
  "updated": 3,
  "deleted": 1,
  "renewed": 2
}
```

**When to Run**:
- ✅ After creating new webhooks
- ✅ To manually trigger renewal
- ✅ When tracking list seems out of sync
- ✅ Before reviewing webhook health

---

## Monitoring and Health Checks

### Check Webhook Status

**Are My Webhooks Active?**

```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | \
  jq '.subscriptions[] | {id, resource, expires: .expirationDateTime}'
```

Look for:
- ✅ Expiration dates in the future
- ✅ All expected webhooks present
- ⚠️ Any webhooks expiring soon (< 24 hours)

---

### Stream Live Logs

**See Webhook Activity in Real-Time**:

```bash
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --filter "webhook-handler"
```

**What You'll See**:
```
[2025-12-10 15:30:45] [webhook-handler] Received notification for subscription abc-123
[2025-12-10 15:30:45] [webhook-handler] Processing change for item 15
[2025-12-10 15:30:46] [webhook-handler] Handler: document, Queue: Invoice_Processing
[2025-12-10 15:30:47] [webhook-handler] Successfully submitted to UiPath queue
[2025-12-10 15:30:47] [webhook-handler] Queue Item ID: 12345
```

---

### Query Application Insights

**UiPath Queue Submissions (Last Hour)**:

```bash
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(1h) | where message contains 'Successfully submitted item to UiPath queue' | project timestamp, message" \
  --output table
```

**Recent Errors**:

```bash
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(1h) | where severityLevel >= 3 | project timestamp, severityLevel, message" \
  --output table
```

**Notification Volume by Hour**:

```bash
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where message contains 'webhook-handler' | summarize count() by bin(timestamp, 1h) | order by timestamp desc" \
  --output table
```

---

### Run System Validation

Use the validation script to check system health:

```bash
./run-validation.sh
```

**Checks Performed**:
- ✅ Azure Function App running
- ✅ Environment variables configured
- ✅ UiPath authentication working
- ✅ SharePoint permissions valid
- ✅ Active webhooks listed
- ✅ Recent notification activity

---

## Understanding Auto-Renewal

SharePoint webhooks expire after **3 days** (maximum allowed by SharePoint). Our system automatically renews them to prevent disruption.

### How Auto-Renewal Works

1. **Timer Function** runs every hour
2. **Checks** all active webhooks for expiration
3. **Renews** any webhook expiring within next 24 hours
4. **Extends** expiration by 3 days from renewal time
5. **Logs** renewal activity to Application Insights

### Webhook Lifecycle

```
Day 0: Webhook Created
  └─ Expires: Day 3, 12:00 PM

Day 2, 11:00 AM: Auto-renewal triggered (< 24 hours remaining)
  └─ New Expires: Day 5, 11:00 AM

Day 4, 10:00 AM: Auto-renewal triggered again
  └─ New Expires: Day 7, 10:00 AM

...continues indefinitely
```

### Manual Renewal

Force renewal immediately:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=$WEBHOOK_SYNC_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

This triggers the sync process which includes renewal.

### Monitoring Renewals

**Check Recent Renewals**:

```bash
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(24h) | where message contains 'renewed' or message contains 'renewal' | project timestamp, message" \
  --output table
```

### Failed Renewal Handling

If renewal fails:
1. ✅ Error logged to Application Insights (severity: Error)
2. ✅ System continues attempting renewal each hour
3. ⚠️ If webhook expires, notifications stop
4. 🔧 Manual intervention required: Delete and recreate webhook

**How to Detect**:

```bash
# Check for renewal failures
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(7d) | where message contains 'renewal failed' or message contains 'failed to renew' | project timestamp, message" \
  --output table
```

---

# Part 6: Advanced Features

## Change Detection

**Purpose**: Track exactly what changed in SharePoint items, not just that something changed.

### How It Works

1. **State Storage**: Current state of each item stored in Azure Table Storage
2. **Comparison**: On each change, compare new state vs. stored state
3. **Difference Detection**: Identify added, modified, and removed fields
4. **Delivery**: Send detailed change information with notification

### Enable Change Detection

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:forward|url:https://your-endpoint.com/webhook|changeDetection:enabled"
  }'
```

### Initialize States for Existing Items

**Important**: Run this after creating the webhook to capture current state of existing items:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/initialize-item-states?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id"
  }'
```

**Response**:
```json
{
  "success": true,
  "message": "Initialized states for 84 items out of 89 total",
  "initialized": 84,
  "failed": 0,
  "total": 89,
  "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id"
}
```

### Change Payload Example

**Scenario**: User updates Status from "Pending" to "Approved" and Amount from "50000" to "55000"

**Payload Sent**:
```json
{
  "subscriptionId": "abc-123",
  "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/...",
  "currentState": {
    "ID": "15",
    "Title": "Purchase Order #12345",
    "Status": "Approved",
    "Amount": "55000",
    "Approver": "manager@company.com",
    "Modified": "2025-12-10T15:30:00Z"
  },
  "previousState": {
    "ID": "15",
    "Title": "Purchase Order #12345",
    "Status": "Pending",
    "Amount": "50000",
    "Approver": "manager@company.com",
    "Modified": "2025-12-09T10:00:00Z"
  },
  "changes": {
    "summary": {
      "modifiedFields": 3,
      "addedFields": 0,
      "removedFields": 0,
      "isFirstTimeTracking": false
    },
    "details": {
      "modified": {
        "Status": {
          "old": "Pending",
          "new": "Approved"
        },
        "Amount": {
          "old": "50000",
          "new": "55000"
        },
        "Modified": {
          "old": "2025-12-09T10:00:00Z",
          "new": "2025-12-10T15:30:00Z"
        }
      },
      "added": {},
      "removed": {}
    }
  }
}
```

### Exclude Fields from Change Detection

Some fields change frequently but aren't meaningful for your workflow:

```bash
"clientState": "destination:forward|url:https://your-endpoint.com/webhook|changeDetection:enabled|excludeFields:_UIVersionString,Modified,Editor"
```

**Common Fields to Exclude**:
- `_UIVersionString` - SharePoint internal version
- `Modified` - Timestamp (changes on every update)
- `Editor` - Last editor (may not be relevant)
- `_ComplianceFlags` - Compliance metadata
- `_ComplianceTag` - Compliance tagging

---

## Hybrid Processing

**Purpose**: Route notifications to multiple destinations simultaneously.

### Use Cases

1. **UiPath Processing + External Monitoring**
   - Process with robot AND send to monitoring dashboard

2. **Primary + Backup Processing**
   - Send to production queue AND backup queue

3. **Multi-Department Routing**
   - Send to department queue AND central tracking

### Configuration

Use semicolon (`;`) to separate multiple destinations:

```bash
"clientState": "destination:uipath|handler:document|queue:Invoice_Queue|tenant:PROD|folder:376892;destination:forward|url:https://monitor.example.com/webhook"
```

### Example: UiPath + Teams Notification

**Setup**:
```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/invoice-library-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:376892;destination:forward|url:https://outlook.office.com/webhook/YOUR-TEAMS-WEBHOOK"
  }'
```

**What Happens**:
1. ✅ Document uploaded to SharePoint
2. 🔔 Webhook fires
3. 📊 Document handler extracts metadata
4. 🎯 Queue item created in UiPath (parallel processing starts)
5. 📧 Teams notification sent (happens simultaneously)
6. 🤖 Robot processes invoice
7. 👥 Team sees notification in Teams channel

### Example: Multi-Environment Testing

**Setup**:
```bash
"clientState": "destination:uipath|handler:document|queue:Invoice_Queue_Dev|tenant:DEV|folder:277500;destination:uipath|handler:document|queue:Invoice_Queue_Prod|tenant:PROD|folder:376892"
```

**What Happens**:
- Same notification processed by both DEV and PROD environments
- Useful for parallel testing before full PROD rollout

**⚠️ Caution**: This creates queue items in both environments. Use carefully to avoid duplicate processing.

---

## Custom Business Logic

### When Standard Handlers Aren't Enough

Standard document and COSTCO handlers cover many scenarios, but you may need custom logic for:

1. **Complex Validation Rules**
   - Multiple field dependencies
   - Business rule validation
   - External system lookups

2. **Dynamic Queue Routing**
   - Route to different queues based on field values
   - Priority-based routing
   - Department-specific queues

3. **Data Transformation**
   - Custom field mapping
   - Data enrichment from external sources
   - Calculated fields

4. **Conditional Processing**
   - Process only when specific conditions met
   - Multi-stage approval workflows
   - Time-based triggers

### Custom Handler Development Process

**Step 1: Design Your Logic**

Document:
- ✅ Trigger conditions (when to process)
- ✅ Required fields
- ✅ Validation rules
- ✅ Data transformation needs
- ✅ Queue routing logic

**Step 2: Implement Handler**

Create handler class in `src/templates/your-handler-name.js`. See [Complete Webhook to Queue Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md#custom-processor-implementation) for full implementation template.

**Step 3: Register Handler**

Add to `src/shared/uipath-processor-registry.js`:

```javascript
const { createYourHandler } = require('../templates/your-handler-name');

const PROCESSOR_TEMPLATES = {
  document: createGenericDocumentProcessor,
  costco: createCOSTCOInlineProcessor,
  'your-handler': createYourHandler  // Add here
};
```

**Step 4: Deploy**

```bash
./scripts/deployment/force-deploy.sh
```

**Step 5: Create Webhook**

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:your-handler|queue:Your_Queue|tenant:PROD|folder:376892"
  }'
```

### Example: Purchase Order Approval Logic

**Business Rules**:
- PO < $5K: Auto-approve
- PO $5K-$50K: Manager approval
- PO > $50K: Executive approval

**Handler Pseudo-Code**:
```javascript
class POApprovalHandler {
  shouldProcessItem(item) {
    return item.Status === 'Submitted' && item.Amount && item.Department;
  }

  processItem(item) {
    const amount = parseFloat(item.Amount);

    let queueName, priority, approver;

    if (amount < 5000) {
      queueName = 'PO_Auto_Approve';
      priority = 'Low';
      approver = 'automated';
    } else if (amount < 50000) {
      queueName = 'PO_Manager_Approval';
      priority = 'Normal';
      approver = item.ManagerEmail;
    } else {
      queueName = 'PO_Executive_Approval';
      priority = 'High';
      approver = 'cfo@company.com';
    }

    return this.queueClient.enqueue({
      queueName,
      priority,
      specificContent: {
        PONumber: item.PONumber,
        Amount: amount,
        Department: item.Department,
        Approver: approver,
        RequestedBy: item.Author.Email
      }
    });
  }
}
```

---

# Part 7: Troubleshooting

## Common Issues and Solutions

### Issue 1: Webhook Creation Fails

**Symptoms**:
- HTTP 400 Bad Request
- HTTP 403 Forbidden
- Error message: "Unable to create webhook subscription"

**Common Causes**:

**1. Invalid Resource Path**
```bash
# ❌ Wrong
"resource": "sites/tenant.sharepoint.com/sites/Finance/lists/abc123"

# ✅ Correct
"resource": "sites/tenant.sharepoint.com:/sites/Finance:/lists/abc123"
```
**Fix**: Use colons (`:`) as separators, not slashes (`/`)

**2. Missing SharePoint Permissions**
- Azure AD app needs `Sites.ReadWrite.All` permission
- Admin consent required

**Fix**:
```bash
# Check permissions in Azure Portal
# Azure AD → App registrations → Your App → API permissions
# Ensure "Sites.ReadWrite.All" is present and granted
```

**3. Notification URL Not Accessible**
- URL must be publicly accessible
- Must respond to validation requests

**Fix**: Test webhook handler responds:
```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler?validationToken=test123"
# Should return: test123
```

**4. Function App Not Running**

**Fix**:
```bash
az functionapp show \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --query state

# Should return: "Running"

# If not running, start it:
az functionapp start \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks
```

---

### Issue 2: No Notifications Received

**Symptoms**:
- Webhook created successfully
- Changes made in SharePoint
- No log entries in Application Insights
- No queue items in UiPath

**Diagnostics**:

**Step 1: Verify Webhook Still Active**
```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | \
  jq '.subscriptions[] | {id, expires: .expirationDateTime}'
```

Check:
- ✅ Is your webhook in the list?
- ✅ Is expiration date in the future?

**If Missing or Expired**:
```bash
# Recreate webhook with same configuration
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{...}'  # Your original webhook config
```

**Step 2: Check Function App Logs**
```bash
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks
```

Make a change in SharePoint and watch for log entries.

**If No Log Entries**:
- SharePoint may not be sending notifications
- Check SharePoint service health
- Verify webhook wasn't accidentally deleted from SharePoint

**Step 3: Test with New Webhook**

Create test webhook on same list:
```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler"
  }'
```

If test webhook works, issue is with original webhook configuration.

---

### Issue 3: UiPath Queue Items Not Created

**Symptoms**:
- Webhook fires (logs show notification received)
- No queue items appear in UiPath Orchestrator

**Diagnostics**:

**Step 1: Check Logs for UiPath Errors**
```bash
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks | \
  grep -i "uipath\|error\|failed"
```

**Step 2: Common Error Messages**

**Error: "Queue does not exist" (Error Code 1002)**

**Cause**: Queue name doesn't exist in specified folder

**Fix**:
1. Login to UiPath Orchestrator
2. Navigate to correct tenant and folder
3. Go to Queues section
4. Verify queue name matches exactly (case-sensitive)
5. If missing, create queue
6. Update webhook with correct queue name

**Error: "Folder does not exist" (Error Code 1005)**

**Cause**: Folder ID incorrect or doesn't exist in tenant

**Fix**:
1. Login to UiPath Orchestrator
2. Verify folder ID in Orchestrator URL or Folders section
3. Update webhook with correct folder ID:
   ```bash
   # Delete and recreate with correct folder
   tenant:PROD|folder:376892  # Verify this is correct
   ```

**Error: "Authentication failed" or "Unauthorized" (401/403)**

**Cause**: UiPath credentials expired or invalid

**Fix**:
```bash
# Check credentials configured
az functionapp config appsettings list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks | \
  jq '.[] | select(.name | contains("UIPATH"))'

# Update if needed
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings UIPATH_CLIENT_SECRET="new-secret-value"

# Restart function app
az functionapp restart \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks
```

**Step 3: Verify ClientState Configuration**

```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | \
  jq '.subscriptions[] | select(.id == "YOUR-WEBHOOK-ID") | .clientState'
```

Check:
- ✅ `destination:uipath` present?
- ✅ `handler:{type}` specified?
- ✅ `queue:{name}` correct?
- ✅ `tenant:{ENV}` correct?
- ✅ `folder:{ID}` correct?

---

### Issue 4: Wrong Environment (DEV vs PROD)

**Symptoms**:
- Queue items going to DEV when should be PROD (or vice versa)
- Queue doesn't exist in expected environment

**Cause**: Incorrect `tenant:` or `folder:` in clientState

**Fix**:

**Step 1: Identify Current Configuration**
```bash
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | \
  jq '.subscriptions[] | {id, clientState}'
```

**Step 2: Verify Expected vs Actual**

**DEV Should Be**:
```
tenant:DEV|folder:277500
```

**PROD Should Be**:
```
tenant:PROD|folder:376892
```

**Step 3: Recreate with Correct Environment**
```bash
# Delete incorrect webhook
curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY&subscriptionId=WEBHOOK-ID"

# Create with correct environment
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "destination:uipath|handler:document|queue:QueueName|tenant:PROD|folder:376892"
  }'
```

---

### Issue 5: Handler Not Processing Items

**Symptoms**:
- Webhook fires
- No errors in logs
- No queue items created

**Cause**: Handler trigger conditions not met

**Document Handler**:
- Processes all document changes
- Should always fire for document libraries

**COSTCO Handler**:
- ⚠️ **Only processes when**: `Status == "Send Generated Form"`
- If Status is anything else, handler skips processing

**Fix for COSTCO Handler**:

**Step 1: Verify Status Field**
```bash
# Check SharePoint item
# Ensure Status field = "Send Generated Form" (exact match, case-sensitive)
```

**Step 2: Check Required Fields**

COSTCO handler requires:
- Ship To Email
- Ship Date
- Style
- PO Number

If any are missing, handler logs error and skips processing.

**Step 3: Review Logs for Skip Messages**
```bash
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks | \
  grep -i "skip\|skipping\|conditions not met"
```

---

### Issue 6: Change Detection Shows Empty Changes

**Symptoms**:
- Change detection enabled
- Payload shows: `isFirstTimeTracking: true`
- No change details

**Cause**: No previous state exists for comparison

**Fix**: Initialize item states

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/initialize-item-states?code=$WEBHOOK_MANAGER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/tenant.sharepoint.com:/sites/site:/lists/list-id"
  }'
```

**When to Run**:
- ✅ After creating webhook with change detection
- ✅ On existing lists with pre-existing items
- ✅ Captures current state for future comparison

---

## Diagnostic Commands

### Quick Health Check

```bash
# Check Function App status
az functionapp show \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --query "{name:name, state:state, defaultHostName:defaultHostName}"

# List active webhooks
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" | \
  jq '.subscriptions | length'

# Check recent activity
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(1h) | where message contains 'webhook-handler' | count" \
  --output table
```

---

### Test UiPath Connection

```bash
# Run UiPath test endpoint
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/uipath-test?code=$WEBHOOK_MANAGER_KEY&test=auth"
```

**Expected Response**:
```json
{
  "success": true,
  "test": "auth",
  "tenant": "FAMBrands_RPAOPS_PROD",
  "folder": "376892",
  "tokenExpires": "2025-12-10T16:30:00Z"
}
```

---

### Comprehensive Log Query

```bash
# Last hour of activity with errors highlighted
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "
    traces
    | where timestamp > ago(1h)
    | where message contains 'webhook' or message contains 'uipath'
    | project timestamp, severityLevel, message
    | order by timestamp desc
    | limit 100
  " \
  --output table
```

---

## When to Escalate

**Escalate to Development Team When**:

1. **Authentication Issues Persist**
   - Credentials updated but still failing
   - Token refresh errors
   - Permission denied errors after verification

2. **Function App Issues**
   - Function crashes or restarts
   - Consistent 500 errors
   - Performance degradation

3. **Custom Handler Issues**
   - Handler logic needs modification
   - New handler development required
   - Complex business rule implementation

4. **Infrastructure Issues**
   - Azure service outages
   - Network connectivity problems
   - Resource quota exceeded

5. **Data Issues**
   - Incorrect data transformation
   - Missing fields in payload
   - Data type mismatches

**Gather This Information Before Escalating**:

```
✅ Webhook ID(s) affected
✅ SharePoint resource path
✅ Expected behavior vs actual behavior
✅ Error messages from logs
✅ Timestamp of issue occurrence
✅ Steps to reproduce
✅ Recent configuration changes
```

**Export Diagnostic Bundle**:
```bash
# Export recent logs
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "traces | where timestamp > ago(24h) | project timestamp, severityLevel, message" \
  --output json > diagnostic-logs.json

# Export webhook configuration
curl "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=$WEBHOOK_MANAGER_KEY" > webhook-config.json
```

---

# Part 8: Best Practices

## Production Deployment Checklist

### Pre-Deployment

- [ ] **Test in DEV environment**
  - Create webhook with `tenant:DEV|folder:277500`
  - Verify complete flow works
  - Validate queue items created correctly
  - Confirm robot processes successfully

- [ ] **Verify UiPath queue exists in PROD**
  - Login to UiPath Orchestrator PROD
  - Navigate to folder 376892
  - Confirm queue exists
  - Check queue has appropriate permissions

- [ ] **Validate SharePoint permissions**
  - App registration has required permissions
  - Admin consent granted
  - Test resource path accessible

- [ ] **Document configuration**
  - Record webhook ID
  - Save clientState configuration
  - Document expected behavior
  - Note monitoring queries

### Deployment

- [ ] **Create PROD webhook**
  - Use `tenant:PROD|folder:376892`
  - Include descriptive `label:`
  - Double-check queue name
  - Save webhook ID from response

- [ ] **Initialize change detection** (if applicable)
  - Run `initialize-item-states` endpoint
  - Verify initialization completed successfully

- [ ] **Sync to tracking list**
  - Run `webhook-sync` endpoint
  - Verify webhook appears in SharePoint tracking list

### Post-Deployment

- [ ] **Test with real data**
  - Make test change in SharePoint
  - Verify notification received (check logs)
  - Confirm queue item created
  - Validate robot processes correctly

- [ ] **Monitor initial activity**
  - Watch Application Insights for 1 hour
  - Check for any errors or warnings
  - Verify notification volume as expected

- [ ] **Set up alerts** (optional)
  - Configure alert for errors
  - Set up notification for failures
  - Monitor webhook expiration

- [ ] **Train operations team**
  - Share documentation
  - Demonstrate monitoring
  - Provide escalation procedures

---

## Security Considerations

### Function Key Management

**✅ Best Practices**:
- Rotate keys every 90 days
- Use separate keys for different consumers
- Store keys in secure vault (Azure Key Vault)
- Never commit keys to source control

**How to Rotate**:
```bash
# List current keys
az functionapp function keys list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --function-name subscription-manager

# Create new key
az functionapp function keys set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --function-name subscription-manager \
  --key-name "new-key-name" \
  --key-value "your-secure-key-value"

# Delete old key after transition
az functionapp function keys delete \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --function-name subscription-manager \
  --key-name "old-key-name"
```

---

### Endpoint Security

**✅ For External Forwarding**:
- Always use HTTPS (never HTTP)
- Implement signature validation
- Rate limit incoming requests
- Use IP whitelisting when possible

**✅ For UiPath Integration**:
- Store credentials in Azure Key Vault
- Use managed identity for Azure resources
- Enable audit logging
- Implement retry logic with exponential backoff

---

### Secret Management

**❌ Never**:
- Hardcode secrets in code
- Commit secrets to source control
- Share secrets via email/chat
- Log sensitive data

**✅ Always**:
- Use Azure Key Vault for secrets
- Reference secrets via environment variables
- Rotate credentials regularly
- Audit access to secrets

**Azure Key Vault Integration**:
```bash
# Store secret in Key Vault
az keyvault secret set \
  --vault-name "your-keyvault" \
  --name "UiPathClientSecret" \
  --value "your-secret-value"

# Reference in Function App
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings UIPATH_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=https://your-keyvault.vault.azure.net/secrets/UiPathClientSecret/)"
```

---

## Performance Optimization

### High-Volume Scenarios

**When You Expect > 1000 notifications/hour**:

**1. Scale Out Function App**
```bash
az functionapp plan update \
  --name your-plan-name \
  --resource-group rg-sharepoint-webhooks \
  --max-burst 20
```

**2. Optimize Handler Logic**
- Minimize SharePoint API calls
- Reduce unnecessary data fetching
- Cache static configuration

**3. Use Batch Processing** (UiPath)
- Submit multiple queue items in batch
- Reduces API round trips

**4. Monitor Performance**
```bash
# Check execution times
az monitor app-insights query \
  --app webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --analytics-query "
    requests
    | where timestamp > ago(1h)
    | summarize avg(duration), max(duration), count() by bin(timestamp, 5m)
    | order by timestamp desc
  " \
  --output table
```

---

### Reduce Unnecessary Processing

**Strategy 1: Filter in Handler**

Only process specific file types:
```javascript
// In document handler
shouldProcessItem(item) {
  // Only process PDFs
  if (!item.FileLeafRef?.toLowerCase().endsWith('.pdf')) {
    return false;
  }
  return true;
}
```

**Strategy 2: Use Status Fields**

Add SharePoint column to control processing:
```javascript
// Custom handler
shouldProcessItem(item) {
  // Only process when ReadyForAutomation = Yes
  return item.ReadyForAutomation === 'Yes';
}
```

**Strategy 3: Time-Based Processing**

Implement business hours restriction:
```javascript
shouldProcessItem(item) {
  const now = new Date();
  const hour = now.getHours();

  // Only process 8 AM - 6 PM
  if (hour < 8 || hour >= 18) {
    return false;
  }

  return true;
}
```

---

## Summary

You now have comprehensive knowledge to:

✅ **Understand** the webhook system architecture
✅ **Configure** webhooks for any SharePoint list or library
✅ **Route** notifications to external services or UiPath
✅ **Manage** multi-environment workflows (DEV/PROD)
✅ **Monitor** webhook health and activity
✅ **Troubleshoot** common issues
✅ **Deploy** production-ready configurations
✅ **Optimize** for performance and security

### Quick Reference Links

- **[Documentation Hub](./INDEX.md)** - All available documentation
- **[Quick Start Guide](./QUICK_START_DOCUMENT_PROCESSOR.md)** - 10-minute setup
- **[Complete Technical Guide](./WEBHOOK_TO_QUEUE_COMPLETE_GUIDE.md)** - Developer reference
- **[UiPath Integration Guide](./uipath/main-guide.md)** - UiPath-specific details
- **[Production Scaling](./PRODUCTION_SCALING_GUIDE.md)** - Enterprise deployment

### Getting Help

- **Check CLAUDE.md** - Quick reference for common issues
- **Review Application Insights** - Detailed activity logs
- **Run Validation Script** - `./run-validation.sh`
- **Consult Documentation** - Comprehensive guides available

---

*Last Updated: December 10, 2025 | Version 1.0*
*This guide bridges user-friendly guidance with technical depth for maximum productivity*
