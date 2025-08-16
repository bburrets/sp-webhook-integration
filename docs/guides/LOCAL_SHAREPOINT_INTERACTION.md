# Local Development with SharePoint - How It Works

## The Challenge

When developing locally, you have two main interaction points with SharePoint:

1. **Outbound**: Your functions making API calls TO SharePoint (✅ Works locally)
2. **Inbound**: SharePoint sending webhooks TO your functions (❌ Can't reach localhost)

## How Each Function Interacts with SharePoint

### 1. Functions That WORK Locally (Outbound Only)

These functions make API calls to SharePoint/Graph API and work perfectly from localhost:

#### ✅ subscription-manager
```bash
# This WORKS locally - it calls Graph API to create/manage webhooks
curl -X POST http://localhost:7071/api/subscription-manager \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/YOUR-LIST-ID",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "test-from-local"
  }'
```
**What happens**: Your local function uses your credentials to call Microsoft Graph API and creates a real webhook in SharePoint. The webhook points to your PRODUCTION URL (not localhost).

#### ✅ webhook-sync
```bash
# This WORKS locally - it reads/updates your SharePoint management list
curl -X POST http://localhost:7071/api/webhook-sync
```
**What happens**: Reads all webhooks from Graph API and updates your SharePoint list with current status.

#### ✅ initialize-item-states
```bash
# This WORKS locally - it reads SharePoint lists and stores states
curl -X POST http://localhost:7071/api/initialize-item-states \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://fambrandsllc.sharepoint.com/sites/DWI",
    "listId": "your-list-id"
  }'
```
**What happens**: Reads items from SharePoint and stores their current state in your LOCAL Azurite storage.

### 2. Functions That Need Special Handling (Inbound)

#### ⚠️ webhook-handler
This receives notifications FROM SharePoint. SharePoint can't reach http://localhost:7071!

**Solutions**:

## Solution 1: Mock SharePoint Notifications (Easiest)

Instead of waiting for real SharePoint events, simulate them locally:

```bash
# Simulate a SharePoint notification to your local webhook-handler
curl -X POST http://localhost:7071/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{
    "value": [{
      "subscriptionId": "test-subscription-123",
      "clientState": "forward:https://webhook.site/YOUR-TEST-URL",
      "resource": "sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/30516097-c58c-478c-b87f-76c8f6ce2b56",
      "changeType": "updated",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.ListItem",
        "id": "15"
      }
    }]
  }'
```

This lets you test your webhook processing logic without needing SharePoint to actually call you.

## Solution 2: Use ngrok for Real SharePoint Events

ngrok creates a public tunnel to your localhost, allowing SharePoint to send real notifications:

### Step 1: Install and start ngrok
```bash
# Install ngrok
npm install -g ngrok
# Or download from https://ngrok.com

# Start tunnel to your local Functions
ngrok http 7071
```

You'll see:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:7071
```

### Step 2: Create webhook pointing to ngrok URL
```bash
# Create a REAL webhook that points to your LOCAL function via ngrok
curl -X POST http://localhost:7071/api/subscription-manager \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/YOUR-LIST-ID",
    "changeType": "updated",
    "notificationUrl": "https://abc123.ngrok.io/api/webhook-handler",
    "clientState": "local-testing-via-ngrok"
  }'
```

### Step 3: Trigger real SharePoint events
Go to your SharePoint list and make a change. Your LOCAL webhook-handler will receive the notification!

## Solution 3: Hybrid Testing (Recommended)

Use a combination approach for efficient development:

### 1. Create webhooks pointing to production
```bash
# Webhook points to your Azure function, not localhost
curl -X POST http://localhost:7071/api/subscription-manager \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/YOUR-LIST-ID",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "forward:https://webhook.site/YOUR-UNIQUE-URL"
  }'
```

### 2. Monitor forwarded notifications
- Go to https://webhook.site/YOUR-UNIQUE-URL
- Make changes in SharePoint
- See the notifications that would be sent
- Copy the payload

### 3. Test locally with real payloads
```bash
# Paste the real payload from webhook.site
curl -X POST http://localhost:7071/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d 'PASTE_REAL_PAYLOAD_HERE'
```

## Testing Workflow Examples

### Example 1: Testing Change Detection Locally

```bash
# 1. Initialize item states from SharePoint (works locally!)
curl -X POST http://localhost:7071/api/initialize-item-states \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://fambrandsllc.sharepoint.com/sites/DWI",
    "listId": "9e35f709-48be-4995-8b28-79730ad12b89"
  }'

