# COSTCO-INLINE Routing Tracker Webhook Setup

## Overview
This document outlines the setup for monitoring the COSTCO US INLINE Routing Tracker PROD list for status changes and sending specific field data to UiPath when records are set to "Send Generated Form".

## Target List Details
- **Site**: COSTCO-INLINE-Trafficking-Routing
- **List**: COSTCO US INLINE Routing Tracker PROD
- **URL**: https://fambrandsllc.sharepoint.com/sites/COSTCO-INLINE-Trafficking-Routing/Lists/COSTCO%20US%20INLINE%20Routing%20Tracker%20PROD/AllItems.aspx
- **Trigger**: Status field = "Send Generated Form"
- **Purpose**: Queue email notifications with routing form attachments

---

## Phase 1: List Discovery & Field Mapping

### Step 1: Discover List Details

Create `src/utilities/discover-costco-list.js`:

```javascript
const axios = require('axios');
const { getAccessToken } = require('../shared/auth');

async function discoverCostcoList() {
    const mockContext = {
        log: console.log,
        log: { error: console.error }
    };

    try {
        const token = await getAccessToken(mockContext);
        
        // Parse the SharePoint URL to get site and list info
        const siteUrl = 'fambrandsllc.sharepoint.com,84040bfe-b8f4-4774-805f-7fd933e96531,d4d47fda-0c90-452e-a9e0-ffbbc99edba8';
        
        // First, get all lists in the site to find the correct list ID
        const listsResponse = await axios.get(
            `https://graph.microsoft.com/v1.0/sites/${siteUrl}/lists`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            }
        );

        // Find the COSTCO list
        const costcoList = listsResponse.data.value.find(list => 
            list.displayName.includes('COSTCO US INLINE Routing Tracker')
        );

        if (costcoList) {
            console.log('✅ Found COSTCO List:');
            console.log('  List ID:', costcoList.id);
            console.log('  Display Name:', costcoList.displayName);
            console.log('  Web URL:', costcoList.webUrl);
            
            // Get column details
            const columnsResponse = await axios.get(
                `https://graph.microsoft.com/v1.0/sites/${siteUrl}/lists/${costcoList.id}/columns`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }
            );

            console.log('\n📋 Relevant Columns:');
            const relevantColumns = [
                'Status', 'Ship To Email', 'Ship Date', 'Style', 
                'PO_no', 'Generated Routing Form URL'
            ];
            
            columnsResponse.data.value.forEach(column => {
                if (relevantColumns.some(name => 
                    column.displayName?.toLowerCase().includes(name.toLowerCase()) ||
                    column.name?.toLowerCase().includes(name.toLowerCase().replace(/\s/g, ''))
                )) {
                    console.log(`  - ${column.displayName}: ${column.name} (${column.type || column['@odata.type']})`);
                }
            });

            return {
                siteId: siteUrl,
                listId: costcoList.id,
                listName: costcoList.displayName
            };
        }

    } catch (error) {
        console.error('Error discovering list:', error.message);
    }
}

