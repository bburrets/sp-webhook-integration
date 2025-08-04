const { getListItems, createListItem, updateListItem } = require('./graph-api');

// Default SharePoint configuration
const SITE_PATH = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
const LIST_ID = process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4';

/**
 * Find a webhook item in SharePoint list by subscription ID
 * @param {string} accessToken - Graph API access token
 * @param {string} subscriptionId - Subscription ID to find
 * @returns {Promise<Object|null>} SharePoint list item or null
 */
async function findWebhookItem(accessToken, subscriptionId) {
    const items = await getListItems(accessToken, SITE_PATH, LIST_ID);
    
    return items.find(item => 
        item.fields && item.fields.SubscriptionId === subscriptionId
    ) || null;
}

/**
 * Sync webhook to SharePoint list
 * @param {string} accessToken - Graph API access token
 * @param {Object} webhook - Webhook data
 * @param {string} action - Action type ('created' or 'deleted')
 * @param {Object} context - Azure Functions context for logging
 */
async function syncWebhookToSharePoint(accessToken, webhook, action, context) {
    if (action === 'created') {
        // Extract site and list info from resource
        let listName = 'Unknown List';
        let siteUrl = '';
        let listIdValue = '';
        
        if (webhook.resource) {
            const parts = webhook.resource.split('/lists/');
            siteUrl = parts[0];
            listIdValue = parts[1];
            
            // Map known list IDs to names
            if (listIdValue === '30516097-c58c-478c-b87f-76c8f6ce2b56') {
                listName = 'testList';
            } else if (listIdValue === '82a105da-8206-4bd0-851b-d3f2260043f4') {
                listName = 'Webhook Management';
            }
        }
        
        // Determine resource type
        let resourceType = 'List';
        if (webhook.resource && webhook.resource.includes('sites/')) {
            resourceType = 'List';
        }
        
        // Check if this is a proxy webhook
        let isProxy = 'No';
        let forwardingUrl = '';
        if (webhook.clientState && webhook.clientState.startsWith('forward:')) {
            isProxy = 'Yes';
            forwardingUrl = webhook.clientState.substring(8);
        }
        
        // Create webhook item in SharePoint
        const fields = {
            Title: `${resourceType} - ${listName}`,
            SubscriptionId: webhook.id,
            ChangeType: webhook.changeType,
            NotificationUrl: webhook.notificationUrl,
            ExpirationDateTime: webhook.expirationDateTime,
            Status: 'Active',
            SiteUrl: siteUrl,
            ListId: listIdValue,
            ListName: listName,
            ResourceType: resourceType,
            AutoRenew: true,
            NotificationCount: 0,
            ClientState: webhook.clientState || '',
            ForwardingUrl: forwardingUrl,
            IsProxy: isProxy
        };
        
        await createListItem(accessToken, SITE_PATH, LIST_ID, fields);
        
        if (context) {
            context.log('Webhook synced to SharePoint list:', webhook.id);
        }
        
    } else if (action === 'deleted') {
        // Find and update the item in SharePoint list
        const item = await findWebhookItem(accessToken, webhook.id);
        
        if (item) {
            await updateListItem(accessToken, SITE_PATH, LIST_ID, item.id, {
                Status: 'Deleted'
            });
            
            if (context) {
                context.log('Webhook marked as deleted in SharePoint list:', webhook.id);
            }
        } else if (context) {
            context.warn('Webhook not found in SharePoint list:', webhook.id);
        }
    }
}

/**
 * Update notification count for a webhook
 * @param {string} accessToken - Graph API access token
 * @param {string} subscriptionId - Subscription ID
 * @param {Object} context - Azure Functions context for logging
 */
async function updateNotificationCount(accessToken, subscriptionId, context) {
    const item = await findWebhookItem(accessToken, subscriptionId);
    
    if (item) {
        // Check if webhook is marked as deleted
        if (item.fields.Status === 'Deleted') {
            if (context) {
                context.warn(`Received notification from deleted webhook ${subscriptionId}. Ignoring.`);
            }
            return;
        }
        
        const currentCount = item.fields.NotificationCount || 0;
        
        await updateListItem(accessToken, SITE_PATH, LIST_ID, item.id, {
            NotificationCount: currentCount + 1
        });
        
        if (context) {
            context.log(`Updated notification count for webhook ${subscriptionId}: ${currentCount + 1}`);
        }
    } else if (context) {
        context.warn(`Webhook ${subscriptionId} not found in SharePoint list. It may have been deleted.`);
    }
}

/**
 * Update forwarding statistics for a webhook
 * @param {string} accessToken - Graph API access token
 * @param {string} subscriptionId - Subscription ID
 * @param {Object} context - Azure Functions context for logging
 */
async function updateForwardingStats(accessToken, subscriptionId, context) {
    const item = await findWebhookItem(accessToken, subscriptionId);
    
    if (item) {
        await updateListItem(accessToken, SITE_PATH, LIST_ID, item.id, {
            LastForwardedDateTime: new Date().toISOString()
        });
        
        if (context) {
            context.log(`Updated forwarding stats for webhook ${subscriptionId}`);
        }
    }
}

module.exports = {
    SITE_PATH,
    LIST_ID,
    findWebhookItem,
    syncWebhookToSharePoint,
    updateNotificationCount,
    updateForwardingStats
};