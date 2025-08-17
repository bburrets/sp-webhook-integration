# UiPath Orchestrator Integration - Simplified Implementation Guide

## Overview
This guide focuses on integrating UiPath Orchestrator queue API with your existing SharePoint webhook solution using minimal infrastructure changes. We'll leverage your current Azure Function setup and add UiPath queue submission capabilities.

## Prerequisites
- ✅ Existing SharePoint webhook solution deployed
- ✅ UiPath Orchestrator instance configured
- ✅ Azure CLI access
- ✅ Function App already running

---

## Phase 1: UiPath Orchestrator API Setup

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

### Step 2: Store Credentials in Azure

Using Azure CLI to add credentials to your existing Function App:

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

---

## Phase 2: Implement UiPath Queue Integration

### Step 1: Install Required Packages

```bash
cd sharepoint-webhooks
npm install axios axios-retry
```

### Step 2: Create UiPath Authentication Module

Create `src/shared/uipath-auth.js`:

```javascript
const axios = require('axios');
const { getConfigValue } = require('./config');

class UiPathAuth {
    constructor(context) {
        this.context = context;
        this.token = null;
        this.tokenExpiry = null;
        
        // Load configuration
        this.orchestratorUrl = getConfigValue('UIPATH_ORCHESTRATOR_URL');
        this.tenantName = getConfigValue('UIPATH_TENANT_NAME');
        this.clientId = getConfigValue('UIPATH_CLIENT_ID');
        this.clientSecret = getConfigValue('UIPATH_CLIENT_SECRET');
        this.organizationUnitId = getConfigValue('UIPATH_ORGANIZATION_UNIT_ID');
    }

    async getAccessToken() {
        // Check if we have a valid cached token
        if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.token;
        }

        try {
            const tokenUrl = `${this.orchestratorUrl}/identity/connect/token`;
            
            const response = await axios.post(tokenUrl, 
                new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    scope: 'OR.Queues OR.Execution'
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: 30000
                }
            );

            this.token = response.data.access_token;
            // Set expiry to 5 minutes before actual expiry
            this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
            
            this.context.log('UiPath token obtained successfully');
            return this.token;
            
        } catch (error) {
            this.context.log.error('Failed to get UiPath token:', error.message);
            throw new Error(`UiPath authentication failed: ${error.message}`);
        }
    }
}

module.exports = UiPathAuth;
```

### Step 3: Create UiPath Queue Client

Create `src/shared/uipath-queue-client.js`:

```javascript
const axios = require('axios');
const axiosRetry = require('axios-retry');
const UiPathAuth = require('./uipath-auth');
const { getConfigValue } = require('./config');

class UiPathQueueClient {
    constructor(context) {
        this.context = context;
        this.auth = new UiPathAuth(context);
        this.orchestratorUrl = getConfigValue('UIPATH_ORCHESTRATOR_URL');
        this.tenantName = getConfigValue('UIPATH_TENANT_NAME');
        this.organizationUnitId = getConfigValue('UIPATH_ORGANIZATION_UNIT_ID');
        
        // Configure axios with retry logic
        this.httpClient = axios.create({
            timeout: parseInt(getConfigValue('UIPATH_TIMEOUT_MS', '30000'))
        });
        
        axiosRetry(this.httpClient, {
            retries: parseInt(getConfigValue('UIPATH_RETRY_ATTEMPTS', '3')),
            retryDelay: axiosRetry.exponentialDelay
        });
    }

    async addQueueItem(queueName, itemData, options = {}) {
        try {
            const token = await this.auth.getAccessToken();
            
            const queueItem = {
                itemData: {
                    Name: itemData.Name || `SP_${Date.now()}`,
                    Priority: itemData.Priority || 'Normal',
                    SpecificContent: itemData.SpecificContent || itemData,
                    Reference: itemData.Reference || null,
                    DueDate: itemData.DueDate || null
                }
            };

            const response = await this.httpClient.post(
                `${this.orchestratorUrl}/odata/Queues/UiPathODataSvc.AddQueueItem`,
                {
                    queueName: queueName,
                    ...queueItem
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'X-UIPATH-TenantName': this.tenantName,
                        'X-UIPATH-OrganizationUnitId': this.organizationUnitId
                    }
                }
            );

            this.context.log('Queue item added successfully', {
                queueName,
                itemId: response.data.Id,
                status: response.data.Status
            });

            return {
                success: true,
                itemId: response.data.Id,
                status: response.data.Status
            };

        } catch (error) {
            this.context.log.error('Failed to add queue item:', {
                error: error.message,
                queueName,
                response: error.response?.data
            });
            
            throw error;
        }
    }

    async bulkAddQueueItems(queueName, items) {
        try {
            const token = await this.auth.getAccessToken();
            
            const queueItems = items.map(item => ({
                itemData: {
                    Name: item.Name || `SP_${Date.now()}_${Math.random()}`,
                    Priority: item.Priority || 'Normal',
                    SpecificContent: item.SpecificContent || item,
                    Reference: item.Reference || null
                }
            }));

            const response = await this.httpClient.post(
                `${this.orchestratorUrl}/odata/Queues/UiPathODataSvc.BulkAddQueueItems`,
                {
                    queueName: queueName,
                    queueItems: queueItems
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'X-UIPATH-TenantName': this.tenantName,
                        'X-UIPATH-OrganizationUnitId': this.organizationUnitId
                    }
                }
            );

            this.context.log('Bulk queue items added', {
                queueName,
                count: items.length
            });

            return response.data;

        } catch (error) {
            this.context.log.error('Failed to bulk add queue items:', error.message);
            throw error;
        }
    }
}

module.exports = UiPathQueueClient;
```

