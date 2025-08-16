# SharePoint Webhook Solution - Development & Deployment Pipeline Plan

## Executive Summary

This document outlines a comprehensive development and deployment pipeline for the SharePoint Webhook Azure Functions solution. It establishes a robust workflow that enables developers to build, test, and deploy features locally before promoting to Azure, ensuring code quality and minimizing production issues.

## Current Environment Overview

### Project Architecture
- **Solution Type**: Azure Functions v4 (Node.js 18+)
- **Core Functions**: 
  - `webhook-handler` - Receives and processes SharePoint notifications
  - `subscription-manager` - Manages webhook subscriptions via Graph API
  - `webhook-sync` - Synchronizes webhooks with SharePoint management list
  - `health-check` - System health monitoring
  - `initialize-item-states` - Sets up change detection baseline

### Technology Stack
- **Runtime**: Node.js 18+ with Azure Functions Runtime v4
- **Dependencies**: 
  - @azure/functions (v4.7.2)
  - @azure/data-tables (v13.2.2)
  - axios (v1.11.0)
- **Testing**: Jest framework
- **Cloud Platform**: Microsoft Azure
- **Integration**: Microsoft Graph API, SharePoint REST API

### Current Deployment
- **Production**: `webhook-functions-sharepoint-002.azurewebsites.net`
- **Resource Group**: `rg-sharepoint-webhooks`
- **Storage**: Azure Table Storage for state management
- **Authentication**: Azure AD App Registration with Graph API permissions

## Proposed Development Pipeline

### 1. Local Development Environment Setup

#### Prerequisites Installation
```bash
# Install required tools
npm install -g azure-functions-core-tools@4 --unsafe-perm true
npm install -g @azure/static-web-apps-cli
brew install azure-cli  # macOS
# or
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash  # Linux/WSL
```

#### Project Setup
```bash
# Clone repository
git clone <repository-url>
cd sharepoint-webhooks

# Install dependencies
npm install

# Copy and configure local settings
cp local.settings.json.example local.settings.json
# Edit local.settings.json with your development credentials
```

#### Local Storage Emulator
```bash
# For macOS/Linux - Use Azurite
npm install -g azurite
azurite --silent --location ./azurite-data --tableHost 127.0.0.1

# For Windows - Can use Azure Storage Emulator
# Download from Microsoft website
```

### 2. Development Workflow

#### Branch Strategy
```
main (production)
  ├── develop (staging)
  │   ├── feature/webhook-retry-logic
  │   ├── feature/enhanced-logging
  │   └── bugfix/authentication-timeout
```

#### Feature Development Process

**Example: Developing a Webhook Retry Feature**

##### Step 1: Create Feature Branch
```bash
git checkout develop
git pull origin develop
git checkout -b feature/webhook-retry-logic
```

##### Step 2: Implement Feature
```javascript
// src/shared/webhook-retry.js
const { logger } = require('./logger');

class WebhookRetryHandler {
    constructor(maxRetries = 3, baseDelay = 1000) {
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
    }

    async executeWithRetry(fn, context) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                logger.info(`Attempt ${attempt} of ${this.maxRetries}`, {
                    function: context.functionName,
                    attempt
                });
                
                const result = await fn();
                
                if (attempt > 1) {
                    logger.info('Retry successful', {
                        function: context.functionName,
                        attemptNumber: attempt
                    });
                }
                
                return result;
            } catch (error) {
                lastError = error;
                
                if (attempt < this.maxRetries) {
                    const delay = this.baseDelay * Math.pow(2, attempt - 1);
                    logger.warn(`Retry attempt ${attempt} failed, waiting ${delay}ms`, {
                        function: context.functionName,
                        error: error.message,
                        nextDelay: delay
                    });
                    await this.delay(delay);
                }
            }
        }
        
        logger.error('All retry attempts exhausted', {
            function: context.functionName,
            error: lastError.message
        });
        
        throw lastError;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { WebhookRetryHandler };
```

