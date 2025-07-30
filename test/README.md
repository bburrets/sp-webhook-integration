# Test and Debug Utilities

This directory contains test functions and debug utilities used during development and troubleshooting.

## Directory Structure

### `/integration`
Contains integration test functions that were deployed to Azure Functions for testing:
- `test-graph-permissions.js` - Tests Microsoft Graph API permissions
- `test-minimal-update.js` - Tests minimal SharePoint list updates

### `/debug-utils`
Contains debug and diagnostic utilities:
- `webhook-notification-log.js` - Simple webhook notification logger
- `webhook-sync-simple.js` - Simplified sync for debugging
- `webhook-sync-simple-v2.js` - Enhanced debug sync with detailed logging
- `webhook-sync-graph.js` - Graph API sync testing

## Usage

These functions are not part of the main application but can be deployed temporarily for debugging purposes.

To deploy a debug function:
1. Copy the function to `src/functions/`
2. Deploy with `func azure functionapp publish`
3. Remove after debugging is complete