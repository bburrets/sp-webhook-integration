# SharePoint Webhook Solution with UiPath Integration

A production-ready Azure Functions solution for monitoring SharePoint list changes in real-time, automatically processing them through UiPath queues, and forwarding notifications to external services.

## 🎯 Why This Project?

**Problem:** SharePoint webhooks are limited - they don't tell you what changed, just that something changed. They also require complex validation that many services can't handle.

**Solution:** This project acts as an intelligent middleware that:
- ✅ Detects and enriches SharePoint changes with actual data
- ✅ Routes items to UiPath robots for automation
- ✅ Forwards notifications to any external service
- ✅ Manages all webhooks from a central dashboard

**Real Example:** When a COSTCO routing form status changes to "Send Generated Form", the system automatically extracts all form data and sends it to UiPath robots for processing - no manual intervention needed.

## 🚀 Quick Start for New Visitors

👉 **First time here?** Start with our **[📚 Visitor Onboarding Guide](docs/guides/VISITOR_ONBOARDING_GUIDE.md)** for a 5-minute setup!

## 🌟 Key Features

- **🤖 UiPath Integration**: Automatically send SharePoint items to UiPath Orchestrator queues
- **📡 Real-time Monitoring**: Instant notifications when SharePoint lists are modified
- **🔄 Smart Forwarding**: Route notifications to external services without validation hassles
- **📊 Central Dashboard**: Track all webhooks in a SharePoint management list
- **🔍 Change Detection**: Know exactly what changed, not just that something changed
- **⚡ Production Ready**: Enterprise-grade error handling, logging, and monitoring

## 📋 Prerequisites

### Required
- ✅ Azure subscription with Function App (Node.js 18+)
- ✅ SharePoint Online site with appropriate permissions
- ✅ Azure AD App Registration with Microsoft Graph API permissions

### Optional
- 🤖 UiPath Orchestrator (for automation features)
- 📊 Application Insights (for monitoring)
- 🔐 Azure Key Vault (for production)

## 🏗️ Architecture

```
SharePoint List Changes
        ↓
   Microsoft Graph
        ↓
   Webhook Handler ←─── Validates & Routes
        ├─→ UiPath Dispatcher ──→ UiPath Orchestrator Queue
        ├─→ Enhanced Forwarder ──→ External Services
        └─→ Notification Counter ──→ SharePoint Dashboard
              ↑
        Subscription Manager (CRUD Operations)
```

## 🎬 Getting Started

### Option 1: Quick Setup (Recommended)
Follow our **[📚 Visitor Onboarding Guide](docs/guides/VISITOR_ONBOARDING_GUIDE.md)** for step-by-step setup with examples.

### Option 2: Manual Setup
1. Clone the repository
2. Copy `.env.example` to `.env` and configure
3. Deploy to Azure Functions
4. Create your first webhook using examples below

### Option 3: Interactive Setup
```bash
# Coming soon: Interactive setup wizard
./scripts/setup/interactive-setup.sh
```

## 📊 SharePoint Management List Setup

Create a SharePoint list with these columns:

| Column Name | Type | Required | Description |
|-------------|------|----------|-------------|
| Title | Single line of text | Yes | Auto-generated: "{ResourceType} - {ListName}" |
| SubscriptionId | Single line of text | Yes | Unique webhook subscription ID |
| Status | Choice (Active, Deleted) | Yes | Current webhook status |
| ChangeType | Single line of text | Yes | SharePoint change types (e.g., "updated") |
| NotificationUrl | Single line of text | Yes | Webhook endpoint URL |
| ExpirationDateTime | Date and Time | Yes | When webhook expires |
| NotificationCount | Number | Yes | Total notifications received |
| ClientState | Single line of text | No | Contains proxy configuration |
| ForwardingUrl | Single line of text | No | External service URL for forwarding |
| IsProxy | Choice (Yes, No) | No | Whether webhook forwards notifications |
| LastForwardedDateTime | Date and Time | No | Last successful forward timestamp |

Additional columns for tracking:
- SiteUrl, ListId, ListName, ResourceType, AutoRenew

## 🔧 Core Functions

