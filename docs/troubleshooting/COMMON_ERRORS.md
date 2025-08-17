# Common Errors and Troubleshooting Guide

## Quick Troubleshooting Reference

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid or expired credentials | Check Azure AD app registration and secrets |
| `403 Forbidden` | Insufficient permissions | Verify Graph API permissions and admin consent |
| `404 Not Found` | Wrong resource path or deleted item | Verify SharePoint site/list exists and path format |
| `429 Too Many Requests` | Rate limiting | Implement retry logic with exponential backoff |
| `500 Internal Server Error` | Function app error | Check function logs in Application Insights |
| `InvalidAuthenticationToken` | Token expired or malformed | Clear token cache, check credentials |
| `Webhook validation failed` | Incorrect validation response | Ensure handler returns validation token as plain text |

## Detailed Troubleshooting

### Authentication Issues

#### Error: "InvalidAuthenticationToken"
```json
{
  "error": {
    "code": "InvalidAuthenticationToken",
    "message": "Access token validation failure"
  }
}
```

**Solutions:**
1. Verify Azure AD app registration:
   ```bash
   az ad app show --id $AZURE_CLIENT_ID
   ```

2. Check client secret hasn't expired:
   ```bash
   az ad app credential list --id $AZURE_CLIENT_ID
   ```

3. Ensure correct tenant ID:
   ```bash
   echo $AZURE_TENANT_ID
   ```

4. Clear token cache and retry

#### Error: "InsufficientPrivileges"
**Solutions:**
1. Verify API permissions in Azure Portal
2. Ensure admin consent is granted:
   - Required: `Sites.Read.All` or `Sites.ReadWrite.All`
3. Re-grant admin consent if needed

### Webhook Issues

#### Error: "Webhook creation failed"
**Common Causes:**
1. Notification URL not publicly accessible
2. Validation token not returned correctly
3. SharePoint list doesn't exist

**Diagnostic Steps:**
```bash
# Test webhook handler accessibility
curl "https://your-app.azurewebsites.net/api/webhook-handler?validationToken=test"
# Should return: test

# Verify SharePoint list exists
node test/tools/sharepoint/check-list-columns.js
```

#### Error: "Webhook notifications not received"
**Solutions:**
1. Check webhook hasn't expired (max 180 days):
   ```bash
   curl "https://your-app.azurewebsites.net/api/subscription-manager?code=KEY"
   ```

2. Verify webhook is active in SharePoint:
   ```bash
   curl -X POST "https://your-app.azurewebsites.net/api/webhook-sync?code=KEY"
   ```

3. Check Function App is running:
   ```bash
   az functionapp show --name your-app --resource-group your-rg --query "state"
   ```

### UiPath Integration Issues

#### Error: "Failed to add queue item"
**Common Causes:**
1. Invalid UiPath credentials
2. Queue doesn't exist
3. Incorrect folder/organization unit ID

**Solutions:**
```bash
# Verify UiPath configuration
az functionapp config appsettings list --name your-app --resource-group your-rg | grep UIPATH

# Test UiPath authentication
node test/tools/uipath/test-uipath-auth.js

# List available queues
node test/tools/uipath/test-list-queues.js
```

#### Error: "UiPath token expired"
**Solution:**
Token caching issue - the system should auto-refresh. If not:
1. Check `ENABLE_TOKEN_CACHE` is true
2. Verify system time is correct
3. Restart Function App to clear cache

### SharePoint Data Issues

#### Error: "Field not found"
**Common Cause:** SharePoint encodes special characters in field names

**Field Encoding Reference:**
- Space → `_x0020_`
- Hyphen → `_x002d_`
- Underscore → `_x005f_`

**Example:**
- UI Name: "Ship-To Email"
- Internal Name: `Ship_x002d_To_x0020_Email`

**Solution:**
```javascript
// Use constants.js for field mappings
const { SHAREPOINT_ENCODINGS } = require('./src/shared/constants');
```

