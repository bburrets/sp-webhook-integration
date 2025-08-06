const { TableClient } = require('@azure/data-tables');

class MetricsCollector {
    constructor(connectionString) {
        this.metricsTable = TableClient.fromConnectionString(
            connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING,
            'WebhookMetrics'
        );
        
        this.healthTable = TableClient.fromConnectionString(
            connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING,
            'WebhookHealth'
        );
    }
    
    // Record notification received
    async recordNotification(subscriptionId, resource, success = true, error = null) {
        const entity = {
            partitionKey: 'notifications',
            rowKey: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            subscriptionId,
            resource,
            success,
            error: error ? error.message : null,
            errorType: error ? error.code || 'unknown' : null
        };
        
        try {
            await this.metricsTable.createEntity(entity);
        } catch (err) {
            console.error('Failed to record notification metric:', err);
        }
    }
    
    // Record forwarding attempt
    async recordForwarding(targetUrl, success = true, latencyMs = 0, error = null) {
        const entity = {
            partitionKey: 'forwarding',
            rowKey: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            targetUrl: this.sanitizeUrl(targetUrl),
            success,
            latencyMs,
            error: error ? error.message : null,
            statusCode: error?.response?.status || (success ? 200 : 0)
        };
        
        try {
            await this.metricsTable.createEntity(entity);
        } catch (err) {
            console.error('Failed to record forwarding metric:', err);
        }
    }
    
    // Record webhook operation (create, renew, delete)
    async recordWebhookOperation(operation, resource, success = true, error = null) {
        const entity = {
            partitionKey: 'webhook-operations',
            rowKey: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            operation,
            resource,
            success,
            error: error ? error.message : null
        };
        
        try {
            await this.metricsTable.createEntity(entity);
        } catch (err) {
            console.error('Failed to record webhook operation:', err);
        }
    }
    
    // Get metrics summary for last N hours
    async getMetricsSummary(hours = 24) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const metrics = {
            notifications: { total: 0, success: 0, failed: 0 },
            forwarding: { total: 0, success: 0, failed: 0, avgLatency: 0 },
            operations: { total: 0, success: 0, failed: 0 },
            errors: {}
        };
        
        try {
            // Query notifications
            const notificationQuery = this.metricsTable.listEntities({
                queryOptions: {
                    filter: `PartitionKey eq 'notifications' and timestamp ge datetime'${since}'`
                }
            });
            
            for await (const entity of notificationQuery) {
                metrics.notifications.total++;
                if (entity.success) {
                    metrics.notifications.success++;
                } else {
                    metrics.notifications.failed++;
                    metrics.errors[entity.errorType] = (metrics.errors[entity.errorType] || 0) + 1;
                }
            }
            
            // Query forwarding
            const forwardingQuery = this.metricsTable.listEntities({
                queryOptions: {
                    filter: `PartitionKey eq 'forwarding' and timestamp ge datetime'${since}'`
                }
            });
            
            let totalLatency = 0;
            for await (const entity of forwardingQuery) {
                metrics.forwarding.total++;
                if (entity.success) {
                    metrics.forwarding.success++;
                    totalLatency += entity.latencyMs || 0;
                } else {
                    metrics.forwarding.failed++;
                }
            }
            
            if (metrics.forwarding.success > 0) {
                metrics.forwarding.avgLatency = Math.round(totalLatency / metrics.forwarding.success);
            }
            
            return metrics;
            
        } catch (error) {
            console.error('Failed to get metrics summary:', error);
            return metrics;
        }
    }
    
    // Record health check result
    async recordHealthCheck(status, checks, alerts) {
        const entity = {
            partitionKey: 'health',
            rowKey: new Date().toISOString(),
            status,
            checksJson: JSON.stringify(checks),
            alertsJson: JSON.stringify(alerts),
            alertCount: alerts.length,
            criticalAlerts: alerts.filter(a => a.level === 'critical').length
        };
        
        try {
            await this.healthTable.createEntity(entity);
        } catch (err) {
            console.error('Failed to record health check:', err);
        }
    }
    
    // Get health trend
    async getHealthTrend(hours = 24) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const trend = {
            checks: [],
            availability: 0,
            criticalIncidents: 0
        };
        
        try {
            const query = this.healthTable.listEntities({
                queryOptions: {
                    filter: `PartitionKey eq 'health' and RowKey ge '${since}'`
                }
            });
            
            let healthyCount = 0;
            let totalCount = 0;
            
            for await (const entity of query) {
                totalCount++;
                if (entity.status === 'healthy') {
                    healthyCount++;
                }
                trend.criticalIncidents += entity.criticalAlerts || 0;
                
                trend.checks.push({
                    timestamp: entity.rowKey,
                    status: entity.status,
                    alerts: entity.alertCount
                });
            }
            
            trend.availability = totalCount > 0 ? (healthyCount / totalCount * 100).toFixed(2) : 100;
            
            return trend;
            
        } catch (error) {
            console.error('Failed to get health trend:', error);
            return trend;
        }
    }
    
    // Helper to sanitize URLs for logging
    sanitizeUrl(url) {
        try {
            const parsed = new URL(url);
            return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
        } catch {
            return 'invalid-url';
        }
    }
}