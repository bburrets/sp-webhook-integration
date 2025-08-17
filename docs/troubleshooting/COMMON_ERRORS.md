# Common Errors and Solutions

## Quick Troubleshooting Table

| Error | Likely Cause | Quick Fix |
|-------|-------------|-----------|
| `401 Unauthorized` | Invalid credentials | Check Azure AD app permissions |
| `404 Not Found` | Wrong resource path | Verify SharePoint site/list URLs |
| `Queue not found` | UiPath queue doesn't exist | Create queue in Orchestrator |
| `Webhook validation failed` | Token mismatch | Check webhook handler endpoint |
| `Item not processed` | Status doesn't match trigger | Verify status field value |

## Detailed Solutions

### Authentication Errors

#### 401 Unauthorized - SharePoint
**Error**: `Failed to get access token: 401`

**Cause**: Azure AD app registration issues

**Solution**:
```bash
# Verify Azure AD credentials
az ad app show --id $AZURE_CLIENT_ID

# Check permissions
az ad app permission list --id $AZURE_CLIENT_ID

# Grant admin consent if needed
az ad app permission admin-consent --id $AZURE_CLIENT_ID
```

#### 401 Unauthorized - UiPath
**Error**: `UiPath authentication failed`

**Cause**: Invalid UiPath credentials or expired token

**Solution**:
1. Verify credentials in Function App settings:
```bash
az functionapp config appsettings list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --query "[?name=='UIPATH_CLIENT_ID' || name=='UIPATH_CLIENT_SECRET']"
```

2. Test authentication:
```bash
curl -X GET https://webhook-functions-sharepoint-002.azurewebsites.net/api/uipath-test?test=auth
```

### Webhook Creation Errors

#### Resource Path Format Issues
**Error**: `Invalid resource format`

**Cause**: Incorrect SharePoint resource path

**Correct Format**:
```
sites/{hostname}:/{site-path}:/lists/{list-id}
```

**Examples**:
```javascript
// Main site list
"sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/30516097-c58c-478c-b87f-76c8f6ce2b56"

// Subsite list
"sites/fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:/lists/a347ee9b-51b8-4ae2-bdb3-ebdfae5683ae"
```

#### Webhook Validation Failure
**Error**: `Webhook validation failed`

**Cause**: Validation endpoint not responding correctly

**Solution**:
1. Test validation endpoint:
```bash
curl -X POST https://your-function.azurewebsites.net/api/webhook-handler?validationToken=test123
```

2. Check response (should echo the token):
```
test123
```

### UiPath Queue Errors

#### Queue Not Found
**Error**: `UiPath queue 'QueueName' not found`

**Cause**: Queue doesn't exist or wrong organization unit

**Solution**:
1. Verify queue exists in Orchestrator
2. Check organization unit ID:
```bash
az functionapp config appsettings show \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --setting-name UIPATH_ORGANIZATION_UNIT_ID
```

#### Queue Item Submission Failed
**Error**: `queueItemParameters must not be null`

**Cause**: Payload structure mismatch

**Solution**:
```javascript
// Correct payload structure
{
  "itemData": {
    "Name": "QueueName",  // Must match exactly
    "Priority": "Normal",
    "SpecificContent": {
      // Your data here
    }
  }
}
```

### Processing Errors

#### Item Not Processed
**Error**: `Item does not meet processing criteria`

**Cause**: Status field doesn't match trigger value

**Debug Steps**:
1. Check current item status
2. Verify trigger configuration in template
3. Ensure clientState includes `processor:uipath`

#### Missing Required Fields
**Error**: `Missing required COSTCO fields`

**Required Fields**:
- ShiptoEmail
- ShipDate
- Style
- PO_No

**Solution**: Ensure all required fields have values before status change

### Network and Timeout Errors

#### Function Timeout
**Error**: `Function execution timed out`

**Cause**: Long-running operations

**Solution**:
1. Increase function timeout:
```bash
az functionapp config set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --always-on true \
  --ftps-state Disabled \
  --http20-enabled true
```

2. Use async processing for heavy operations

#### Connection Refused
**Error**: `ECONNREFUSED`

**Cause**: Service unavailable or firewall blocking

**Solution**:
1. Check service availability
2. Verify network security groups
3. Test from Azure:
```bash
az functionapp ssh --name webhook-functions-sharepoint-002
```

## Diagnostic Commands

### Check Function Logs
```bash
# Stream live logs
az webapp log tail \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks

# Download logs
az webapp log download \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --log-file logs.zip
```

### Test Webhook Handler
```bash
# Test validation
curl -X POST https://your-function.azurewebsites.net/api/webhook-handler?validationToken=test

# Test notification processing
curl -X POST https://your-function.azurewebsites.net/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{"value":[{"subscriptionId":"test","clientState":"processor:uipath","resource":"test"}]}'
```

### Verify Configuration
```bash
# List all app settings
az functionapp config appsettings list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --output table

# Check specific setting
az functionapp config appsettings list \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --query "[?name=='UIPATH_ENABLED'].value"
```

## Prevention Tips

1. **Use Environment Variables**: Never hardcode credentials
2. **Enable Logging**: Set `NODE_ENV=development` for detailed logs
3. **Test Locally First**: Use local.settings.json for development
4. **Monitor Health**: Set up Application Insights
5. **Implement Retry Logic**: Handle transient failures gracefully
6. **Validate Input**: Check required fields before processing
7. **Cache Tokens**: Reduce authentication overhead
8. **Use Async/Await**: Prevent blocking operations

## Need More Help?

- Check Application Insights for detailed telemetry
- Review function execution history in Azure Portal
- Enable diagnostic logging for deeper investigation
- Contact support with correlation IDs from logs