#### Error: "Empty notification payload"
**Cause:** SharePoint doesn't include item details in webhook notifications

**Solution:** Implemented in our system:
1. Webhook receives notification
2. System queries for recent changes
3. Delta query fetches actual changed items

### Performance Issues

#### Slow Cold Starts
**Solutions:**
1. Enable Application Insights preAggregation
2. Use Premium plan for always-on capability
3. Implement warm-up trigger:
   ```javascript
   // Add to host.json
   {
     "extensions": {
       "http": {
         "routePrefix": "api",
         "warmupTrigger": {
           "enabled": true
         }
       }
     }
   }
   ```

#### High Memory Usage
**Solutions:**
1. Check for memory leaks in token cache
2. Limit concurrent webhook processing
3. Use streaming for large payloads

### Deployment Issues

#### Error: "Deployment failed"
**Common Solutions:**
```bash
# Force deployment with cache clear
./scripts/deployment/force-deploy.sh

# Verify deployment
./scripts/deployment/verify-deployment.sh

# Check deployment logs
az webapp log deployment list --name your-app --resource-group your-rg
```

### Monitoring and Diagnostics

#### Check Function Logs
```bash
# Real-time log streaming
az webapp log tail --name your-app --resource-group your-rg

# Download logs
az webapp log download --name your-app --resource-group your-rg --log-file logs.zip
```

#### Application Insights Queries
```kusto
// Recent errors
exceptions
| where timestamp > ago(1h)
| order by timestamp desc
| take 50

// Webhook processing times
customMetrics
| where name == "WebhookProcessingTime"
| summarize avg(value), max(value) by bin(timestamp, 5m)

// UiPath queue submissions
traces
| where message contains "Queue item added"
| order by timestamp desc
| take 100
```

## Environment Variable Issues

### Missing Environment Variables
**Symptom:** Functions fail with "undefined" errors

**Solution:**
1. Verify all required variables are set:
   ```bash
   # Check current settings
   az functionapp config appsettings list --name your-app --resource-group your-rg
   
   # Compare with .env.example
   diff .env.example <(az functionapp config appsettings list --name your-app --resource-group your-rg)
   ```

2. Set missing variables:
   ```bash
   az functionapp config appsettings set \
     --name your-app \
     --resource-group your-rg \
     --settings "KEY=VALUE"
   ```

## Quick Fixes

### Reset Everything
```bash
# 1. Clear webhooks
curl -X GET "https://your-app.azurewebsites.net/api/subscription-manager?code=KEY" | \
  jq -r '.subscriptions[].id' | \
  xargs -I {} curl -X DELETE "https://your-app.azurewebsites.net/api/subscription-manager?code=KEY&subscriptionId={}"

# 2. Restart Function App
az functionapp restart --name your-app --resource-group your-rg

# 3. Re-create webhooks
curl -X POST "https://your-app.azurewebsites.net/api/subscription-manager?code=KEY" \
  -H "Content-Type: application/json" \
  -d @webhook-config.json
```

### Test End-to-End
```bash
# Run complete integration test
node test/tools/test-complete-integration.js
```

## Getting Help

1. **Check logs first** - Most issues are visible in logs
2. **Review .env.example** - Ensure all variables are set
3. **Run diagnostic tools** - Use test/tools/ utilities
4. **Check Azure Portal** - Verify Function App health
5. **Review constants.js** - For field mappings and values

## Common Patterns

### Retry Pattern
```javascript
const axiosRetry = require('axios-retry');
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return error.response?.status === 429 || error.response?.status >= 500;
  }
});
```

### Token Refresh Pattern
```javascript
if (tokenExpired) {
  await auth.refreshToken();
  return retry();
}
```

### Error Logging Pattern
```javascript
logger.error('Operation failed', {
  error: error.message,
  stack: error.stack,
  context: { /* relevant data */ }
});
```

---

*Last Updated: August 2025*
*Version: 1.0*