##### Step 3: Write Unit Tests
```javascript
// src/shared/__tests__/webhook-retry.test.js
const { WebhookRetryHandler } = require('../webhook-retry');

describe('WebhookRetryHandler', () => {
    let handler;
    
    beforeEach(() => {
        handler = new WebhookRetryHandler(3, 100);
    });

    test('should succeed on first attempt', async () => {
        const mockFn = jest.fn().mockResolvedValue('success');
        const context = { functionName: 'test-function' };
        
        const result = await handler.executeWithRetry(mockFn, context);
        
        expect(result).toBe('success');
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure and eventually succeed', async () => {
        const mockFn = jest.fn()
            .mockRejectedValueOnce(new Error('First failure'))
            .mockRejectedValueOnce(new Error('Second failure'))
            .mockResolvedValue('success');
        
        const context = { functionName: 'test-function' };
        
        const result = await handler.executeWithRetry(mockFn, context);
        
        expect(result).toBe('success');
        expect(mockFn).toHaveBeenCalledTimes(3);
    });

    test('should throw after max retries', async () => {
        const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
        const context = { functionName: 'test-function' };
        
        await expect(handler.executeWithRetry(mockFn, context))
            .rejects.toThrow('Persistent failure');
        
        expect(mockFn).toHaveBeenCalledTimes(3);
    });
});
```

##### Step 4: Integration Testing
```javascript
// test/integration/test-retry-integration.js
const { WebhookRetryHandler } = require('../../src/shared/webhook-retry');
const axios = require('axios');

async function testRetryWithRealEndpoint() {
    const handler = new WebhookRetryHandler(3, 1000);
    
    // Test with a flaky endpoint
    const makeRequest = async () => {
        const response = await axios.post('http://localhost:7071/api/webhook-handler', {
            value: [{
                subscriptionId: 'test-retry',
                clientState: 'test',
                resource: 'test/resource'
            }]
        });
        return response.data;
    };
    
    try {
        const result = await handler.executeWithRetry(makeRequest, { 
            functionName: 'webhook-handler-test' 
        });
        console.log('Success:', result);
    } catch (error) {
        console.error('Failed after retries:', error.message);
    }
}

// Run if executed directly
if (require.main === module) {
    testRetryWithRealEndpoint();
}
```

##### Step 5: Local Testing
```bash
# Start local Functions runtime
npm start

# In another terminal, run tests
npm test

# Run specific test suite
npm test -- webhook-retry.test.js

# Test with coverage
npm run test:coverage

# Manual endpoint testing
curl -X POST http://localhost:7071/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{"value":[{"subscriptionId":"test-local"}]}'
```

### 3. Environment Configuration

#### Environment Tiers

##### Development (Local)
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "NODE_ENV": "development",
    "LOG_LEVEL": "debug",
    "AZURE_CLIENT_ID": "dev-client-id",
    "AZURE_CLIENT_SECRET": "dev-secret",
    "AZURE_TENANT_ID": "dev-tenant",
    "WEBHOOK_LIST_ID": "dev-list-id",
    "ENABLE_RETRY": "true",
    "MAX_RETRY_ATTEMPTS": "3"
  }
}
```

##### Staging
```bash
# Azure Function App: webhook-functions-staging
az functionapp config appsettings set \
  --name webhook-functions-staging \
  --resource-group rg-sharepoint-webhooks \
  --settings \
    NODE_ENV=staging \
    LOG_LEVEL=info \
    ENABLE_RETRY=true \
    MAX_RETRY_ATTEMPTS=3
```

##### Production
```bash
# Azure Function App: webhook-functions-sharepoint-002
az functionapp config appsettings set \
  --name webhook-functions-sharepoint-002 \
  --resource-group rg-sharepoint-webhooks \
  --settings \
    NODE_ENV=production \
    LOG_LEVEL=warning \
    ENABLE_RETRY=true \
    MAX_RETRY_ATTEMPTS=5
```

### 4. CI/CD Pipeline

#### GitHub Actions Workflow
```yaml
# .github/workflows/azure-functions-deploy.yml
name: Deploy Azure Functions

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  AZURE_FUNCTIONAPP_NAME_PROD: webhook-functions-sharepoint-002
  AZURE_FUNCTIONAPP_NAME_STAGING: webhook-functions-staging
  AZURE_FUNCTIONAPP_PACKAGE_PATH: '.'
  NODE_VERSION: '18.x'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Run linting
      run: npm run lint
    
    - name: Generate coverage report
      run: npm run test:coverage
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment: staging
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
    
    - name: Install dependencies
      run: npm ci --production
    
    - name: Build project
      run: npm run build --if-present
    
    - name: Login to Azure
      uses: azure/login@v1
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS_STAGING }}
    
    - name: Deploy to Staging
      uses: Azure/functions-action@v1
      with:
        app-name: ${{ env.AZURE_FUNCTIONAPP_NAME_STAGING }}
        package: ${{ env.AZURE_FUNCTIONAPP_PACKAGE_PATH }}
    
    - name: Run smoke tests
      run: |
        sleep 30
        npm run test:staging

  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
    
    - name: Install dependencies
      run: npm ci --production
    
    - name: Build project
      run: npm run build --if-present
    
    - name: Login to Azure
      uses: azure/login@v1
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS }}
    
    - name: Deploy to Production
      uses: Azure/functions-action@v1
      with:
        app-name: ${{ env.AZURE_FUNCTIONAPP_NAME_PROD }}
        package: ${{ env.AZURE_FUNCTIONAPP_PACKAGE_PATH }}
        
    - name: Verify deployment
      run: |
        sleep 30
        npm run test:production
