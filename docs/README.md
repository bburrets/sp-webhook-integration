# SharePoint Webhook Integration Documentation

This directory contains comprehensive documentation for the SharePoint Webhook Integration solution.

## Available Documentation

### [UiPath Integration](./uipath-integration.md)
Complete guide for the UiPath Orchestrator integration, including:
- Architecture overview and components
- Configuration and environment variables
- Usage examples and custom templates
- API endpoints and testing procedures
- Monitoring, troubleshooting, and security considerations

## Quick Start

1. **Configure Environment Variables**: Set up UiPath Orchestrator connection details
2. **Deploy Functions**: Deploy the updated function app with UiPath integration
3. **Configure Webhooks**: Set clientState to include UiPath processor indicators
4. **Test Integration**: Use the UiPath test function to verify connectivity
5. **Monitor Logs**: Watch for processing results and error messages

## Support

For technical issues or questions about the integration:
1. Check the relevant documentation files
2. Review Azure Function logs for error details
3. Test individual components using the test functions
4. Verify configuration settings and permissions

## Architecture Overview

```
SharePoint List Changes
        ↓
   Webhook Handler
        ↓
   UiPath Dispatcher ← Processes notifications with "processor:uipath"
        ↓
   Template Processor (e.g., COSTCO)
        ↓
   UiPath Queue Client
        ↓
   UiPath Orchestrator Queue
```

The integration is designed to be modular, extensible, and production-ready with comprehensive error handling and logging.