# Configuration Management

This directory contains environment-specific configuration files for the SharePoint Webhooks project.

## Directory Structure

### `local/` - Local Development Configuration
- Contains configuration files for local development environment
- Files in this directory are typically gitignored for security
- Example: local connection strings, development API keys

### `test/` - Test Environment Configuration
- Contains configuration files for test environment
- Currently contains: `local.settings.test.json`
- Use for integration testing and CI/CD pipelines

### `prod/` - Production Configuration Templates
- Contains template configuration files for production environment
- Should contain examples/templates rather than actual production secrets
- Actual production configs should be managed through Azure Key Vault or similar

## Configuration Files

### Azure Functions Settings
- `local.settings.json` - Local development settings (in project root)
- `local.settings.test.json` - Test environment settings
- Production settings are managed through Azure portal/ARM templates

### Environment Variables

Key environment variables used by the application:

#### Azure Configuration
- `AZURE_CLIENT_ID` - Azure AD application client ID
- `AZURE_CLIENT_SECRET` - Azure AD application secret
- `AZURE_TENANT_ID` - Azure AD tenant ID

#### UiPath Configuration
- `UIPATH_ORCHESTRATOR_URL` - UiPath Orchestrator base URL
- `UIPATH_TENANT_NAME` - UiPath tenant name
- `UIPATH_CLIENT_ID` - UiPath OAuth client ID
- `UIPATH_CLIENT_SECRET` - UiPath OAuth client secret
- `UIPATH_ORGANIZATION_UNIT_ID` - UiPath organization unit ID
- `UIPATH_DEFAULT_QUEUE` - Default UiPath queue name

#### SharePoint Configuration
- `SHAREPOINT_SITE_URL` - SharePoint site URL
- `WEBHOOK_BASE_URL` - Base URL for webhook callbacks
- `WEBHOOK_LIST_ID` - SharePoint list ID for webhooks

#### Feature Flags
- `UIPATH_ENABLED` - Enable/disable UiPath integration
- `ENABLE_ENHANCED_FORWARDING` - Enable enhanced forwarding features

## Security Best Practices

1. **Never commit secrets to version control**
2. **Use Azure Key Vault for production secrets**
3. **Keep local.settings.json files in .gitignore**
4. **Use environment-specific service principals**
5. **Rotate secrets regularly**

## Configuration Management Flow

```
Development → Test → Production
     ↓         ↓         ↓
config/local → config/test → Azure Key Vault
```

## Adding New Configuration

1. Add environment variable to appropriate config file
2. Update this README with documentation
3. Add to `.env.example` in project root (if it exists)
4. Update deployment scripts to handle new variable
5. Test in all environments