# 2. Make a change in SharePoint manually

# 3. Simulate the notification locally
curl -X POST http://localhost:7071/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{
    "value": [{
      "subscriptionId": "test-change-detection",
      "clientState": "detectChanges:true",
      "resource": "sites/fambrandsllc.sharepoint.com:/sites/DWI:/lists/9e35f709-48be-4995-8b28-79730ad12b89",
      "changeType": "updated",
      "resourceData": {"id": "ITEM-ID-THAT-CHANGED"}
    }]
  }'

# Your local function will:
# - Connect to real SharePoint
# - Fetch the current item state
# - Compare with stored state in local Azurite
# - Detect what changed!
```

### Example 2: Testing Webhook Creation and Management

```bash
# 1. List current webhooks (connects to real SharePoint)
curl http://localhost:7071/api/subscription-manager

# 2. Create a new webhook (creates REAL webhook in SharePoint)
curl -X POST http://localhost:7071/api/subscription-manager \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/YOUR-LIST",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "test-webhook"
  }'

# 3. Sync with SharePoint management list (updates real SharePoint list)
curl -X POST http://localhost:7071/api/webhook-sync

# 4. Verify in SharePoint
# Go to your SharePoint management list and see the new webhook entry!
```

## What Works vs What Doesn't

### ✅ What WORKS Locally

| Function | What It Does | SharePoint Interaction |
|----------|--------------|------------------------|
| subscription-manager GET | List webhooks | Reads from Graph API |
| subscription-manager POST | Create webhook | Creates via Graph API |
| subscription-manager DELETE | Delete webhook | Deletes via Graph API |
| webhook-sync | Sync webhooks to list | Reads Graph, Updates SharePoint list |
| initialize-item-states | Store item baselines | Reads SharePoint lists |
| health-check | Check system health | No SharePoint interaction |

### ⚠️ What Needs Special Handling

| Function | Issue | Solution |
|----------|-------|----------|
| webhook-handler | Can't receive from SharePoint | Use ngrok OR mock notifications |

## Environment Variables for Local Testing

```json
{
  "Values": {
    // These work with REAL SharePoint from localhost
    "AZURE_CLIENT_ID": "your-real-app-id",
    "AZURE_CLIENT_SECRET": "your-real-secret", 
    "AZURE_TENANT_ID": "your-real-tenant",
    
    // This is your REAL SharePoint list
    "WEBHOOK_LIST_ID": "82a105da-8206-4bd0-851b-d3f2260043f4",
    
    // Local storage (Azurite)
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    
    // Optional: Different table for local testing
    "AZURE_TABLE_NAME": "LocalSharePointItemStates"
  }
}
```

## Security Note

When testing locally with real SharePoint:
- You're using REAL credentials
- You're creating REAL webhooks
- You're modifying REAL SharePoint lists

Consider using a test SharePoint site/list for development!

## Quick Decision Tree

```
Need to test webhook creation/management?
  → Works locally as-is ✅

Need to test reading SharePoint data?
  → Works locally as-is ✅

Need to test receiving webhooks from SharePoint?
  → Use one of these:
    1. Mock the notifications (fastest)
    2. Use ngrok tunnel (most realistic)
    3. Use webhook.site + copy payload (good middle ground)

Need to test the full flow end-to-end?
  → Use ngrok for complete local testing
```

## Common Scenarios

### "I want to test if my webhook forwards correctly"
```bash
# Create webhook pointing to production, forwarding to webhook.site
curl -X POST http://localhost:7071/api/subscription-manager \
  -d '{"clientState": "forward:https://webhook.site/YOUR-URL", ...}'

# Then simulate the notification locally
curl -X POST http://localhost:7071/api/webhook-handler \
  -d '{"value": [{"clientState": "forward:https://webhook.site/YOUR-URL", ...}]}'
```

### "I want to test with real SharePoint changes"
```bash
# Use ngrok
ngrok http 7071

# Create webhook with ngrok URL
# Make changes in SharePoint
# See them hit your local function!
```

### "I want to test without touching production SharePoint"
```bash
# Use only mock notifications
# All testing done with curl commands
# No real SharePoint interaction needed
```