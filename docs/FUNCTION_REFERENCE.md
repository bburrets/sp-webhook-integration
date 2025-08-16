# SharePoint Webhook Solution - Function Reference Guide

## Table of Contents
- [Production Functions](#production-functions)
- [Shared Modules](#shared-modules)
- [Utility Functions](#utility-functions)

---

## Production Functions

These are the main Azure Functions deployed to handle SharePoint webhook operations.

### 1. webhook-handler
**Path:** `src/functions/webhook-handler.js`  
**HTTP Trigger:** POST/GET `/api/webhook-handler`  
**Auth Level:** Anonymous

**Purpose:**
- Primary endpoint that receives notifications from SharePoint when list items change
- Handles webhook validation requests from SharePoint (validation token exchange)
- Processes incoming change notifications
- Forwards notifications to configured external URLs based on clientState
- Updates notification counts in SharePoint tracking list
- Implements loop prevention to avoid processing duplicate notifications

**Key Features:**
- Validation token handling for webhook registration
- Enhanced forwarding with change detection
- Automatic notification count tracking
- Duplicate notification prevention
- Structured logging for all operations

**Example Flow:**
1. SharePoint sends notification when list item changes
2. Function validates and processes the notification
3. If clientState contains `forward:URL`, notification is forwarded
4. Notification count is updated in SharePoint list
5. Returns 200 OK to acknowledge receipt

---

### 2. subscription-manager
**Path:** `src/functions/subscription-manager.js`  
**HTTP Trigger:** GET/POST/DELETE `/api/subscription-manager`  
**Auth Level:** Function (requires API key)

**Purpose:**
- Complete CRUD operations for SharePoint webhook subscriptions
- Creates new webhook subscriptions on SharePoint lists
- Retrieves existing subscription details
- Updates subscription properties (renewal)
- Deletes subscriptions when no longer needed
- Maintains webhook registry in SharePoint list

**Operations:**
- **GET**: List all subscriptions or get specific subscription by ID
- **POST**: Create new webhook subscription with specified parameters
- **DELETE**: Remove webhook subscription from SharePoint

**Key Features:**
- Automatic registration in SharePoint tracking list
- Support for enhanced clientState configuration
- Subscription expiration management (max 3 days for SharePoint)
- Validates all inputs before processing

---

### 3. webhook-sync
**Path:** `src/functions/webhook-sync.js`  
**HTTP Trigger:** POST `/api/webhook-sync`  
**Timer Trigger:** Runs every 6 hours automatically  
**Auth Level:** Function

**Purpose:**
- Synchronizes webhook subscriptions between SharePoint and tracking list
- Ensures tracking list accurately reflects actual SharePoint subscriptions
- Identifies and marks deleted webhooks
- Updates subscription metadata (expiration dates, status)
- Maintains data consistency across the system

**Key Features:**
- Automatic cleanup of deleted webhooks
- Updates expiration dates from SharePoint
- Marks orphaned entries as deleted
- Runs both on-demand and scheduled
- Comprehensive error handling for partial failures

---

### 4. health-check
**Path:** `src/functions/health-check.js`  
**HTTP Trigger:** GET `/api/health-check`  
**Auth Level:** Function

**Purpose:**
- Monitors health and availability of the webhook solution
- Verifies connectivity to SharePoint
- Checks Azure Table Storage accessibility
- Validates authentication token acquisition
- Provides system status and configuration info

**Response Includes:**
- Overall health status
- SharePoint connectivity status
- Storage account status
- Authentication status
- Environment information
- Timestamp of check

---

### 5. initialize-item-states
**Path:** `src/functions/initialize-item-states.js`  
**HTTP Trigger:** POST `/api/initialize-item-states`  
**Auth Level:** Function

**Purpose:**
- Pre-populates Azure Table Storage with current state of SharePoint list items
- Enables change detection by establishing baseline state
- Captures all item fields for comparison
- Supports filtered initialization by date range
- Used when setting up change detection for existing lists

**Key Features:**
- Batch processing of list items
- Configurable field selection
- Progress tracking
- Handles large lists efficiently
- Preserves existing states while adding new ones

---

### 6. webhook-sync-timer
**Path:** Configured in `webhook-sync.js`  
**Timer Trigger:** `0 0 */6 * * *` (every 6 hours)  
**Auth Level:** N/A (internal)

**Purpose:**
- Automated scheduled execution of webhook synchronization
- Ensures tracking list stays current without manual intervention
- Maintains subscription health
- Prevents subscription expiration by identifying near-expiry webhooks

---

## Shared Modules

These modules provide common functionality used across multiple functions.

### 1. auth.js
**Path:** `src/shared/auth.js`

**Purpose:**
- Manages Microsoft Graph API authentication
- Acquires access tokens using client credentials flow
- Implements token caching to reduce API calls
- Tracks cache performance metrics
- Handles token refresh and expiration

**Key Functions:**
- `getAccessToken(context, forceRefresh)` - Gets cached or new token
- `clearTokenCache()` - Clears cached token
- `getCacheStatistics()` - Returns cache performance metrics

---

### 2. config.js
**Path:** `src/shared/config.js`

**Purpose:**
- Centralizes all configuration values
- Manages environment variables
- Provides default values for all settings
- Defines feature flags
- Contains SharePoint site and list configurations

**Configuration Categories:**
- Azure AD credentials
- SharePoint sites and lists
- API endpoints and timeouts
- Webhook settings
- Storage configuration
- Feature flags

---

### 3. error-handler.js
**Path:** `src/shared/error-handler.js`

**Purpose:**
- Provides consistent error handling across all functions
- Defines custom error types with appropriate HTTP status codes
- Wraps function handlers for automatic error catching
- Formats error responses consistently
- Includes stack traces in development mode

**Key Components:**
- `AppError` class - Custom error with status codes
- `wrapHandler()` - Wraps functions for error handling
- Error factory functions (validationError, authenticationError, etc.)
- `handleError()` - Converts errors to HTTP responses

---

### 4. logger.js
**Path:** `src/shared/logger.js`

**Purpose:**
- Structured JSON logging for all operations
- Log level management (ERROR, WARN, INFO, DEBUG)
- Specialized logging methods for common scenarios
- Integration with Azure Functions context
- Performance tracking and monitoring

**Specialized Methods:**
- `logRequest()` - HTTP request logging
- `logResponse()` - HTTP response with duration
- `logWebhook()` - Webhook operation logging
- `logSharePoint()` - SharePoint operation logging
- `logPerformance()` - Performance metrics logging

---

### 5. validators.js
**Path:** `src/shared/validators.js`

**Purpose:**
- Input validation for all webhook operations
- Ensures data integrity and security
- Prevents invalid requests from processing
- Provides detailed validation error messages
- Sanitizes string inputs

**Validation Functions:**
- `validateWebhookNotification()` - Validates incoming notifications
- `validateSubscriptionRequest()` - Validates subscription creation
- `validateResourceFormat()` - Validates SharePoint resource paths
- `validateGuid()` - Validates subscription IDs
- `sanitizeString()` - Cleans and limits string inputs

---

### 6. sharepoint.js
**Path:** `src/shared/sharepoint.js`

**Purpose:**
- SharePoint-specific operations and utilities
- Formats SharePoint resource identifiers
- Handles site and list path parsing
- Provides SharePoint API helpers
- Manages SharePoint-specific data transformations

---

### 7. enhanced-forwarder.js
**Path:** `src/shared/enhanced-forwarder.js`

**Purpose:**
- Advanced notification forwarding with enriched data
- Implements multiple forwarding modes
- Fetches additional item details from SharePoint
- Performs change detection between states
- Formats notifications for external systems

**Forwarding Modes:**
- **simple** - Forward notification as-is
- **withItem** - Include current item data
- **withChanges** - Include before/after field comparison
- **withMetadata** - Include list and site metadata

---

## Utility Functions

Development and testing utilities (not deployed to production).

### 1. auth-cache-monitor.js
**Purpose:** Monitors token cache performance and provides statistics

### 2. monitoring-dashboard.js
**Purpose:** Provides a web dashboard for monitoring webhook operations

### 3. test-enhanced-forward.js
**Purpose:** Tests enhanced forwarding functionality with various modes

### 4. check-change.js
**Purpose:** Verifies change detection is working correctly

### 5. check-list-columns.js
**Purpose:** Inspects SharePoint list schema and column definitions

### 6. discover-list.js
**Purpose:** Discovers SharePoint lists from various URL formats

### 7. explore-versions.js
**Purpose:** Explores version history of SharePoint list items

### 8. get-recent-changes.js
**Purpose:** Retrieves recent changes from SharePoint lists

### 9. test-change-detection.js
**Purpose:** Tests change detection functionality

### 10. test-list-access.js
**Purpose:** Verifies access permissions to SharePoint lists

### 11. test-recent-changes.js
**Purpose:** Tests retrieval of recent changes

---

## Data Flow Overview

### Typical Webhook Notification Flow:
1. **SharePoint** detects a change in a monitored list
2. **SharePoint** sends notification to `webhook-handler`
3. **webhook-handler** validates and processes the notification
4. **enhanced-forwarder** enriches the notification (if configured)
5. Notification is forwarded to external URL (if configured)
6. **webhook-handler** updates notification count in tracking list
7. Response sent back to SharePoint

### Subscription Management Flow:
1. Client calls `subscription-manager` to create subscription
2. **subscription-manager** validates the request
3. Subscription created in SharePoint via Graph API
4. Subscription details saved to tracking list
5. **webhook-sync** maintains subscription health
6. Subscriptions renewed before expiration

---

## Key Design Patterns

1. **Centralized Configuration** - All settings in config.js
2. **Token Caching** - Reduces authentication overhead
3. **Structured Logging** - JSON format for log aggregation
4. **Error Handling** - Consistent error responses
5. **Input Validation** - Security and data integrity
6. **Loop Prevention** - Avoids recursive notifications
7. **Background Processing** - Non-blocking operations
8. **Health Monitoring** - System status visibility

---

## Environment Variables Required

```bash
# Azure AD Authentication
AZURE_CLIENT_ID=<your-client-id>
AZURE_CLIENT_SECRET=<your-client-secret>
AZURE_TENANT_ID=<your-tenant-id>

# SharePoint Configuration
SHAREPOINT_SITE_PATH=<your-site-path>
WEBHOOK_LIST_ID=<your-list-id>

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING=<connection-string>

# Optional Configuration
LOG_LEVEL=INFO
ENABLE_TOKEN_CACHE=true
SKIP_SELF_NOTIFICATIONS=true
```

---

## Security Considerations

1. **Function-level Authentication** - Most endpoints require API keys
2. **Input Validation** - All inputs validated before processing
3. **Token Security** - Tokens cached in memory only
4. **HTTPS Only** - All webhook URLs must use HTTPS
5. **Loop Prevention** - Prevents recursive notification loops
6. **Error Sanitization** - Sensitive data removed from error responses

---

## Monitoring and Debugging

1. **Structured Logs** - Use Application Insights queries
2. **Health Check** - Monitor endpoint availability
3. **Cache Statistics** - Track authentication performance
4. **Notification Counts** - Track webhook activity
5. **Sync Status** - Monitor subscription synchronization

---

## Performance Optimizations

1. **Token Caching** - ~80% reduction in auth calls
2. **Batch Processing** - Multiple items processed together
3. **Background Updates** - Non-blocking operations
4. **Connection Reuse** - HTTP connection pooling
5. **Selective Field Retrieval** - Only fetch needed fields

---

This reference guide provides a comprehensive overview of the SharePoint webhook solution architecture and functionality.