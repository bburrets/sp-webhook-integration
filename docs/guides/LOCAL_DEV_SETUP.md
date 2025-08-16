# Quick Local Development Setup

## 1. Initial Setup (One-time - 5 minutes)

### Install Required Tools
```bash
# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Install Azurite (local Azure storage emulator)
npm install -g azurite
```

### Setup Project
```bash
# Clone and install
cd sharepoint-webhooks
npm install

# Create your local settings file
cp local.settings.json.example local.settings.json
```

### Configure local.settings.json
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_CLIENT_ID": "YOUR_APP_CLIENT_ID",
    "AZURE_CLIENT_SECRET": "YOUR_APP_SECRET",
    "AZURE_TENANT_ID": "YOUR_TENANT_ID",
    "WEBHOOK_LIST_ID": "YOUR_LIST_ID"
  }
}
```

## 2. Daily Development Workflow

### Start Local Environment
```bash
# Terminal 1: Start storage emulator
azurite --silent --location ./azurite-data

# Terminal 2: Start Functions
npm start
```

Your functions are now running at:
- http://localhost:7071/api/webhook-handler
- http://localhost:7071/api/subscription-manager
- http://localhost:7071/api/webhook-sync
- http://localhost:7071/api/health-check

### Test Your Functions Locally

#### Quick Health Check
```bash
curl http://localhost:7071/api/health-check
```

#### Test Webhook Handler
```bash
# Test validation
curl "http://localhost:7071/api/webhook-handler?validationToken=test123"

# Test notification processing
curl -X POST http://localhost:7071/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{
    "value": [{
      "subscriptionId": "test-sub-123",
      "clientState": "forward:https://webhook.site/your-unique-url",
      "resource": "sites/test/lists/test-list",
      "changeType": "updated"
    }]
  }'
```

#### List Current Webhooks
```bash
curl http://localhost:7071/api/subscription-manager
```

## 3. Development Example: Adding a New Feature

Let's say you want to add request logging to webhook-handler:

### Step 1: Edit the function
```javascript
// src/functions/webhook-handler.js
const { app } = require('@azure/functions');

app.http('webhook-handler', {
    methods: ['POST', 'GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        // NEW: Add request logging
        console.log('Incoming webhook request:', {
            method: request.method,
            url: request.url,
            headers: Object.fromEntries(request.headers.entries()),
            timestamp: new Date().toISOString()
        });

        // Existing code continues...
        const validationToken = request.query.get('validationToken');
        if (validationToken) {
            return { status: 200, body: validationToken };
        }
        // ...
    }
});
```

### Step 2: Test locally
```bash
# Your function auto-reloads! Just test it:
curl -X POST http://localhost:7071/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Check the console output in Terminal 2
```

### Step 3: Run tests
```bash
npm test
```

## 4. Deploy to Azure

### Quick Deploy
```bash
# Deploy to production
func azure functionapp publish webhook-functions-sharepoint-002

# Or use npm script
npm run deploy
```

### Verify Deployment
```bash
# Check it's working
curl https://webhook-functions-sharepoint-002.azurewebsites.net/api/health-check

# View live logs
npm run logs
```

## 5. Common Local Testing Scenarios

### Scenario 1: Test Webhook Creation
```bash
# Create a test webhook locally
curl -X POST http://localhost:7071/api/subscription-manager \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/yoursite.sharepoint.com:/sites/testsite:/lists/your-list-id",
    "changeType": "updated",
    "notificationUrl": "http://localhost:7071/api/webhook-handler",
    "clientState": "local-test"
  }'
```

### Scenario 2: Test with Real SharePoint (from local)
```bash
# Use ngrok to expose your local function
npm install -g ngrok
ngrok http 7071

# Use the ngrok URL for webhook creation
curl -X POST http://localhost:7071/api/subscription-manager \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "sites/yoursite.sharepoint.com:/sites/testsite:/lists/your-list-id",
    "changeType": "updated",
    "notificationUrl": "https://YOUR-NGROK-ID.ngrok.io/api/webhook-handler",
    "clientState": "ngrok-test"
  }'
```

### Scenario 3: Debug with VS Code
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to Node Functions",
      "type": "node",
      "request": "attach",
      "port": 9229
    }
  ]
}
```

Start debugging:
```bash
func start --inspect=9229
# Then press F5 in VS Code
```

## 6. Quick Scripts

Add to package.json:
```json
{
  "scripts": {
    "dev": "azurite --silent --location ./azurite-data & func start",
    "test:local": "curl http://localhost:7071/api/health-check",
    "deploy:prod": "func azure functionapp publish webhook-functions-sharepoint-002",
    "logs:prod": "func azure functionapp logstream webhook-functions-sharepoint-002"
  }
}
```

Now you can just run:
```bash
npm run dev          # Start everything
npm run test:local   # Quick health check
npm run deploy:prod  # Deploy to Azure
npm run logs:prod    # View Azure logs
```

## 7. Environment Variables Reference

| Variable | Local Development | Production |
|----------|------------------|------------|
| AzureWebJobsStorage | UseDevelopmentStorage=true | Azure Storage Connection String |
| AZURE_CLIENT_ID | Your dev app ID | Production app ID |
| AZURE_CLIENT_SECRET | Your dev secret | Production secret (use Key Vault) |
| AZURE_TENANT_ID | Your tenant ID | Your tenant ID |
| WEBHOOK_LIST_ID | Test list ID | Production list ID |

## 8. Troubleshooting

### Storage Emulator Won't Start
```bash
# Kill existing Azurite processes
pkill azurite
rm -rf ./azurite-data
azurite --silent --location ./azurite-data
```

### Functions Won't Start
```bash
# Clear function runtime cache
rm -rf .func
npm install
func start
```

### Can't Connect to SharePoint
```bash
# Test your credentials
curl -X POST "https://login.microsoftonline.com/$AZURE_TENANT_ID/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=$AZURE_CLIENT_ID&client_secret=$AZURE_CLIENT_SECRET&scope=https://graph.microsoft.com/.default&grant_type=client_credentials"
```

## 9. Git Workflow (Simple)

```bash
# Make your changes and test locally
npm run dev
# Test your changes...

# Commit and push
git add .
git commit -m "Add request logging"
git push origin main

# Deploy to Azure
npm run deploy:prod
```

## That's It!

You now have:
- ✅ Local development environment
- ✅ Testing capability before deployment
- ✅ Simple deployment to Azure
- ✅ No complex CI/CD needed to start

Total setup time: ~10 minutes
Daily startup: 2 commands (`azurite` and `npm start`)
Deploy to Azure: 1 command (`npm run deploy`)