### 1. **webhook-handler**
- Receives SharePoint change notifications
- Validates requests from Microsoft Graph
- Forwards notifications based on clientState
- Updates notification counts and statistics

### 2. **subscription-manager**  
- REST API for webhook CRUD operations
- Automatically syncs webhooks to SharePoint
- Handles Graph API authentication

### 3. **webhook-sync**
- Timer-triggered (every 30 minutes)
- Synchronizes all webhooks with SharePoint list
- Marks deleted webhooks appropriately

### 4. **initialize-item-states** (Important for Enhanced Mode)
- Pre-populates item states for change tracking
- Prevents empty change notifications on first modification
- Should be run when setting up webhooks with enhanced forwarding

### 5. **check-list-columns** (Admin Tool)
- Utility to inspect SharePoint list structure
- Useful for debugging field issues

## 📡 Common Use Cases

### 1️⃣ Basic SharePoint Monitoring
Monitor a list and track changes in a dashboard:
```bash
curl -X POST "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/contoso.sharepoint.com:/sites/hr:/lists/a1b2c3d4-e5f6-7890",
    "changeType": "updated",
    "notificationUrl": "https://your-app.azurewebsites.net/api/webhook-handler"
  }'
```

### 2️⃣ Send to UiPath Robot Queue
Automatically process items with UiPath robots:
```bash
curl -X POST "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/contoso.sharepoint.com:/sites/finance:/lists/invoices-list-id",
    "changeType": "updated",
    "notificationUrl": "https://your-app.azurewebsites.net/api/webhook-handler",
    "clientState": "processor:uipath"
  }'
```

### 3️⃣ Forward to External Service
Send notifications to Teams, Slack, or any webhook:
```bash
curl -X POST "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/contoso.sharepoint.com:/sites/it:/lists/tickets-list-id",
    "changeType": "updated",
    "notificationUrl": "https://your-app.azurewebsites.net/api/webhook-handler",
    "clientState": "forward:https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
  }'
```

### 4️⃣ Advanced: Track What Changed
Get detailed change information:
```bash
curl -X POST "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/contoso.sharepoint.com:/sites/sales:/lists/opportunities-id",
    "changeType": "updated",
    "notificationUrl": "https://your-app.azurewebsites.net/api/webhook-handler",
    "clientState": "forward:https://your-api.com/changes;mode:withChanges"
  }'
```

### 📋 Manage Webhooks
```bash
# List all active webhooks
curl "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY"

# Delete a webhook
curl -X DELETE "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY&subscriptionId=WEBHOOK_ID"
```

## 🤖 UiPath Integration Setup

### Step 1: Configure Credentials
```bash
az functionapp config appsettings set \
  --name your-function-app \
  --resource-group your-rg \
  --settings \
    UIPATH_ORCHESTRATOR_URL="https://cloud.uipath.com/YOUR_ACCOUNT/YOUR_TENANT/orchestrator_" \
    UIPATH_TENANT_NAME="YOUR_TENANT" \
    UIPATH_CLIENT_ID="YOUR_CLIENT_ID" \
    UIPATH_CLIENT_SECRET="YOUR_SECRET" \
    UIPATH_ORGANIZATION_UNIT_ID="YOUR_FOLDER_ID" \
    UIPATH_DEFAULT_QUEUE="SharePointChanges" \
    UIPATH_ENABLED="true"
```

