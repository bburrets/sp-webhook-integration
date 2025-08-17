# Structured Logging Guide

This guide explains how to use the new structured logging module in the SharePoint webhook solution.

## Overview

The structured logging module provides:
- Consistent JSON-formatted logs
- Log levels (ERROR, WARN, INFO, DEBUG)
- Specialized logging methods for common scenarios
- Integration with Azure Functions context
- Performance tracking

## Basic Usage

### Import and Create Logger

```javascript
const { createLogger } = require('../shared/logger');

// In your function handler
const logger = createLogger(context);
```

### Log Levels

```javascript
logger.error('Error message', { errorCode: 'ERR001' });
logger.warn('Warning message', { threshold: 100 });
logger.info('Info message', { userId: '123' });
logger.debug('Debug message', { details: 'verbose' });
```

### Specialized Logging Methods

#### HTTP Requests
```javascript
logger.logRequest('POST', '/api/webhook', {
    body: requestData,
    headers: headers
});
```

#### HTTP Responses
```javascript
logger.logResponse(200, 150, {  // status, duration in ms
    size: 1024,
    cacheHit: true
});
```

#### Webhook Operations
```javascript
logger.logWebhook('created', subscriptionId, {
    resource: 'sites/test',
    expiresIn: '3 days'
});
```

#### SharePoint Operations
```javascript
logger.logSharePoint('get-item', 'lists/test-list/items/1', {
    fields: ['Title', 'Modified']
});
```

#### Performance Tracking
```javascript
const startTime = Date.now();
// ... do work ...
logger.logPerformance('database-query', Date.now() - startTime, {
    recordCount: 100
});
```

## Migration Examples

### Before (console.log)
```javascript
context.log('Webhook request received:', request.method);
context.log('Processing notification:', {
    subscriptionId: notification.subscriptionId,
    resource: notification.resource
});
```

### After (structured logging)
```javascript
const logger = createLogger(context);

logger.logRequest(request.method, request.url);
logger.logWebhook('processing', notification.subscriptionId, {
    resource: notification.resource
});
```

### Error Handling

#### Before
```javascript
context.error('Failed to forward notification:', error.message);
```

#### After
```javascript
logger.error('Failed to forward notification', {
    error: error.message,
    subscriptionId,
    forwardUrl
});
```

## Log Output Format

All logs are output as JSON with consistent structure:

```json
{
    "timestamp": "2024-01-20T10:30:45.123Z",
    "level": "INFO",
    "message": "Webhook created",
    "category": "webhook",
    "action": "created",
    "subscriptionId": "sub-123",
    "invocationId": "abc-def-123",
    "functionName": "webhook-handler"
}
```

## Configuration

Set log level via environment variable:
```
LOG_LEVEL=DEBUG  # ERROR, WARN, INFO, DEBUG
```

## Best Practices

1. **Always create logger with context**: Pass the Azure Functions context to include invocation ID
2. **Use appropriate log levels**: ERROR for failures, WARN for issues, INFO for normal operations, DEBUG for detailed info
3. **Include relevant data**: Add contextual information that helps debugging
4. **Use specialized methods**: They add consistent categorization and structure
5. **Track performance**: Use logPerformance for operations that might be slow
6. **Avoid sensitive data**: Don't log passwords, tokens, or personal information

## Testing

When testing, the logger automatically falls back to console methods if no context is provided:

```javascript
const { logger } = require('../shared/logger');
logger.info('Test message');  // Uses console.log
```