```

### 5. Pre-commit Hooks

#### Setup Husky and Lint-staged
```bash
npm install --save-dev husky lint-staged eslint prettier
npx husky install
```

#### Configuration
```json
// package.json
{
  "scripts": {
    "prepare": "husky install",
    "lint": "eslint src/**/*.js",
    "lint:fix": "eslint src/**/*.js --fix",
    "format": "prettier --write src/**/*.js"
  },
  "lint-staged": {
    "src/**/*.js": [
      "eslint --fix",
      "prettier --write",
      "npm test -- --findRelatedTests"
    ]
  }
}
```

```bash
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

### 6. Deployment Scripts

#### Multi-environment Deployment Script
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

ENVIRONMENT=${1:-staging}
FUNCTION_APP=""
RESOURCE_GROUP="rg-sharepoint-webhooks"

case $ENVIRONMENT in
  "staging")
    FUNCTION_APP="webhook-functions-staging"
    echo "Deploying to STAGING environment..."
    ;;
  "production")
    FUNCTION_APP="webhook-functions-sharepoint-002"
    echo "Deploying to PRODUCTION environment..."
    read -p "Are you sure you want to deploy to production? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Deployment cancelled."
      exit 1
    fi
    ;;
  *)
    echo "Unknown environment: $ENVIRONMENT"
    echo "Usage: ./deploy.sh [staging|production]"
    exit 1
    ;;
esac

# Run tests
echo "Running tests..."
npm test

# Build if necessary
if [ -f "tsconfig.json" ]; then
  echo "Building TypeScript..."
  npm run build
fi

# Deploy to Azure
echo "Deploying to $FUNCTION_APP..."
func azure functionapp publish $FUNCTION_APP --nozip

# Verify deployment
echo "Verifying deployment..."
sleep 10

HEALTH_CHECK_URL="https://$FUNCTION_APP.azurewebsites.net/api/health-check"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_CHECK_URL)

if [ $HTTP_STATUS -eq 200 ]; then
  echo "✅ Deployment successful! Health check passed."
else
  echo "❌ Deployment may have issues. Health check returned: $HTTP_STATUS"
  exit 1
fi

# Display function URLs
echo ""
echo "Function URLs:"
echo "- Webhook Handler: https://$FUNCTION_APP.azurewebsites.net/api/webhook-handler"
echo "- Subscription Manager: https://$FUNCTION_APP.azurewebsites.net/api/subscription-manager"
echo "- Webhook Sync: https://$FUNCTION_APP.azurewebsites.net/api/webhook-sync"
echo "- Health Check: https://$FUNCTION_APP.azurewebsites.net/api/health-check"
```

### 7. Monitoring and Rollback

#### Monitoring Setup
```bash
# Enable Application Insights
az monitor app-insights component create \
  --app webhook-functions-insights \
  --location eastus \
  --resource-group rg-sharepoint-webhooks

# Configure alerts
az monitor metrics alert create \
  --name "High Error Rate" \
  --resource-group rg-sharepoint-webhooks \
  --scopes "/subscriptions/{sub-id}/resourceGroups/rg-sharepoint-webhooks/providers/Microsoft.Web/sites/webhook-functions-sharepoint-002" \
  --condition "avg exceptions > 10" \
  --window-size 5m \
  --evaluation-frequency 1m
```

#### Rollback Procedure
```bash
#!/bin/bash
# scripts/rollback.sh

FUNCTION_APP="webhook-functions-sharepoint-002"
RESOURCE_GROUP="rg-sharepoint-webhooks"

