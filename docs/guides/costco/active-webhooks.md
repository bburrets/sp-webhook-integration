# COSTCO Webhook - Active Configuration

## ✅ Webhook Successfully Created

**Created:** August 16, 2025  
**Webhook ID:** `0e955659-b3a9-412b-a1b2-e095ec64bcba`  
**Expires:** August 19, 2025 (3 days)  

## Configuration Details

### SharePoint List
- **Site:** COSTCO-INLINE-Trafficking-Routing
- **List:** COSTCO US INLINE Routing Tracker (PROD)
- **List ID:** 8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3
- **URL:** https://fambrandsllc.sharepoint.com/sites/COSTCO-INLINE-Trafficking-Routing/Lists/COSTCO%20US%20INLINE%20Routing%20Tracker%20PROD

### Webhook Settings
- **Notification URL:** https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler
- **Client State:** `uipath:TEST_API;costco:routing`
- **Change Type:** updated
- **Resource:** `sites/fambrandsllc.sharepoint.com:/sites/COSTCO-INLINE-Trafficking-Routing:/lists/8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3`

### UiPath Integration
- **Queue:** TEST_API
- **Organization Unit:** 376892
- **Tenant:** FAMBrands_RPAOPS_PROD
- **Orchestrator:** https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_

## How It Works

1. **Trigger:** Any update to items in the COSTCO list
2. **Webhook Handler:** Receives notification from SharePoint
3. **Client State Parsing:** Identifies `uipath:TEST_API` directive
4. **Queue Submission:** Creates UiPath queue item with flattened SharePoint data
5. **Fields Captured:**
   - Ship To Email
   - Ship Date
   - Style
   - PO Number
   - Generated Routing Form URL
   - Status
   - And all other list fields

## Testing the Integration

### Step 1: Update a SharePoint Item

1. Navigate to: [COSTCO List](https://fambrandsllc.sharepoint.com/sites/COSTCO-INLINE-Trafficking-Routing/Lists/COSTCO%20US%20INLINE%20Routing%20Tracker%20PROD)
2. Edit any item
3. Set **Status** to `Send Generated Form`
4. Save the item

### Step 2: Monitor Webhook Activity

Check Azure Function logs:
```bash
az webapp log tail --name webhook-functions-sharepoint-002 --resource-group rg-sharepoint-webhooks | grep "webhook-handler"
```

### Step 3: Check UiPath Queue

1. Go to: https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_
2. Navigate to Queues → TEST_API
3. Look for new queue items with:
   - Reference starting with `COSTCO_`
   - Priority: High
   - SpecificContent containing SharePoint fields

## Manual Test Command

To simulate a webhook notification:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler" \
  -H "Content-Type: application/json" \
  -d '{
    "value": [{
      "subscriptionId": "0e955659-b3a9-412b-a1b2-e095ec64bcba",
      "clientState": "uipath:TEST_API;costco:routing",
      "resource": "sites/fambrandsllc.sharepoint.com:/sites/COSTCO-INLINE-Trafficking-Routing:/lists/8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3",
      "changeType": "updated",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.ListItem",
        "id": "123"
      }
    }]
  }'
```

## Maintenance

### Check Webhook Status
```bash
curl -X GET "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_FUNCTION_KEY>" \
  -H "Accept: application/json" | jq '.subscriptions[] | select(.id=="0e955659-b3a9-412b-a1b2-e095ec64bcba")'
```

### Renew Webhook (Before Expiration)
```bash
curl -X PATCH "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_FUNCTION_KEY>&subscriptionId=0e955659-b3a9-412b-a1b2-e095ec64bcba" \
  -H "Content-Type: application/json" \
  -d '{
    "expirationDateTime": "'$(date -u -v+3d '+%Y-%m-%dT%H:%M:%S.000Z')'"
  }'
```

### Delete Webhook (If Needed)
```bash
curl -X DELETE "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code=<YOUR_FUNCTION_KEY>&subscriptionId=0e955659-b3a9-412b-a1b2-e095ec64bcba"
```

## Troubleshooting

### Common Issues

1. **No notifications received:**
   - Verify webhook is active (check status command)
   - Ensure item is actually being modified (not just viewed)
   - Check Azure Function logs for errors

2. **UiPath queue item not created:**
   - Verify UIPATH_ENABLED=true in Function App settings
   - Check UiPath credentials are correct
   - Ensure TEST_API queue exists in folder 376892

3. **Webhook expired:**
   - Webhooks expire after 3 days
   - Run the renewal command before expiration
   - Set up automated renewal using webhook-sync function

## Implementation Files

- **Webhook Handler:** `src/functions/webhook-handler.js`
- **UiPath Dispatcher:** `src/functions/uipath-dispatcher.js`
- **Queue Client:** `src/shared/uipath-queue-client.js`
- **COSTCO Template:** `src/templates/costco-inline-routing.js`
- **Setup Utility:** `src/utilities/setup-costco-webhook.js`

## Next Steps

1. ✅ Webhook created and active
2. ⏳ Test with actual SharePoint item update
3. ⏳ Verify UiPath queue item creation
4. ⏳ Set up automated webhook renewal
5. ⏳ Deploy to production when ready