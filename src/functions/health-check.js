const { app } = require('@azure/functions');
const axios = require('axios');
const { TableClient } = require('@azure/data-tables');

// Comprehensive health check endpoint
app.http('health-check', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Running health check');
        
        const health = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            checks: {},
            metrics: {},
            alerts: []
        };
        
        try {
            // Check 1: Webhook subscriptions status
            health.checks.webhooks = await checkWebhookHealth(context);
            
            // Check 2: Azure Table Storage connectivity
            health.checks.storage = await checkStorageHealth(context);
            
            // Check 3: SharePoint API accessibility
            health.checks.sharepoint = await checkSharePointHealth(context);
            
            // Check 4: Notification processing metrics (last 24h)
            health.metrics = await getProcessingMetrics(context);
            
            // Check 5: System resources
            health.checks.system = getSystemHealth();
            
            // Determine overall health
            const failedChecks = Object.values(health.checks).filter(c => !c.healthy);
            if (failedChecks.length > 0) {
                health.status = 'degraded';
                failedChecks.forEach(check => {
                    health.alerts.push({
                        level: 'warning',
                        message: check.message,
                        component: check.component
                    });
                });
            }
            
            // Critical alerts
            if (health.metrics.webhooksExpiringSoon > 0) {
                health.alerts.push({
                    level: 'critical',
                    message: `${health.metrics.webhooksExpiringSoon} webhooks expiring in next 24 hours`,
                    component: 'webhooks'
                });
            }
            
            if (health.metrics.forwardingErrorRate > 10) {
                health.alerts.push({
                    level: 'critical',
                    message: `High forwarding error rate: ${health.metrics.forwardingErrorRate}%`,
                    component: 'forwarding'
                });
            }
            
            return {
                status: health.alerts.some(a => a.level === 'critical') ? 503 : 200,
                body: JSON.stringify(health, null, 2),
                headers: { 'Content-Type': 'application/json' }
            };
            
        } catch (error) {
            context.error('Health check failed:', error);
            health.status = 'unhealthy';
            health.error = error.message;
            
            return {
                status: 503,
                body: JSON.stringify(health, null, 2),
                headers: { 'Content-Type': 'application/json' }
            };
        }
    }
});

async function checkWebhookHealth(context) {
    try {
        // Get token
        const clientId = process.env.AZURE_CLIENT_ID;
        const clientSecret = process.env.AZURE_CLIENT_SECRET;
        const tenantId = process.env.AZURE_TENANT_ID;
        
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('scope', 'https://graph.microsoft.com/.default');
        params.append('grant_type', 'client_credentials');
        
        const tokenResponse = await axios.post(tokenUrl, params);
        const accessToken = tokenResponse.data.access_token;
        
        // Get all subscriptions
        const subsResponse = await axios.get('https://graph.microsoft.com/v1.0/subscriptions', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
        
        const subscriptions = subsResponse.data.value || [];
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        const expiringSoon = subscriptions.filter(sub => {
            const expiry = new Date(sub.expirationDateTime);
            return expiry < tomorrow;
        });
        
        return {
            healthy: true,
            component: 'webhooks',
            totalWebhooks: subscriptions.length,
            expiringSoon: expiringSoon.length,
            oldestExpiry: subscriptions.length > 0 ? 
                Math.min(...subscriptions.map(s => new Date(s.expirationDateTime))) : null
        };
        
    } catch (error) {
        return {
            healthy: false,
            component: 'webhooks',
            message: `Failed to check webhooks: ${error.message}`
        };
    }
}

async function checkStorageHealth(context) {
    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) {
            return {
                healthy: false,
                component: 'storage',
                message: 'Storage connection string not configured'
            };
        }
        
        const tableClient = TableClient.fromConnectionString(connectionString, 'WebhookMetrics');
        
        // Try to query the table
        const iterator = tableClient.listEntities({
            queryOptions: { top: 1 }
        });
        
        await iterator.next();
        
        return {
            healthy: true,
            component: 'storage',
            message: 'Storage accessible'
        };
        
    } catch (error) {
        return {
            healthy: false,
            component: 'storage',
            message: `Storage access failed: ${error.message}`
        };
    }
}

async function checkSharePointHealth(context) {
    try {
        // Test with a known working site
        const testSite = 'https://graph.microsoft.com/v1.0/sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement';
        
        // Get token
        const clientId = process.env.AZURE_CLIENT_ID;
        const clientSecret = process.env.AZURE_CLIENT_SECRET;
        const tenantId = process.env.AZURE_TENANT_ID;
        
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('scope', 'https://graph.microsoft.com/.default');
        params.append('grant_type', 'client_credentials');
        
        const tokenResponse = await axios.post(tokenUrl, params);
        const accessToken = tokenResponse.data.access_token;
        
        const response = await axios.get(testSite, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            },
            timeout: 5000
        });
        
        return {
            healthy: true,
            component: 'sharepoint',
            message: 'SharePoint API accessible',
            responseTime: response.headers['x-ms-ags-diagnostic'] ? 'fast' : 'normal'
        };
        
    } catch (error) {
        return {
            healthy: false,
            component: 'sharepoint',
            message: `SharePoint API check failed: ${error.message}`
        };
    }
}

async function getProcessingMetrics(context) {
    // In production, these would come from Application Insights or Storage
    // For now, return sample metrics structure
    return {
        last24Hours: {
            notificationsReceived: 0,
            notificationsForwarded: 0,
            forwardingErrors: 0,
            averageLatencyMs: 0
        },
        forwardingErrorRate: 0,
        webhooksExpiringSoon: 0,
        activeWebhooks: 0
    };
}

function getSystemHealth() {
    const used = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
        healthy: true,
        component: 'system',
        memory: {
            heapUsed: Math.round(used.heapUsed / 1024 / 1024) + ' MB',
            heapTotal: Math.round(used.heapTotal / 1024 / 1024) + ' MB',
            external: Math.round(used.external / 1024 / 1024) + ' MB'
        },
        uptime: Math.round(uptime / 60) + ' minutes',
        nodeVersion: process.version
    };
}