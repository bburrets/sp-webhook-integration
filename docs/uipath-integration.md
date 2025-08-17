# UiPath Integration Documentation

## Overview

The UiPath integration enables automatic processing of SharePoint list items through UiPath Orchestrator queues. When specific conditions are met (such as status changes), the system will fetch the complete item data, transform it using predefined templates, and submit it to UiPath queues for robotic process automation.

## Architecture

### Components

1. **UiPath Dispatcher** (`src/functions/uipath-dispatcher.js`)
   - Main Azure Function that processes webhook notifications for UiPath routing
   - Fetches SharePoint item details and applies business logic
   - Routes items to appropriate processors based on configuration

2. **UiPath Authentication** (`src/shared/uipath-auth.js`)
   - Handles OAuth2 authentication with UiPath Orchestrator
   - Implements token caching for performance optimization
   - Manages authentication errors and retries

3. **UiPath Queue Client** (`src/shared/uipath-queue-client.js`)
   - Submits queue items to UiPath Orchestrator
   - Handles retry logic and error handling
   - Supports different queue priorities and references

4. **COSTCO Template** (`src/templates/costco-inline-routing.js`)
   - Business-specific processor for COSTCO inline routing items
   - Validates required fields and status conditions
   - Transforms SharePoint data to UiPath queue format

5. **Enhanced Webhook Handler** (`src/functions/webhook-handler.js`)
   - Updated to route notifications to UiPath dispatcher when appropriate
   - Maintains existing forwarding functionality
   - Supports multiple processing paths

## Configuration

### Prerequisites
- ✅ Existing SharePoint webhook solution deployed
- ✅ UiPath Orchestrator instance configured
- ✅ Azure CLI access
- ✅ Function App already running

### Step 1: Create UiPath API Credentials

#### Option A: Using External Application (Recommended)
1. **In UiPath Orchestrator:**
   ```
   Admin → External Applications → Add Application
   - Name: SharePoint-Webhook-Integration
   - Application Type: Confidential application
   - Redirect URL: https://localhost (not used but required)
   ```

2. **Copy the credentials:**
   - App ID (Client ID)
   - App Secret (Client Secret)
   - Note your Tenant Name and Organization Unit

#### Option B: Using API Access (Legacy)
1. **In UiPath Orchestrator:**
   ```
   Admin → API Access → Add
   - Name: SharePoint-Integration
   - Scope: OR.Queues
   ```

### Environment Variables

#### Using Azure CLI to Configure Function App

```bash
# Set variables
RESOURCE_GROUP="rg-sharepoint-webhooks"
FUNCTION_APP="webhook-functions-sharepoint-002"

# Add UiPath credentials as app settings
az functionapp config appsettings set \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --settings \
    UIPATH_ORCHESTRATOR_URL="https://cloud.uipath.com/[your-account]/[your-tenant]/orchestrator_" \
    UIPATH_TENANT_NAME="[your-tenant-name]" \
    UIPATH_CLIENT_ID="[your-client-id]" \
    UIPATH_CLIENT_SECRET="[your-client-secret]" \
    UIPATH_ORGANIZATION_UNIT_ID="[your-folder-id]"

# Optional: Add queue-specific settings
az functionapp config appsettings set \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --settings \
    UIPATH_DEFAULT_QUEUE="SharePointChanges" \
    UIPATH_TIMEOUT_MS="30000" \
    UIPATH_RETRY_ATTEMPTS="3"
```

#### Manual Configuration
Add these to your Function App configuration:

```bash
# UiPath Orchestrator Configuration
UIPATH_ORCHESTRATOR_URL=https://your-orchestrator.uipath.com
UIPATH_TENANT_NAME=your-tenant-name
UIPATH_CLIENT_ID=your-client-id
UIPATH_CLIENT_SECRET=your-client-secret
UIPATH_ORGANIZATION_UNIT_ID=your-org-unit-id
UIPATH_DEFAULT_QUEUE=Default-Queue

# Feature Flags
UIPATH_ENABLED=true
UIPATH_AUTO_RETRY=true
UIPATH_LOGGING=true
ENABLE_TOKEN_CACHE=true
```

