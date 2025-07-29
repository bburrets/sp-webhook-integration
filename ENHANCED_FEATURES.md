# Enhanced SharePoint Webhook Features

## Overview

The enhanced solution adds the ability to forward SharePoint webhook notifications to custom destinations with enriched payloads containing detailed change information.

## New Features

### 1. Configurable Destination URLs

When creating a subscription, you can now specify where notifications should be forwarded:

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code={function-key}" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/.../lists/...",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "destinationUrl": "https://your-app.com/sharepoint-webhook"
  }'
```

### 2. Enhanced Notification Payload

Your destination URL will receive an enriched payload with:

```json
{
  "subscriptionId": "2fd5351c-f495-4a16-b9db-30ae75783bad",
  "changeType": "updated",
  "tenantId": "f6e7449b-d39b-4300-822f-79267def3ab3",
  "resource": "sites/.../lists/...",
  "siteId": "84040bfe-b8f4-4774-805f-7fd933e96531",
  "listId": "82a105da-8206-4bd0-851b-d3f2260043f4",
  "itemId": "123",
  "webUrl": "https://fambrandsllc.sharepoint.com/sites/sphookmanagement",
  "changedDateTime": "2025-07-29T21:00:00.000Z",
  "graphApiUrl": "https://graph.microsoft.com/v1.0/sites/.../lists/.../items/123",
  "originalNotification": {
    // Original Microsoft Graph notification
  }
}
```

### 3. HTTP Headers

The forwarded request includes special headers:
- `X-SharePoint-Webhook: true` - Identifies the source
- `X-Subscription-Id: {id}` - The subscription ID
- `Content-Type: application/json`

## Implementation Steps

### Step 1: Replace Current Files

1. Backup current files:
```bash
cp src/functions/webhook-handler.js src/functions/webhook-handler-original.js
cp src/functions/subscription-manager.js src/functions/subscription-manager-original.js
```

2. Replace with enhanced versions:
```bash
cp src/functions/webhook-handler-enhanced.js src/functions/webhook-handler.js
cp src/functions/subscription-manager-enhanced.js src/functions/subscription-manager.js
```

### Step 2: Deploy Updates

```bash
func azure functionapp publish webhook-functions-sharepoint-002
```

### Step 3: Create Subscription with Destination

```bash
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/subscription-manager?code={key}" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/82a105da-8206-4bd0-851b-d3f2260043f4",
    "changeType": "updated",
    "notificationUrl": "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler",
    "destinationUrl": "https://your-endpoint.com/webhook"
  }'
```

## Destination Endpoint Requirements

Your destination endpoint should:

1. **Accept POST requests** with JSON payload
2. **Respond quickly** (within 30 seconds)
3. **Return 2xx status** for success
4. **Handle retries** (webhook-handler doesn't retry on failure)

### Example Destination Endpoint (Node.js/Express)

```javascript
app.post('/sharepoint-webhook', (req, res) => {
    const {
        subscriptionId,
        changeType,
        itemId,
        listId,
        graphApiUrl
    } = req.body;

    console.log(`SharePoint ${changeType} event:`, {
        list: listId,
        item: itemId,
        api: graphApiUrl
    });

    // Fetch item details using Graph API
    // Process the change
    // Update your system

    res.status(200).json({ received: true });
});
```

## Using the Graph API URL

The enhanced payload includes a `graphApiUrl` that you can use to fetch the changed item:

```javascript
async function getItemDetails(graphApiUrl) {
    const response = await axios.get(graphApiUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    return response.data;
}
```

## Benefits

1. **Decoupled Architecture**: Separate webhook reception from business logic
2. **Multiple Consumers**: Different lists can notify different systems
3. **Rich Context**: Receive all necessary IDs without parsing
4. **Direct API Access**: Pre-built Graph API URLs for immediate use
5. **Flexible Integration**: Any HTTP endpoint can receive notifications

## Monitoring

View forwarding activity in Function App logs:
- "Forwarding notification to: [URL]"
- "Notification forwarded successfully"
- Error details if forwarding fails

## Security Considerations

1. **HTTPS Only**: Always use HTTPS for destination URLs
2. **Authentication**: Implement authentication on your destination endpoint
3. **Validation**: Verify the `X-SharePoint-Webhook` header
4. **Rate Limiting**: Implement rate limiting on your endpoint
5. **Timeout Handling**: Respond quickly to avoid timeouts

## Troubleshooting

### Notifications not forwarding?
- Check Function App logs for forwarding errors
- Verify destination URL is accessible
- Ensure destination responds within 30 seconds
- Check for SSL/TLS issues

### Missing item details?
- Ensure your app has Graph API permissions
- Use the provided `graphApiUrl` with proper authentication
- Check if the item still exists (might be deleted)

## Future Enhancements

Consider adding:
- Retry logic with exponential backoff
- Dead letter queue for failed forwards
- Batch forwarding for high-volume scenarios
- Webhook signature validation
- Custom headers support