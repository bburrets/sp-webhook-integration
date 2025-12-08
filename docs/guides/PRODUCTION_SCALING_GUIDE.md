# Production Scaling Guide

This guide provides comprehensive strategies for scaling the SharePoint webhook solution to production environments with high volumes, multiple sites, and diverse processing requirements.

---

## Table of Contents
1. [Infrastructure Scaling](#infrastructure-scaling)
2. [Multi-Tenant Architecture](#multi-tenant-architecture)
3. [Queue Management Strategies](#queue-management-strategies)
4. [Performance Optimization](#performance-optimization)
5. [Monitoring at Scale](#monitoring-at-scale)
6. [Disaster Recovery](#disaster-recovery)

---

## Infrastructure Scaling

### Azure Function App Scaling

#### Consumption Plan (Current)
- **Pros**: Auto-scaling, pay-per-use
- **Cons**: Cold starts, 10-minute timeout
- **Best for**: < 1000 notifications/hour

#### Premium Plan (Recommended for Production)
```json
{
  "tier": "ElasticPremium",
  "size": "EP2",
  "minimumInstances": 2,
  "maximumInstances": 20
}
```

**Benefits**:
- No cold starts
- VNet integration
- Longer execution time (60 minutes)
- Better performance

#### Dedicated App Service Plan
- **When**: > 10,000 notifications/hour
- **Config**: S3 or higher
- **Consider**: Multiple Function Apps for isolation

### Storage Account Configuration

#### Current: Single Storage Account
```
webhookstatestorage
  └── sharepoint-item-states (table)
```

#### Production: Segregated Storage
```
webhook-prod-storage
  ├── item-states-finance (table)
  ├── item-states-hr (table)
  ├── item-states-operations (table)
  └── dead-letter-queue (queue)

webhook-prod-archive
  ├── processed-2025-11 (blob)
  └── failed-2025-11 (blob)
```

### Database Considerations

For > 100,000 items tracked:
```javascript
// Move from Table Storage to Cosmos DB
{
  "partitionKey": "/siteId",
  "throughput": {
    "autoscale": true,
    "maxRU": 4000
  }
}
```

---

## Multi-Tenant Architecture

### Single Function App, Multiple Sites

```javascript
// Configuration per site
const siteConfigs = {
  'finance': {
    siteUrl: 'sites/tenant:/sites/Finance:',
    queues: {
      'invoices': 'Finance_Invoice_Queue',
      'receipts': 'Finance_Receipt_Queue'
    },
    folder: '376892'
  },
  'hr': {
    siteUrl: 'sites/tenant:/sites/HR:',
    queues: {
      'documents': 'HR_Document_Queue',
      'forms': 'HR_Forms_Queue'
    },
    folder: '428901'
  }
};
```

### Webhook Registration Pattern

```bash
# Finance Department
curl -X POST ".../subscription-manager?code=KEY" -d '{
  "resource": "sites/tenant:/sites/Finance:/lists/LIST_ID",
  "clientState": "tenant:finance;processor:document;queue:Finance_Queue;env:PROD"
}'

# HR Department
curl -X POST ".../subscription-manager?code=KEY" -d '{
  "resource": "sites/tenant:/sites/HR:/lists/LIST_ID",
  "clientState": "tenant:hr;processor:document;queue:HR_Queue;env:PROD"
}'
```

### Routing Logic

```javascript
// Enhanced processor registry with tenant routing
function resolveProcessor(params) {
  const tenant = extractTenant(params.clientState);
  const config = tenantConfigs[tenant];

  if (!config) {
    logger.error('Unknown tenant', { tenant });
    return null;
  }

  return getProcessorForTenant(tenant, params);
}
```

---

## Queue Management Strategies

### Queue Hierarchy

```
Organization
  └── Production Folder (376892)
      ├── High Priority Queues
      │   ├── Urgent_Documents
      │   └── Executive_Requests
      ├── Standard Queues
      │   ├── Invoice_Processing
      │   ├── Contract_Review
      │   └── Document_Archive
      └── Bulk Processing Queues
          ├── Batch_Import
          └── Scheduled_Reports
```

### Dynamic Queue Selection

```javascript
class SmartQueueRouter {
  selectQueue(item, metadata) {
    // Priority-based routing
    if (item.Priority === 'Critical') {
      return 'Urgent_Documents';
    }

    // Volume-based routing
    const hourlyVolume = await this.getHourlyVolume();
    if (hourlyVolume > 1000) {
      return this.getLeastLoadedQueue();
    }

    // Time-based routing
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 6) {
      return 'Overnight_Processing';
    }

    // Default routing by type
    return this.getQueueByType(item.ContentType);
  }

  async getLeastLoadedQueue() {
    const queues = await this.uipathClient.getQueues();
    return queues.reduce((min, q) =>
      q.pendingItems < min.pendingItems ? q : min
    ).name;
  }
}
```

### Batch Processing

```javascript
// Batch multiple items into single queue entry
class BatchProcessor {
  constructor(batchSize = 50, maxWaitTime = 5000) {
    this.batch = [];
    this.batchSize = batchSize;
    this.maxWaitTime = maxWaitTime;
  }

  async addItem(item) {
    this.batch.push(item);

    if (this.batch.length >= this.batchSize) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  async flush() {
    if (this.batch.length === 0) return;

    const batchedItem = {
      Type: 'Batch',
      Items: this.batch,
      Count: this.batch.length,
      Reference: `BATCH_${Date.now()}`
    };

    await this.queueClient.addQueueItem(batchedItem);
    this.batch = [];
  }
}
```

---

## Performance Optimization

### Caching Strategy

```javascript
// Multi-tier caching
class CacheManager {
  constructor() {
    this.l1Cache = new Map(); // In-memory (5 min TTL)
    this.l2Cache = new RedisCache(); // Redis (1 hour TTL)
  }

  async get(key) {
    // Check L1
    if (this.l1Cache.has(key)) {
      return this.l1Cache.get(key);
    }

    // Check L2
    const l2Value = await this.l2Cache.get(key);
    if (l2Value) {
      this.l1Cache.set(key, l2Value);
      return l2Value;
    }

    return null;
  }
}
```

### Parallel Processing

```javascript
// Process notifications in parallel with concurrency limit
const pLimit = require('p-limit');
const limit = pLimit(10); // Max 10 concurrent

async function processNotifications(notifications) {
  const promises = notifications.map(n =>
    limit(() => processNotification(n))
  );

  return await Promise.allSettled(promises);
}
```

### Connection Pooling

```javascript
// Reuse HTTP connections
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 50
});

const axiosInstance = axios.create({
  httpsAgent,
  timeout: 30000
});
```

### Query Optimization

```javascript
// Use projection to reduce data transfer
const fields = '$select=id,fields/Title,fields/Modified,fields/Status';
const url = `${graphUrl}/items?${fields}&$top=100`;

// Batch Graph API requests
const batchRequest = {
  requests: items.map((item, i) => ({
    id: i.toString(),
    method: 'GET',
    url: `/sites/${siteId}/lists/${listId}/items/${item.id}`
  }))
};
```

---

## Monitoring at Scale

### KPI Dashboard

```kusto
// Application Insights query for dashboard
let timeRange = 24h;
traces
| where timestamp > ago(timeRange)
| summarize
    TotalNotifications = countif(message contains "Webhook notification received"),
    SuccessfulQueueItems = countif(message contains "Successfully submitted to UiPath"),
    Failures = countif(severityLevel >= 3),
    AvgProcessingTime = avg(toint(customDimensions.duration))
  by bin(timestamp, 1h)
| render timechart
```

### Alert Configuration

```json
{
  "alerts": [
    {
      "name": "High Error Rate",
      "condition": "failures > 10 in 5 minutes",
      "severity": "Critical",
      "action": "Email + SMS"
    },
    {
      "name": "Webhook Expiring Soon",
      "condition": "expiration < 24 hours",
      "severity": "Warning",
      "action": "Email"
    },
    {
      "name": "Queue Backup",
      "condition": "queue depth > 1000",
      "severity": "Warning",
      "action": "Auto-scale"
    }
  ]
}
```

### Custom Metrics

```javascript
// Track custom metrics
const appInsights = require('applicationinsights');

class MetricsCollector {
  trackQueueSubmission(queueName, duration, success) {
    appInsights.defaultClient.trackMetric({
      name: 'QueueSubmissionTime',
      value: duration,
      properties: {
        queue: queueName,
        success: success.toString()
      }
    });
  }

  trackWebhookHealth() {
    const activeCount = this.getActiveWebhookCount();
    const expiringCount = this.getExpiringWebhookCount();

    appInsights.defaultClient.trackMetric({
      name: 'ActiveWebhooks',
      value: activeCount
    });

    appInsights.defaultClient.trackMetric({
      name: 'ExpiringWebhooks',
      value: expiringCount
    });
  }
}
```

---

## Disaster Recovery

### Backup Strategy

```javascript
// Daily backup of webhook configurations
class WebhookBackup {
  async backup() {
    const webhooks = await this.getActiveWebhooks();
    const backup = {
      timestamp: new Date().toISOString(),
      webhooks: webhooks,
      configurations: await this.getConfigurations()
    };

    // Store in blob storage
    await this.blobClient.upload(
      `backups/webhooks-${Date.now()}.json`,
      JSON.stringify(backup)
    );

    // Keep last 30 days
    await this.cleanOldBackups(30);
  }

  async restore(backupDate) {
    const backup = await this.blobClient.download(
      `backups/webhooks-${backupDate}.json`
    );

    for (const webhook of backup.webhooks) {
      await this.recreateWebhook(webhook);
    }
  }
}
```

### Failover Configuration

```javascript
// Multi-region setup
const regions = {
  primary: {
    functionApp: 'webhook-functions-eastus',
    storage: 'webhookstorageeastus'
  },
  secondary: {
    functionApp: 'webhook-functions-westus',
    storage: 'webhookstoragewestus'
  }
};

// Health check and failover
async function healthCheck() {
  try {
    await axios.get(regions.primary.functionApp + '/health');
  } catch (error) {
    await failoverToSecondary();
  }
}
```

### Recovery Procedures

#### Webhook Recovery
```bash
#!/bin/bash
# recover-webhooks.sh

# List all expired webhooks
az storage entity query \
  --table-name webhook-tracking \
  --filter "Status eq 'Expired'" \
  --query items[].SubscriptionId -o tsv > expired-webhooks.txt

# Recreate each webhook
while read -r subscription; do
  echo "Recreating webhook: $subscription"
  curl -X POST ".../recreate-webhook?id=$subscription"
done < expired-webhooks.txt
```

#### Queue Recovery
```javascript
// Replay failed items from dead letter queue
async function replayDeadLetterQueue() {
  const failedItems = await this.storage.getDeadLetterItems();

  for (const item of failedItems) {
    try {
      await this.processNotification(item);
      await this.storage.removeFromDeadLetter(item.id);
    } catch (error) {
      logger.error('Failed to replay item', {
        itemId: item.id,
        error
      });
    }
  }
}
```

---

## Production Deployment Checklist

### Pre-Production
- [ ] Load testing completed (target: 10x expected volume)
- [ ] Security review passed
- [ ] Disaster recovery plan documented
- [ ] Monitoring dashboards created
- [ ] Alert rules configured
- [ ] Runbooks documented

### Go-Live
- [ ] Function App scaled appropriately
- [ ] All webhooks registered with production URLs
- [ ] UiPath credentials for production tenant
- [ ] Backup job scheduled
- [ ] Health check endpoints verified
- [ ] Team trained on procedures

### Post-Production
- [ ] Monitor for 24 hours continuously
- [ ] Verify all metrics reporting
- [ ] Check queue processing rates
- [ ] Review and adjust alert thresholds
- [ ] Document any issues and resolutions
- [ ] Schedule first backup verification

---

## Capacity Planning

### Small Scale (< 10 sites, < 1000 items/day)
- Function App: Consumption plan
- Storage: Single account
- Monitoring: Basic Application Insights

### Medium Scale (10-50 sites, 1000-10000 items/day)
- Function App: Premium EP1
- Storage: Separate accounts per department
- Monitoring: Application Insights + Custom dashboards

### Large Scale (50+ sites, > 10000 items/day)
- Function App: Premium EP2 or Dedicated
- Storage: Cosmos DB + Blob storage
- Monitoring: Full observability stack

---

## Cost Optimization

### Reduce Function Costs
- Use consumption plan for dev/test
- Implement efficient caching
- Batch process where possible
- Optimize code for faster execution

### Reduce Storage Costs
- Archive old state data
- Use lifecycle policies
- Compress large payloads
- Clean up orphaned data regularly

### Reduce UiPath API Calls
- Cache authentication tokens (already implemented)
- Batch queue submissions
- Implement circuit breaker pattern
- Use webhook validation to filter early

---

## Support and Maintenance

### Regular Tasks
- **Daily**: Check dashboard, review errors
- **Weekly**: Review metrics, update documentation
- **Monthly**: Rotate keys, review costs
- **Quarterly**: Disaster recovery test, capacity review

### Emergency Procedures
1. Check Function App health
2. Verify webhook status
3. Review recent errors in App Insights
4. Check UiPath connectivity
5. Implement temporary forwarding if needed
6. Escalate to Azure support if required

---

This production scaling guide should be reviewed and updated regularly based on actual production experience and changing requirements.