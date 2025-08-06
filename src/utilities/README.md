# Utility Functions

This directory contains utility and testing functions that are **NOT intended for production use**.

These functions are development tools for:
- Testing webhook functionality
- Debugging SharePoint list changes
- Monitoring system health
- Exploring SharePoint API capabilities

## Functions

### Testing Functions
- `test-change-detection.js` - Test change detection functionality
- `test-enhanced-forward.js` - Test enhanced forwarding features
- `test-list-access.js` - Test SharePoint list access permissions
- `test-recent-changes.js` - Test recent changes retrieval

### Debugging Functions
- `check-change.js` - Quick check for recent changes in a list
- `check-list-columns.js` - Verify SharePoint list column configuration
- `discover-list.js` - Discover SharePoint list information from URL
- `explore-versions.js` - Explore item version history
- `get-recent-changes.js` - Get recent changes from a specific list

### Monitoring Functions
- `monitoring-dashboard.js` - Simple monitoring dashboard for webhook health

## Important Notes

1. **DO NOT DEPLOY** these functions to production
2. These functions may have relaxed security (e.g., less validation)
3. They are intended for development and debugging only
4. Some functions may expose sensitive information

## Deployment Exclusion

To exclude these utilities from deployment, update your deployment scripts to skip the utilities folder:

```bash
# Example: Deploy only production functions
func azure functionapp publish webhook-functions-sharepoint-002 \
  --nozip \
  --exclude "src/utilities/**"
```

Or use a `.funcignore` file in the project root:
```
src/utilities/**
test/**
*.test.js
```