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

### Environment Variables

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

2. **Queue Submission Failures**
   - Verify queue exists in UiPath Orchestrator
   - Check queue permissions
   - Validate data format and required fields

3. **Item Not Processed**
   - Verify clientState configuration
   - Check if item meets trigger conditions (status, required fields)
   - Review processor logic for specific templates

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

## Future Enhancements

- Support for additional SharePoint list types
- Queue item status monitoring and callbacks
- Advanced retry strategies with exponential backoff
- Integration with Azure Service Bus for reliable messaging
- Support for UiPath process triggering (not just queue items)