### Step 4: Create UiPath Dispatcher Function

Create `src/functions/uipath-dispatcher.js`:

```javascript
const { app } = require('@azure/functions');
const UiPathQueueClient = require('../shared/uipath-queue-client');
const { getAccessToken } = require('../shared/auth');
const { getConfigValue } = require('../shared/config');
const { createLogger } = require('../shared/logger');

app.http('uipath-dispatcher', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        const logger = createLogger(context);
        logger.logRequest(request);
        
        try {
            // Parse the incoming webhook notification
            const notification = await request.json();
            
            // Extract configuration from clientState
            const config = parseClientState(notification.clientState);
            
            // Skip if not configured for UiPath
            if (!config.processor || config.processor !== 'uipath') {
                return { 
                    status: 200, 
                    body: { message: 'Not configured for UiPath processing' }
                };
            }

            // Fetch item details from SharePoint
            const itemData = await fetchSharePointItem(notification, context);
            
            // Transform to UiPath payload
            const uipathPayload = transformToUiPathPayload(itemData, config);
            
            // Send to UiPath queue
            const queueClient = new UiPathQueueClient(context);
            const result = await queueClient.addQueueItem(
                config.queueName || getConfigValue('UIPATH_DEFAULT_QUEUE', 'SharePointChanges'),
                uipathPayload
            );

            logger.info('Successfully processed notification for UiPath', {
                subscriptionId: notification.subscriptionId,
                itemId: itemData.id,
                queueItemId: result.itemId
            });

            return {
                status: 200,
                body: {
                    success: true,
                    queueItemId: result.itemId,
                    message: 'Notification processed and sent to UiPath'
                }
            };

        } catch (error) {
            logger.error('Error processing UiPath notification', {
                error: error.message,
                stack: error.stack
            });

            return {
                status: 500,
                body: {
                    success: false,
                    error: error.message
                }
            };
        }
    }
});

function parseClientState(clientState) {
    // Parse enhanced clientState format
    // Example: "forward:url;processor:uipath;queue:TestQueue;template:invoice"
    const config = {};
    
    if (!clientState) return config;
    
    const parts = clientState.split(';');
    for (const part of parts) {
        const [key, value] = part.split(':');
        config[key] = value;
    }
    
    return config;
}

async function fetchSharePointItem(notification, context) {
    try {
        const token = await getAccessToken(context);
        
        // Parse the resource to get site and list info
        const resourceParts = notification.resource.split('/');
        const siteUrl = `https://graph.microsoft.com/v1.0/sites/${resourceParts[1]}`;
        const listId = resourceParts[3];
        const itemId = notification.resourceData?.id;

        if (!itemId) {
            return { 
                id: 'unknown',
                notification: notification 
            };
        }

        // Fetch item from SharePoint
        const axios = require('axios');
        const response = await axios.get(
            `${siteUrl}/lists/${listId}/items/${itemId}?expand=fields`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            }
        );

        return {
            id: itemId,
            listId: listId,
            siteUrl: resourceParts[1],
            fields: response.data.fields,
            lastModified: response.data.lastModifiedDateTime,
            createdBy: response.data.createdBy?.user?.email,
            modifiedBy: response.data.lastModifiedBy?.user?.email
        };

    } catch (error) {
        context.log.error('Error fetching SharePoint item:', error.message);
        throw error;
    }
}