discoverCostcoList();
```

### Step 2: Define Field Mappings

Based on the COSTCO list structure, create the field mapping configuration:

```javascript
// src/templates/costco-inline-routing.js
module.exports = {
    name: 'costcoInlineRouting',
    version: '1.0.0',
    
    // Field mappings from SharePoint to UiPath
    fieldMappings: {
        // Status field to monitor
        statusField: 'Status',
        triggerValue: 'Send Generated Form',
        
        // Required fields for UiPath queue
        requiredFields: {
            shipToEmail: 'ShipToEmail',        // or 'Ship_x0020_To_x0020_Email'
            shipDate: 'ShipDate',              // or 'Ship_x0020_Date'
            style: 'Style',
            poNumber: 'PO_no',                 // or 'PO_x005f_no'
            routingFormUrl: 'GeneratedRoutingFormURL'  // or 'Generated_x0020_Routing_x0020_Form_x0020_URL'
        }
    },
    
    // Transform function for UiPath payload
    transform: function(fields) {
        return {
            // Email configuration
            EmailConfig: {
                To: fields.ShipToEmail || fields.Ship_x0020_To_x0020_Email,
                Subject: `COSTCO Routing Form - PO ${fields.PO_no || fields.PO_x005f_no} - ${fields.Style}`,
                Template: 'COSTCORoutingNotification'
            },
            
            // Shipment details
            ShipmentDetails: {
                ShipDate: fields.ShipDate || fields.Ship_x0020_Date,
                Style: fields.Style,
                PONumber: fields.PO_no || fields.PO_x005f_no,
                Status: fields.Status
            },
            
            // Document attachment
            Attachment: {
                DocumentUrl: fields.GeneratedRoutingFormURL || fields.Generated_x0020_Routing_x0020_Form_x0020_URL,
                FileName: `RoutingForm_PO_${fields.PO_no || fields.PO_x005f_no}.pdf`,
                RequiresDownload: true
            },
            
            // Processing metadata
            ProcessingInfo: {
                ProcessType: 'COSTCORoutingFormEmail',
                Priority: 'High',  // Routing forms are high priority
                Source: 'SharePoint-COSTCO-INLINE',
                Timestamp: new Date().toISOString()
            }
        };
    },
    
    // Validation function
    validate: function(fields) {
        const errors = [];
        
        // Check required fields
        if (!fields.ShipToEmail && !fields.Ship_x0020_To_x0020_Email) {
            errors.push('Missing Ship To Email');
        }
        if (!fields.GeneratedRoutingFormURL && !fields.Generated_x0020_Routing_x0020_Form_x0020_URL) {
            errors.push('Missing Generated Routing Form URL');
        }
        if (!fields.PO_no && !fields.PO_x005f_no) {
            errors.push('Missing PO Number');
        }
        
        if (errors.length > 0) {
            throw new Error(`Validation failed: ${errors.join(', ')}`);
        }
        
        return true;
    }
};
```

---

## Phase 2: Enhanced UiPath Dispatcher for COSTCO

### Update UiPath Dispatcher with Status Monitoring

Create/Update `src/functions/uipath-dispatcher-costco.js`:

```javascript
const { app } = require('@azure/functions');
const UiPathQueueClient = require('../shared/uipath-queue-client');
const { getAccessToken } = require('../shared/auth');
const { createLogger } = require('../shared/logger');
const costcoTemplate = require('../templates/costco-inline-routing');