### SharePoint Webhook Configuration

To enable UiPath processing for a SharePoint list, configure the webhook with appropriate clientState:

```javascript
// Examples of clientState values that trigger UiPath processing:
"processor:uipath"
"forward:https://example.com/webhook;processor:uipath"
"uipath:enabled"
"uipath=true"
```

## Usage

### COSTCO Inline Routing Example

1. **Setup**: Configure a webhook on the COSTCO Inline Routing list with clientState: `processor:uipath`

2. **Trigger**: When an item's Status field changes to "Send Generated Form"

3. **Processing**: The system will:
   - Validate required fields (Ship To Email, Ship Date, Style, PO Number)
   - Transform data to UiPath format
   - Submit to the COSTCO-INLINE-Routing queue with High priority

### Custom Templates

To add support for other lists, create a new template similar to `costco-inline-routing.js`:

```javascript
// src/templates/your-template.js
class YourTemplateProcessor {
    shouldProcessItem(item, previousItem) {
        // Define trigger conditions
        return item.Status === 'Ready for Processing';
    }
    
    validateRequiredFields(item) {
        // Validate required fields
    }
    
    transformItemData(item) {
        // Transform SharePoint data to UiPath format
    }
    
    async processItem(item, previousItem) {
        // Main processing logic
    }
}
```

## API Endpoints

### UiPath Dispatcher
- **URL**: `/api/uipath-dispatcher`
- **Method**: POST
- **Purpose**: Process webhook notifications for UiPath routing
- **Input**: SharePoint webhook notification payload
- **Output**: Processing results with success/failure status

### UiPath Test Function
- **URL**: `/api/uipath-test`
- **Method**: GET/POST
- **Purpose**: Test UiPath integration components
- **Parameters**: 
  - `test=auth` - Test authentication
  - `test=queue` - Test queue submission
  - `test=costco` - Test COSTCO processing
  - `test=dispatcher` - Test full workflow
  - `test=config` - Test configuration
  - `test=all` - Run all tests

## Implementation

### Step 1: Install Required Packages

```bash
cd sharepoint-webhooks
npm install axios axios-retry
```

### Step 2: Test UiPath Authentication

Create `src/utilities/test-uipath-auth.js`:

```javascript
const UiPathAuth = require('../shared/uipath-auth');

async function testAuth() {
    const mockContext = {
        log: console.log,
        log: { error: console.error }
    };

    try {
        const auth = new UiPathAuth(mockContext);
        const token = await auth.getAccessToken();
        console.log('✅ Authentication successful!');
        console.log('Token (first 20 chars):', token.substring(0, 20) + '...');
    } catch (error) {
        console.error('❌ Authentication failed:', error.message);
    }
}

testAuth();
```

Run: `node src/utilities/test-uipath-auth.js`

### Step 3: Test Queue Submission

Create `src/utilities/test-uipath-queue.js`:

```javascript
const UiPathQueueClient = require('../shared/uipath-queue-client');

async function testQueueSubmission() {
    const mockContext = {
        log: console.log,
        log: { error: console.error }
    };

    const client = new UiPathQueueClient(mockContext);
    
    const testItem = {
        Name: `Test_SharePoint_${Date.now()}`,
        Priority: 'Normal',
        SpecificContent: {
            TestField: 'Test Value',
            Timestamp: new Date().toISOString(),
            Source: 'SharePoint Test'
        }
    };

    try {
        const result = await client.addQueueItem('YourQueueName', testItem);
        console.log('✅ Queue item added successfully:', result);
    } catch (error) {
        console.error('❌ Failed to add queue item:', error.message);
    }
}

testQueueSubmission();
```

## Testing

### Manual Testing