echo "Fetching deployment history..."
az webapp deployment list \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --output table

read -p "Enter deployment ID to rollback to: " DEPLOYMENT_ID

echo "Rolling back to deployment: $DEPLOYMENT_ID"
az webapp deployment rollback \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --deployment-id $DEPLOYMENT_ID

echo "Rollback complete. Verifying..."
sleep 10

# Verify health
HEALTH_CHECK_URL="https://$FUNCTION_APP.azurewebsites.net/api/health-check"
curl -s $HEALTH_CHECK_URL | jq .
```

### 8. Development Best Practices

#### Code Review Process
1. All features must be developed in feature branches
2. Pull requests require at least one approval
3. Automated tests must pass
4. Code coverage must not decrease
5. No direct commits to main branch

#### Testing Requirements
- **Unit Tests**: Minimum 80% code coverage
- **Integration Tests**: Test all API endpoints
- **End-to-End Tests**: Validate SharePoint integration
- **Performance Tests**: Ensure response times < 3 seconds

#### Security Checklist
- [ ] No hardcoded secrets or credentials
- [ ] All environment variables documented
- [ ] Input validation on all endpoints
- [ ] Error messages don't expose sensitive data
- [ ] Authentication tokens properly validated
- [ ] Rate limiting implemented
- [ ] Audit logging for critical operations

### 9. Local Development Tips

#### Debug Configuration (.vscode/launch.json)
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to Node Functions",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "preLaunchTask": "func: host start"
    }
  ]
}
```

#### Environment Variable Management
```bash
# Use direnv for automatic environment loading
brew install direnv
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc

# Create .envrc file
cat > .envrc << EOF
export AZURE_CLIENT_ID="dev-client-id"
export AZURE_CLIENT_SECRET="dev-secret"
export AZURE_TENANT_ID="dev-tenant"
EOF

direnv allow
```

#### Local Testing Scripts
```bash
# scripts/test-local.sh
#!/bin/bash

# Start Functions in background
func start &
FUNC_PID=$!

# Wait for Functions to start
sleep 10

# Run integration tests
npm run test:integration

# Stop Functions
kill $FUNC_PID
```

### 10. Troubleshooting Guide

#### Common Issues and Solutions

**Issue: Function timeout during local development**
```bash
# Increase timeout in host.json
{
  "functionTimeout": "00:10:00"  // 10 minutes for debugging
}
```

**Issue: Authentication failures**
```bash
# Verify Azure AD app registration
az ad app show --id $AZURE_CLIENT_ID
az ad sp show --id $AZURE_CLIENT_ID

# Test token acquisition
curl -X POST "https://login.microsoftonline.com/$AZURE_TENANT_ID/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=$AZURE_CLIENT_ID&client_secret=$AZURE_CLIENT_SECRET&scope=https://graph.microsoft.com/.default&grant_type=client_credentials"
```

**Issue: Storage emulator connection issues**
```bash
# For Azurite
azurite --debug --location ./azurite-data

# Check connection string
echo $AzureWebJobsStorage
# Should be: UseDevelopmentStorage=true
```

## Implementation Timeline

### Phase 1: Environment Setup (Week 1)
- [ ] Configure local development environment
- [ ] Set up staging environment in Azure
- [ ] Create GitHub repository structure
- [ ] Configure branch protection rules

### Phase 2: CI/CD Pipeline (Week 2)
- [ ] Implement GitHub Actions workflows
- [ ] Set up automated testing
- [ ] Configure deployment scripts
- [ ] Set up monitoring and alerts

### Phase 3: Developer Onboarding (Week 3)
- [ ] Create developer documentation
- [ ] Conduct team training sessions
- [ ] Establish code review process
- [ ] Document troubleshooting procedures

### Phase 4: Production Rollout (Week 4)
- [ ] Perform staging environment testing
- [ ] Execute production deployment
- [ ] Monitor system health
- [ ] Gather feedback and iterate

## Success Metrics

- **Deployment Frequency**: Target 2-3 deployments per week
- **Lead Time**: < 2 hours from commit to production
- **Mean Time to Recovery**: < 30 minutes
- **Change Failure Rate**: < 5%
- **Test Coverage**: > 80%
- **Build Success Rate**: > 95%

## Conclusion

This comprehensive pipeline ensures reliable, efficient development and deployment of the SharePoint Webhook solution. By following these practices, the team can deliver features quickly while maintaining high quality and system stability.