app.http('uipath-dispatcher-costco', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        const logger = createLogger(context);
        logger.logRequest(request);
        
        try {
            const notification = await request.json();
            
            // Log the notification for debugging
            logger.info('COSTCO webhook notification received', {
                subscriptionId: notification.subscriptionId,
                resource: notification.resource,
                changeType: notification.changeType
            });

            // Fetch the changed item from SharePoint
            const itemData = await fetchCostcoItem(notification, context);
            
            // Check if status is "Send Generated Form"
            const statusField = itemData.fields?.Status || itemData.fields?.Status?.Value;
            
            if (statusField !== 'Send Generated Form') {
                logger.info('Skipping - Status is not "Send Generated Form"', {
                    currentStatus: statusField,
                    itemId: itemData.id
                });
                
                return {
                    status: 200,
                    body: {
                        message: 'Item not ready for processing',
                        status: statusField
                    }
                };
            }

            // Validate required fields
            try {
                costcoTemplate.validate(itemData.fields);
            } catch (validationError) {
                logger.error('Validation failed', {
                    error: validationError.message,
                    fields: itemData.fields
                });
                
                // Store in error queue for manual review
                await storeValidationError(itemData, validationError, context);
                
                return {
                    status: 200,
                    body: {
                        message: 'Validation failed - sent to error queue',
                        error: validationError.message
                    }
                };
            }

            // Transform to UiPath payload
            const uipathPayload = {
                Name: `COSTCO_Routing_${itemData.fields.PO_no || itemData.fields.PO_x005f_no}_${Date.now()}`,
                Priority: 'High',
                SpecificContent: costcoTemplate.transform(itemData.fields),
                Reference: `COSTCO_${itemData.id}_${itemData.fields.PO_no || itemData.fields.PO_x005f_no}`,
                DueDate: calculateDueDate(itemData.fields.ShipDate || itemData.fields.Ship_x0020_Date)
            };

            // Log the payload for debugging
            logger.info('Sending to UiPath queue', {
                queueName: 'COSTCORoutingForms',
                poNumber: uipathPayload.SpecificContent.ShipmentDetails.PONumber,
                email: uipathPayload.SpecificContent.EmailConfig.To
            });

            // Send to UiPath queue
            const queueClient = new UiPathQueueClient(context);
            const result = await queueClient.addQueueItem(
                'COSTCORoutingForms',  // Specific queue for COSTCO routing forms
                uipathPayload
            );

            // Update SharePoint item to indicate it's been queued
            await updateSharePointStatus(itemData, 'Queued for Email', context);

            logger.info('Successfully processed COSTCO routing form', {
                itemId: itemData.id,
                queueItemId: result.itemId,
                poNumber: itemData.fields.PO_no || itemData.fields.PO_x005f_no
            });

            return {
                status: 200,
                body: {
                    success: true,
                    queueItemId: result.itemId,
                    message: 'COSTCO routing form queued for email processing'
                }
            };

        } catch (error) {
            logger.error('Error processing COSTCO notification', {
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

async function fetchCostcoItem(notification, context) {
    const token = await getAccessToken(context);
    
    // Extract item ID from notification
    const itemId = notification.resourceData?.id;
    if (!itemId) {
        throw new Error('No item ID in notification');
    }

    // COSTCO list specific IDs
    const siteId = 'fambrandsllc.sharepoint.com,84040bfe-b8f4-4774-805f-7fd933e96531,d4d47fda-0c90-452e-a9e0-ffbbc99edba8';
    const listId = 'YOUR_DISCOVERED_LIST_ID'; // Will be filled after discovery
    
    const axios = require('axios');
    const response = await axios.get(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}?expand=fields`,
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
        siteId: siteId,
        fields: response.data.fields,
        lastModified: response.data.lastModifiedDateTime
    };
}

async function updateSharePointStatus(itemData, newStatus, context) {
    try {
        const token = await getAccessToken(context);
        const axios = require('axios');
        
        await axios.patch(
            `https://graph.microsoft.com/v1.0/sites/${itemData.siteId}/lists/${itemData.listId}/items/${itemData.id}/fields`,
            {
                ProcessingStatus: newStatus,
                LastProcessed: new Date().toISOString()
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        context.log('Updated SharePoint item status', {
            itemId: itemData.id,
            newStatus: newStatus
        });
    } catch (error) {
        context.log.error('Failed to update SharePoint status:', error.message);
        // Don't throw - this is not critical
    }
}

function calculateDueDate(shipDate) {
    if (!shipDate) return null;
    
    const ship = new Date(shipDate);
    const now = new Date();
    
    // If ship date is today or past, set high priority with 2-hour due date
    if (ship <= now) {
        return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    }
    
    // Otherwise, due date is 24 hours before ship date
    return new Date(ship.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

async function storeValidationError(itemData, error, context) {
    // Store in table storage for manual review
    const { TableClient } = require('@azure/data-tables');
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const tableClient = TableClient.fromConnectionString(connectionString, 'ValidationErrors');
    
    await tableClient.createEntity({
        partitionKey: 'COSTCO',
        rowKey: `${Date.now()}_${itemData.id}`,
        itemId: itemData.id,
        poNumber: itemData.fields.PO_no || itemData.fields.PO_x005f_no || 'unknown',
        error: error.message,
        fields: JSON.stringify(itemData.fields),
        timestamp: new Date().toISOString()
    });
}
```

---

## Phase 3: Webhook Creation & Configuration

### Step 1: Create the COSTCO Webhook

```bash
# First, discover the exact list ID using the discovery script
node src/utilities/discover-costco-list.js

# Then create the webhook with the discovered list ID
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=YOUR_FUNCTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com,84040bfe-b8f4-4774-805f-7fd933e96531,d4d47fda-0c90-452e-a9e0-ffbbc99edba8/lists/YOUR_LIST_ID",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/uipath-dispatcher-costco",
    "clientState": "processor:uipath;queue:COSTCORoutingForms;template:costcoInlineRouting;monitor:status"
  }'
```

### Step 2: Configure UiPath Queue

In UiPath Orchestrator, create a queue named "COSTCORoutingForms" with these settings:

```json
{
  "Name": "COSTCORoutingForms",
  "Description": "COSTCO inline routing forms for email processing",
  "MaxNumberOfRetries": 2,
  "AcceptAutomaticallyRetry": true,
  "EnforceUniqueReference": true,
  "SpecificDataJsonSchema": {
    "type": "object",
    "properties": {
      "EmailConfig": {
        "type": "object",
        "properties": {
          "To": { "type": "string" },
          "Subject": { "type": "string" },
          "Template": { "type": "string" }
        }
      },
      "ShipmentDetails": {
        "type": "object",
        "properties": {
          "ShipDate": { "type": "string" },
          "Style": { "type": "string" },
          "PONumber": { "type": "string" },
          "Status": { "type": "string" }
        }
      },
      "Attachment": {
        "type": "object",
        "properties": {
          "DocumentUrl": { "type": "string" },
          "FileName": { "type": "string" },
          "RequiresDownload": { "type": "boolean" }
        }
      }
    }
  }
}
```

---

## Phase 4: Testing

### Step 1: Test Item Fetching

Create `src/utilities/test-costco-item.js`:

```javascript
const axios = require('axios');
const { getAccessToken } = require('../shared/auth');

async function testFetchItem() {
    const mockContext = {
        log: console.log,
        log: { error: console.error }
    };

    try {
        const token = await getAccessToken(mockContext);
        
        // Test with a known item ID
        const siteId = 'fambrandsllc.sharepoint.com,84040bfe-b8f4-4774-805f-7fd933e96531,d4d47fda-0c90-452e-a9e0-ffbbc99edba8';
        const listId = 'YOUR_LIST_ID';
        const itemId = '1'; // Replace with actual item ID
        
        const response = await axios.get(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}?expand=fields`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            }
        );

        console.log('✅ Item fetched successfully:');
        console.log('  Status:', response.data.fields.Status);
        console.log('  Ship To Email:', response.data.fields.ShipToEmail || response.data.fields.Ship_x0020_To_x0020_Email);
        console.log('  Ship Date:', response.data.fields.ShipDate || response.data.fields.Ship_x0020_Date);
        console.log('  Style:', response.data.fields.Style);
        console.log('  PO Number:', response.data.fields.PO_no || response.data.fields.PO_x005f_no);
        console.log('  Form URL:', response.data.fields.GeneratedRoutingFormURL || response.data.fields.Generated_x0020_Routing_x0020_Form_x0020_URL);
        
        return response.data;
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testFetchItem();
```

### Step 2: Test Status Change Processing

Create `src/utilities/test-costco-status.js`:

```javascript
const costcoTemplate = require('../templates/costco-inline-routing');

function testStatusProcessing() {
    // Simulate different item states
    const testCases = [
        {
            name: 'Valid item ready to send',
            fields: {
                Status: 'Send Generated Form',
                ShipToEmail: 'test@example.com',
                ShipDate: '2024-12-20',
                Style: 'ABC123',
                PO_no: 'PO-2024-001',
                GeneratedRoutingFormURL: 'https://sharepoint.com/documents/form.pdf'
            },
            expectedResult: 'success'
        },
        {
            name: 'Item with wrong status',
            fields: {
                Status: 'In Progress',
                ShipToEmail: 'test@example.com',
                // ... other fields
            },
            expectedResult: 'skip'
        },
        {
            name: 'Missing email',
            fields: {
                Status: 'Send Generated Form',
                ShipDate: '2024-12-20',
                Style: 'ABC123',
                PO_no: 'PO-2024-001',
                GeneratedRoutingFormURL: 'https://sharepoint.com/documents/form.pdf'
            },
            expectedResult: 'validation_error'
        }
    ];

    testCases.forEach(testCase => {
        console.log(`\nTesting: ${testCase.name}`);
        
        try {
            // Check status
            if (testCase.fields.Status !== 'Send Generated Form') {
                console.log('  ⏭️  Skipped - wrong status');
                return;
            }
            
            // Validate
            costcoTemplate.validate(testCase.fields);
            
            // Transform
            const payload = costcoTemplate.transform(testCase.fields);
            console.log('  ✅ Success - payload created:');
            console.log('     Email To:', payload.EmailConfig.To);
            console.log('     PO Number:', payload.ShipmentDetails.PONumber);
            
        } catch (error) {
            console.log('  ❌ Error:', error.message);
        }
    });
}

testStatusProcessing();
```

### Step 3: End-to-End Testing

```bash
# 1. Create test item in SharePoint with Status != "Send Generated Form"
# 2. Note the item ID
# 3. Update the item's Status to "Send Generated Form"
# 4. Monitor Application Insights for the webhook trigger

# Query Application Insights
az monitor app-insights query \
  --app webhook-insights \
  --resource-group rg-sharepoint-webhooks \
  --query "traces | where message contains 'COSTCO' | order by timestamp desc | take 20"
```

---

## Monitoring & Alerts

### Application Insights Queries

```kusto
// Monitor COSTCO webhook triggers
traces
| where message contains "COSTCO webhook notification received"
| project timestamp, customDimensions.subscriptionId, customDimensions.changeType
| order by timestamp desc

// Track successful email queue submissions
traces
| where message contains "Successfully processed COSTCO routing form"
| project timestamp, customDimensions.poNumber, customDimensions.queueItemId
| order by timestamp desc

// Monitor validation errors
traces
| where message contains "Validation failed"
| project timestamp, customDimensions.error, customDimensions.itemId
| order by timestamp desc

// Track items by status
traces
| where message contains "Status is not"
| summarize count() by tostring(customDimensions.currentStatus)
```

### Create Alerts

```bash
# Alert for validation failures
az monitor metrics alert create \
  --name "COSTCO-Validation-Failures" \
  --resource-group rg-sharepoint-webhooks \
  --scopes "/subscriptions/.../resourceGroups/rg-sharepoint-webhooks/providers/Microsoft.Insights/components/webhook-insights" \
  --condition "count traces | where message contains 'Validation failed' > 5" \
  --window-size 15m \
  --evaluation-frequency 5m

# Alert for processing failures
az monitor metrics alert create \
  --name "COSTCO-Processing-Failures" \
  --resource-group rg-sharepoint-webhooks \
  --scopes "/subscriptions/.../resourceGroups/rg-sharepoint-webhooks/providers/Microsoft.Insights/components/webhook-insights" \
  --condition "count exceptions | where message contains 'COSTCO' > 2" \
  --window-size 5m \
  --evaluation-frequency 1m
```

---

## UiPath Process Design

### Email Process Workflow

The UiPath process that consumes this queue should:

1. **Get Queue Item** from "COSTCORoutingForms"
2. **Extract Data** from SpecificContent
3. **Download Document** from the DocumentUrl
4. **Send Email** with:
   - To: EmailConfig.To
   - Subject: EmailConfig.Subject
   - Body: Template-based HTML
   - Attachment: Downloaded routing form
5. **Update SharePoint** (optional) to mark as "Email Sent"
6. **Set Transaction Status** to Successful

### Sample UiPath Code

```vb
' Get queue item data
shipToEmail = in_TransactionItem.SpecificContent("EmailConfig")("To").ToString
poNumber = in_TransactionItem.SpecificContent("ShipmentDetails")("PONumber").ToString
documentUrl = in_TransactionItem.SpecificContent("Attachment")("DocumentUrl").ToString

' Download document
Invoke-WebRequest -Uri documentUrl -OutFile routingForm.pdf

' Send email
Send-MailMessage -To shipToEmail `
                 -Subject ("COSTCO Routing Form - PO " + poNumber) `
                 -Body htmlBody `
                 -Attachments @("routingForm.pdf")
```

---

## Development/Testing Checklist

- [ ] Run discovery script to get exact list ID
- [ ] Update list ID in webhook creation script
- [ ] Deploy uipath-dispatcher-costco function
- [ ] Create COSTCORoutingForms queue in UiPath
- [ ] Create webhook on COSTCO list
- [ ] Test with item that has Status != "Send Generated Form"
- [ ] Change item Status to "Send Generated Form"
- [ ] Verify webhook triggers
- [ ] Verify UiPath queue receives item
- [ ] Monitor Application Insights
- [ ] Set up alerts for failures
- [ ] Document field mappings for support team

---

## Troubleshooting Guide

### Issue: Webhook not triggering
```bash
# Check webhook exists
curl -X GET "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=YOUR_KEY"

# Check webhook expiration
# SharePoint webhooks expire after 180 days
```

### Issue: Fields are null/undefined
```javascript
// SharePoint encodes spaces and special characters
// Common encodings:
// Space = _x0020_
// Underscore = _x005f_
// Parenthesis = _x0028_ and _x0029_

// Check both versions:
const email = fields.ShipToEmail || fields.Ship_x0020_To_x0020_Email;
const poNumber = fields.PO_no || fields.PO_x005f_no;
```

### Issue: Status not matching
```javascript
// Status might be a complex object
const status = fields.Status?.Value || fields.Status;

// Log the actual structure
console.log('Status field structure:', JSON.stringify(fields.Status));
```

---

This setup provides a complete solution for monitoring the COSTCO-INLINE list for status changes and queuing email notifications with routing form attachments when items are set to "Send Generated Form".