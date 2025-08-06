const { app } = require('@azure/functions');
const MetricsCollector = require('../shared/metrics-collector');

// Simple HTML dashboard for monitoring
app.http('monitoring-dashboard', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Loading monitoring dashboard');
        
        try {
            const collector = new MetricsCollector();
            
            // Get metrics for different time periods
            const last1h = await collector.getMetricsSummary(1);
            const last24h = await collector.getMetricsSummary(24);
            const healthTrend = await collector.getHealthTrend(24);
            
            // Generate HTML dashboard
            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>SharePoint Webhook Monitor</title>
    <meta http-equiv="refresh" content="60">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .metric-card { 
            background: white; 
            padding: 20px; 
            margin: 10px; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: inline-block;
            min-width: 200px;
        }
        .metric-value { font-size: 36px; font-weight: bold; color: #333; }
        .metric-label { color: #666; margin-top: 5px; }
        .status-healthy { color: #28a745; }
        .status-degraded { color: #ffc107; }
        .status-unhealthy { color: #dc3545; }
        .alert { 
            padding: 10px; 
            margin: 10px 0; 
            border-radius: 4px; 
        }
        .alert-critical { background: #f8d7da; color: #721c24; }
        .alert-warning { background: #fff3cd; color: #856404; }
        table { 
            width: 100%; 
            background: white; 
            border-collapse: collapse; 
            margin: 20px 0;
            border-radius: 8px;
            overflow: hidden;
        }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: bold; }
        .chart { 
            background: white; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .success-rate { 
            display: inline-block; 
            padding: 4px 8px; 
            border-radius: 4px;
            font-weight: bold;
        }
        .rate-good { background: #d4edda; color: #155724; }
        .rate-warning { background: #fff3cd; color: #856404; }
        .rate-bad { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <h1>SharePoint Webhook Monitoring Dashboard</h1>
        <p>Last updated: ${new Date().toLocaleString()} (auto-refreshes every 60s)</p>
        
        <h2>System Health</h2>
        <div class="metric-card">
            <div class="metric-value status-${healthTrend.availability >= 95 ? 'healthy' : healthTrend.availability >= 80 ? 'degraded' : 'unhealthy'}">
                ${healthTrend.availability}%
            </div>
            <div class="metric-label">Availability (24h)</div>
        </div>
        
        <div class="metric-card">
            <div class="metric-value ${healthTrend.criticalIncidents > 0 ? 'status-unhealthy' : 'status-healthy'}">
                ${healthTrend.criticalIncidents}
            </div>
            <div class="metric-label">Critical Incidents (24h)</div>
        </div>
        
        <h2>Last Hour Metrics</h2>
        <div class="metric-card">
            <div class="metric-value">${last1h.notifications.total}</div>
            <div class="metric-label">Notifications Received</div>
            <div class="success-rate ${getSuccessRateClass(last1h.notifications)}">
                ${getSuccessRate(last1h.notifications)}% Success
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-value">${last1h.forwarding.total}</div>
            <div class="metric-label">Forwards Attempted</div>
            <div class="success-rate ${getSuccessRateClass(last1h.forwarding)}">
                ${getSuccessRate(last1h.forwarding)}% Success
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-value">${last1h.forwarding.avgLatency}ms</div>
            <div class="metric-label">Avg Forward Latency</div>
        </div>
        
        <h2>24 Hour Summary</h2>
        <table>
            <tr>
                <th>Metric</th>
                <th>Total</th>
                <th>Success</th>
                <th>Failed</th>
                <th>Success Rate</th>
            </tr>
            <tr>
                <td>Notifications</td>
                <td>${last24h.notifications.total}</td>
                <td>${last24h.notifications.success}</td>
                <td>${last24h.notifications.failed}</td>
                <td class="success-rate ${getSuccessRateClass(last24h.notifications)}">
                    ${getSuccessRate(last24h.notifications)}%
                </td>
            </tr>
            <tr>
                <td>Forwarding</td>
                <td>${last24h.forwarding.total}</td>
                <td>${last24h.forwarding.success}</td>
                <td>${last24h.forwarding.failed}</td>
                <td class="success-rate ${getSuccessRateClass(last24h.forwarding)}">
                    ${getSuccessRate(last24h.forwarding)}%
                </td>
            </tr>
            <tr>
                <td>Webhook Operations</td>
                <td>${last24h.operations.total}</td>
                <td>${last24h.operations.success}</td>
                <td>${last24h.operations.failed}</td>
                <td class="success-rate ${getSuccessRateClass(last24h.operations)}">
                    ${getSuccessRate(last24h.operations)}%
                </td>
            </tr>
        </table>
        
        ${Object.keys(last24h.errors).length > 0 ? `
        <h2>Error Distribution (24h)</h2>
        <table>
            <tr>
                <th>Error Type</th>
                <th>Count</th>
            </tr>
            ${Object.entries(last24h.errors).map(([type, count]) => `
            <tr>
                <td>${type}</td>
                <td>${count}</td>
            </tr>
            `).join('')}
        </table>
        ` : ''}
        
        <h2>Quick Actions</h2>
        <div style="margin: 20px 0;">
            <a href="/api/health-check" target="_blank" style="margin-right: 10px;">
                <button>Run Health Check</button>
            </a>
            <a href="/api/subscription-manager" target="_blank" style="margin-right: 10px;">
                <button>View Active Webhooks</button>
            </a>
            <a href="/api/webhook-sync" target="_blank">
                <button>Force Webhook Sync</button>
            </a>
        </div>
    </div>
</body>
</html>`;
            
            return {
                body: html,
                headers: { 'Content-Type': 'text/html' }
            };
            
        } catch (error) {
            context.error('Dashboard error:', error);
            return {
                status: 500,
                body: `<h1>Error loading dashboard</h1><pre>${error.message}</pre>`,
                headers: { 'Content-Type': 'text/html' }
            };
        }
    }
});

function getSuccessRate(metric) {
    if (metric.total === 0) return 100;
    return ((metric.success / metric.total) * 100).toFixed(1);
}

function getSuccessRateClass(metric) {
    const rate = getSuccessRate(metric);
    if (rate >= 95) return 'rate-good';
    if (rate >= 80) return 'rate-warning';
    return 'rate-bad';
}