### Step 2: Use Built-in Template or Create Your Own
- **COSTCO Template** (built-in): Ready for routing forms
- **Custom Templates**: See [Visitor Guide](docs/guides/VISITOR_ONBOARDING_GUIDE.md#creating-custom-template) for examples

### Step 3: Create Webhook with UiPath Processing
```bash
curl -X POST "https://your-app.azurewebsites.net/api/subscription-manager?code=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "YOUR_SHAREPOINT_LIST_RESOURCE",
    "changeType": "updated",
    "notificationUrl": "https://your-app.azurewebsites.net/api/webhook-handler",
    "clientState": "processor:uipath"
  }'
```

## 🐛 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| **"Authentication Failed"** | Check Azure AD permissions and run `az functionapp config appsettings list` |
| **"Webhook Creation Failed"** | Test with `curl YOUR_URL/api/webhook-handler?validationToken=test` |
| **"UiPath Queue Error"** | Verify credentials and queue exists in Orchestrator |
| **"No Notifications"** | Run webhook sync: `curl -X POST YOUR_URL/api/webhook-sync?code=KEY` |

📖 **Full troubleshooting guide:** [Visitor Guide - Troubleshooting](docs/guides/VISITOR_ONBOARDING_GUIDE.md#troubleshooting-quick-fixes)

## 🔒 Security Best Practices

1. **Use Azure Key Vault** for storing secrets
2. **Enable Managed Identity** for Function App
3. **Implement IP restrictions** where possible
4. **Regular secret rotation** (every 90 days)
5. **Monitor with Application Insights**
6. **Use function-level authentication** for all endpoints

## 📈 Monitoring

### Application Insights Queries

```kusto
// Recent webhook notifications
traces
| where operation_Name == "webhook-handler"
| where message contains "Processing notification"
| order by timestamp desc
| take 100

// Forwarding statistics
traces
| where message contains "Successfully forwarded"
| summarize count() by bin(timestamp, 1h)
```

## 🚧 Limitations & Solutions

### SharePoint Webhook Limitations:
- Webhook subscriptions expire after maximum 180 days
- SharePoint only supports "updated" changeType
- **Notifications don't include item IDs or change details**
- Rate limits apply to Graph API calls

### Change Detection Solution:
Since SharePoint doesn't tell us which item changed, we use **Delta Query**:
1. When webhook fires, query for all recent changes
2. Filter to items modified in last 5 minutes
3. Compare with stored states to detect field changes
4. Forward enriched notifications with actual change details

Enable with: `clientState: "forward:https://your-url;detectChanges:true"`

## 🛠️ Project Structure

```
sharepoint-webhooks/
├── src/
│   ├── functions/          # Azure Functions endpoints
│   ├── shared/            # Core business logic
│   ├── templates/         # UiPath processors (COSTCO, etc.)
│   └── utilities/         # Production utilities
├── test/                  # Test suites and tools
├── scripts/              # Deployment and setup scripts
├── docs/                 # Comprehensive documentation
└── config/               # Environment configurations
```

## 📚 Documentation & Resources

### 🚀 Getting Started
- **[Visitor Onboarding Guide](docs/guides/VISITOR_ONBOARDING_GUIDE.md)** - Start here! Complete walkthrough with examples
- **[Local Development Setup](docs/guides/LOCAL_DEV_SETUP.md)** - Set up your development environment
- **[Deployment Guide](docs/guides/DEPLOYMENT_GUIDE.md)** - Deploy to production

### 🤖 UiPath Integration
- **[UiPath Integration Guide](docs/uipath-integration.md)** - Complete UiPath setup and configuration
- **[COSTCO Integration Guide](docs/guides/COSTCO_INTEGRATION_GUIDE.md)** - Complete COSTCO setup and configuration
- **[Creating Custom Templates](docs/guides/VISITOR_ONBOARDING_GUIDE.md#option-b-create-custom-template)** - Build your own processors

### 📖 Advanced Topics
- **[Enhanced Forwarding](docs/api/ENHANCED_FORWARDING.md)** - Change detection and enrichment
- **[Architecture Overview](docs/architecture/CURRENT_STATE.md)** - System design and components
- **[API Reference](docs/api/FUNCTION_REFERENCE.md)** - Complete API documentation

### 🛠️ Tools & Utilities
- **Environment Configuration:** See `.env.example` for all options
- **Test Scripts:** Check `test/tools/` for testing utilities
- **Deployment Scripts:** See `scripts/deployment/` for automation

## 🤝 Contributing

We welcome contributions! Please check our [documentation guide](docs/README.md) for documentation standards.

## 📄 License

This solution is provided as-is for SharePoint webhook management and UiPath integration.

---

**Need help?** Start with the **[📚 Visitor Onboarding Guide](docs/guides/VISITOR_ONBOARDING_GUIDE.md)** or explore the [full documentation](docs/README.md).