function transformToUiPathPayload(itemData, config) {
    // Basic transformation - customize based on your needs
    const payload = {
        Name: `SharePoint_${itemData.listId}_${itemData.id}_${Date.now()}`,
        Priority: determinePriority(itemData, config),
        SpecificContent: {
            // SharePoint metadata
            SharePointItemId: itemData.id,
            SharePointListId: itemData.listId,
            SharePointSiteUrl: itemData.siteUrl,
            LastModified: itemData.lastModified,
            ModifiedBy: itemData.modifiedBy,
            
            // Item fields - customize based on your list
            Title: itemData.fields?.Title,
            Status: itemData.fields?.Status,
            
            // Add any specific fields based on template
            ...getTemplateFields(itemData.fields, config.template),
            
            // Processing metadata
            ProcessedAt: new Date().toISOString(),
            ProcessingType: config.template || 'default',
            SourceSystem: 'SharePoint'
        },
        Reference: `${itemData.siteUrl}/${itemData.listId}/${itemData.id}`
    };

    return payload;
}

function determinePriority(itemData, config) {
    // Add your priority logic here
    if (config.priority) return config.priority;
    if (itemData.fields?.Priority) return itemData.fields.Priority;
    if (itemData.fields?.Urgency === 'High') return 'High';
    return 'Normal';
}

function getTemplateFields(fields, template) {
    // Add template-specific field mappings
    const templates = {
        invoice: {
            InvoiceNumber: fields?.InvoiceNumber,
            Amount: fields?.Amount,
            VendorName: fields?.Vendor?.LookupValue || fields?.Vendor,
            DueDate: fields?.DueDate
        },
        costcoTracking: {
            TrackingNumber: fields?.TrackingNumber,
            PONumber: fields?.PONumber,
            StoreNumber: fields?.StoreNumber,
            Department: fields?.Department
        },
        default: {}
    };

    return templates[template] || templates.default;
}
```

### Step 5: Update Webhook Handler to Route to UiPath

Update `src/functions/webhook-handler.js` to include UiPath routing:

```javascript
// Add to existing webhook-handler.js

async function routeNotification(notification, context) {
    const config = parseClientState(notification.clientState);
    
    // Check if this should go to UiPath
    if (config.processor === 'uipath') {
        const axios = require('axios');
        const functionKey = process.env.FUNCTION_KEY; // Your function key
        
        try {
            const response = await axios.post(
                `https://${process.env.WEBSITE_HOSTNAME}/api/uipath-dispatcher?code=${functionKey}`,
                notification,
                { timeout: 30000 }
            );
            
            context.log('Notification routed to UiPath dispatcher', {
                status: response.status,
                result: response.data
            });
            
            return response.data;
        } catch (error) {
            context.log.error('Failed to route to UiPath:', error.message);
            throw error;
        }
    }
    
    // Continue with existing forwarding logic
    return null;
}
```

---

## Phase 3: Testing & Validation

### Step 1: Test UiPath Authentication

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

### Step 2: Test Queue Submission

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

### Step 3: Create Test Webhook

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

---

## Configuration Reference

### ClientState Format for UiPath Processing

```
processor:uipath;queue:[QueueName];template:[TemplateName];priority:[Priority]
```

Examples:
- `processor:uipath;queue:InvoiceProcessing;template:invoice;priority:High`
- `processor:uipath;queue:COSTCOTracking;template:costcoTracking`
- `processor:uipath;queue:GeneralChanges;template:default`

### Environment Variables

```bash
# Required
UIPATH_ORCHESTRATOR_URL=https://cloud.uipath.com/[account]/[tenant]/orchestrator_
UIPATH_TENANT_NAME=YourTenantName
UIPATH_CLIENT_ID=your-client-id
UIPATH_CLIENT_SECRET=your-client-secret
UIPATH_ORGANIZATION_UNIT_ID=folder-id

# Optional
UIPATH_DEFAULT_QUEUE=SharePointChanges
UIPATH_TIMEOUT_MS=30000
UIPATH_RETRY_ATTEMPTS=3
```

---

## Monitoring

### Add to Application Insights

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

---

## Troubleshooting

### Common Issues

1. **Authentication Fails**
   ```bash
   # Verify credentials are set
   az functionapp config appsettings list \
     --name webhook-functions-sharepoint-002 \
     --resource-group rg-sharepoint-webhooks \
     | grep UIPATH
   ```

2. **Queue Not Found**
   - Verify queue name exists in Orchestrator
   - Check Organization Unit ID is correct
   - Ensure queue is in the specified folder

3. **Token Expiry Issues**
   - Token cache is per function instance
   - Cold starts will require new token
   - Monitor token acquisition in logs

---

## Production Checklist

- [ ] UiPath credentials stored in Azure App Settings
- [ ] Test authentication successful
- [ ] Test queue submission successful
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Retry logic enabled
- [ ] Monitoring alerts set up
- [ ] Documentation updated

---

## Next Steps

1. **Test with real SharePoint changes**
2. **Monitor queue processing in UiPath**
3. **Add custom templates for different list types**
4. **Set up alerts for failures**
5. **Optimize batch processing if needed**

---

This simplified approach integrates UiPath with your existing infrastructure without major changes, focusing on practical implementation using your current Azure Function setup.