1. **Authentication Test**:
   ```
   GET /api/uipath-test?test=auth
   ```

2. **Queue Submission Test**:
   ```
   GET /api/uipath-test?test=queue
   ```

3. **Full Integration Test**:
   ```
   GET /api/uipath-test?test=all
   ```

### SharePoint Testing

1. Create a test item in the COSTCO list
2. Set clientState to `processor:uipath` in webhook configuration
3. Update the item's Status to "Send Generated Form"
4. Monitor logs for processing results

### Create Test Webhook

```bash
# Create a webhook with UiPath processor
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=YOUR_FUNCTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/YourSite:/lists/YOUR_LIST_ID",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "clientState": "processor:uipath;queue:SharePointChanges;template:invoice"
  }'
```

## Monitoring and Troubleshooting

### Logs

The integration provides comprehensive logging with the following log levels:

- **INFO**: Normal processing flow
- **WARN**: Non-critical issues (e.g., items not meeting criteria)
- **ERROR**: Critical errors requiring attention
- **DEBUG**: Detailed debugging information

### Common Issues

1. **Authentication Failures**
   - Check UiPath credentials and permissions
   - Verify Orchestrator URL and tenant name
   - Ensure organization unit ID is correct
   
   ```bash
   # Verify credentials are set
   az functionapp config appsettings list \
     --name webhook-functions-sharepoint-002 \
     --resource-group rg-sharepoint-webhooks \
     | grep UIPATH
   ```

2. **Queue Submission Failures**
   - Verify queue exists in UiPath Orchestrator
   - Check queue permissions
   - Validate data format and required fields
   - Verify queue name exists in Orchestrator
   - Check Organization Unit ID is correct
   - Ensure queue is in the specified folder

3. **Item Not Processed**
   - Verify clientState configuration
   - Check if item meets trigger conditions (status, required fields)
   - Review processor logic for specific templates

4. **Token Expiry Issues**
   - Token cache is per function instance
   - Cold starts will require new token
   - Monitor token acquisition in logs

### Performance Considerations

- Token caching reduces authentication overhead
- Retry logic handles transient failures
- Async processing prevents webhook timeouts
- Background operations don't block notifications

## Security

- Credentials stored securely in Function App settings
- Authentication tokens cached in memory only
- All API calls use HTTPS
- Input validation prevents injection attacks
- Comprehensive error handling prevents information leakage

## Configuration Reference

### ClientState Format for UiPath Processing

```
processor:uipath;queue:[QueueName];template:[TemplateName];priority:[Priority]
```

Examples:
- `processor:uipath;queue:InvoiceProcessing;template:invoice;priority:High`
- `processor:uipath;queue:COSTCOTracking;template:costcoTracking`
- `processor:uipath;queue:GeneralChanges;template:default`

### Application Insights Monitoring

```javascript
// Add to uipath-dispatcher.js
context.log.metric('UiPathQueueSubmission', 1, {
    queueName: config.queueName,
    template: config.template,
    success: result.success
});
```

### Query Application Insights

```kusto
// Successful UiPath submissions
customMetrics
| where name == "UiPathQueueSubmission"
| where customDimensions.success == "true"
| summarize count() by bin(timestamp, 1h), tostring(customDimensions.queueName)

// Failed submissions
traces
| where message contains "Failed to add queue item"
| project timestamp, message, customDimensions
```

## Production Checklist

- [ ] UiPath credentials stored in Azure App Settings
- [ ] Test authentication successful
- [ ] Test queue submission successful
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Retry logic enabled
- [ ] Monitoring alerts set up
- [ ] Documentation updated

## Future Enhancements

- Support for additional SharePoint list types
- Queue item status monitoring and callbacks
- Advanced retry strategies with exponential backoff
- Integration with Azure Service Bus for reliable messaging
- Support for UiPath process triggering (not just queue items)
- Support for bulk queue item processing
- Advanced filtering and routing rules
- UI for configuring mappings