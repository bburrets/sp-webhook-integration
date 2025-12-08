const { app } = require('@azure/functions');
const axios = require('axios');
const { getAccessToken } = require('../shared/auth');
const config = require('../shared/config');

// Sync webhooks to SharePoint list using Microsoft Graph API
app.http('webhook-sync', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Webhook sync and renewal triggered');

        try {
            // Get configuration
            const listId = config.sharepoint.lists.webhookManagement;
            const sitePath = config.sharepoint.primarySite.sitePath;

            // Get access token using shared auth module
            const accessToken = await getAccessToken(context);

            // Step 1: Renew expiring webhooks first
            const renewalResult = await renewExpiringWebhooks(accessToken, context);

            // Step 2: Get all webhooks from Microsoft Graph (with updated expirations)
            const webhooks = await getWebhooks(accessToken, context);

            // Step 3: Sync to SharePoint list using Graph API
            const syncResult = await syncToSharePoint(accessToken, sitePath, listId, webhooks, context);

            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Sync and renewal completed',
                    webhooksFound: webhooks.length,
                    renewalResult: {
                        checked: renewalResult.checked,
                        renewed: renewalResult.renewed,
                        failed: renewalResult.failed,
                        skipped: renewalResult.skipped,
                        renewals: renewalResult.renewals
                    },
                    syncResult: syncResult
                })
            };

        } catch (error) {
            context.log.error('Error in webhook sync/renewal:', error);
            context.log.error('Error stack:', error.stack);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Sync/renewal failed',
                    details: error.message,
                    stack: error.stack
                })
            };
        }
    }
});

// Timer trigger for automatic sync and renewal
app.timer('webhook-sync-timer', {
    schedule: '0 0 * * * *', // Every hour
    handler: async (_myTimer, context) => {
        context.log('Timer triggered webhook sync and renewal');

        try {
            const listId = config.sharepoint.lists.webhookManagement;
            const sitePath = config.sharepoint.primarySite.sitePath;

            const accessToken = await getAccessToken(context);

            // Step 1: Renew expiring webhooks BEFORE syncing
            const renewalResult = await renewExpiringWebhooks(accessToken, context);
            context.log('Webhook renewal completed:', renewalResult);

            // Step 2: Get webhooks (now with updated expiration dates)
            const webhooks = await getWebhooks(accessToken, context);

            // Step 3: Sync to SharePoint list
            await syncToSharePoint(accessToken, sitePath, listId, webhooks, context);

            context.log('Timer sync and renewal completed successfully', {
                renewed: renewalResult.renewed,
                failed: renewalResult.failed
            });
        } catch (error) {
            context.log.error('Timer sync/renewal failed:', error);
        }
    }
});

// Removed duplicate getAccessToken - now using shared auth module

async function getWebhooks(accessToken, context) {
    try {
        const response = await axios.get(`${config.api.graph.baseUrl}/subscriptions`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        context.log(`Found ${response.data.value.length} webhooks`);
        return response.data.value;
    } catch (error) {
        context.log.error('Error getting webhooks:', error);
        throw error;
    }
}

/**
 * Renew webhooks that are expiring within the next 24 hours
 * SharePoint webhooks have a maximum lifetime of 3 days and must be renewed before expiration
 * @param {string} accessToken - Microsoft Graph API access token
 * @param {Object} context - Azure Functions context for logging
 * @returns {Promise<Object>} Renewal results with counts of renewed/failed webhooks
 */
async function renewExpiringWebhooks(accessToken, context) {
    const results = {
        checked: 0,
        renewed: 0,
        failed: 0,
        skipped: 0,
        renewals: []
    };

    try {
        // Get all current webhooks
        const webhooks = await getWebhooks(accessToken, context);
        results.checked = webhooks.length;

        // Calculate time thresholds
        const now = new Date();
        const renewalThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
        const newExpiration = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now (max allowed)

        context.log(`Checking ${webhooks.length} webhooks for renewal (threshold: ${renewalThreshold.toISOString()})`);

        // Check each webhook and renew if expiring soon
        for (const webhook of webhooks) {
            const expiryDate = new Date(webhook.expirationDateTime);
            const timeUntilExpiry = expiryDate - now;
            const hoursUntilExpiry = Math.floor(timeUntilExpiry / (60 * 60 * 1000));

            // Renew if expiring within 24 hours
            if (expiryDate < renewalThreshold) {
                context.log(`Webhook ${webhook.id} expires in ${hoursUntilExpiry} hours - RENEWING`, {
                    resource: webhook.resource,
                    currentExpiry: webhook.expirationDateTime,
                    newExpiry: newExpiration.toISOString()
                });

                try {
                    // PATCH the subscription to extend expiration
                    const response = await axios.patch(
                        `${config.api.graph.baseUrl}/subscriptions/${webhook.id}`,
                        {
                            expirationDateTime: newExpiration.toISOString()
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    results.renewed++;
                    results.renewals.push({
                        subscriptionId: webhook.id,
                        resource: webhook.resource,
                        oldExpiry: webhook.expirationDateTime,
                        newExpiry: response.data.expirationDateTime,
                        status: 'success'
                    });

                    context.log(`✅ Successfully renewed webhook ${webhook.id}`, {
                        newExpiration: response.data.expirationDateTime
                    });

                } catch (renewError) {
                    results.failed++;
                    results.renewals.push({
                        subscriptionId: webhook.id,
                        resource: webhook.resource,
                        oldExpiry: webhook.expirationDateTime,
                        error: renewError.response?.data?.error?.message || renewError.message,
                        status: 'failed'
                    });

                    context.log.error(`❌ Failed to renew webhook ${webhook.id}:`, {
                        error: renewError.response?.data || renewError.message,
                        resource: webhook.resource
                    });
                }
            } else {
                results.skipped++;
                context.log(`Webhook ${webhook.id} expires in ${hoursUntilExpiry} hours - no renewal needed`, {
                    expiry: webhook.expirationDateTime
                });
            }
        }

        // Log summary
        context.log('Webhook renewal summary:', {
            checked: results.checked,
            renewed: results.renewed,
            failed: results.failed,
            skipped: results.skipped
        });

        // Alert if any renewals failed
        if (results.failed > 0) {
            context.log.error(`⚠️ WARNING: ${results.failed} webhook renewal(s) failed! Manual intervention may be required.`);
        }

        return results;

    } catch (error) {
        context.log.error('Error in webhook renewal process:', error);
        throw error;
    }
}

async function syncToSharePoint(accessToken, sitePath, listId, webhooks, context) {
    try {
        // Get existing items from SharePoint list using Graph API
        const existingItems = await getSharePointListItems(accessToken, sitePath, listId, context);
        
        // Create a map of existing webhooks by subscription ID
        const existingMap = new Map();
        existingItems.forEach(item => {
            if (item.fields && item.fields.SubscriptionId) {
                existingMap.set(item.fields.SubscriptionId, item);
            }
        });

        const results = {
            created: 0,
            updated: 0,
            deleted: 0
        };

        // Update or create items for current webhooks
        for (const webhook of webhooks) {
            const existingItem = existingMap.get(webhook.id);
            
            // Extract site and list info from resource
            let listName = 'Unknown List';
            let siteUrl = '';
            let listIdValue = '';
            let resourceType = 'List'; // Default
            
            if (webhook.resource) {
                const parts = webhook.resource.split('/lists/');
                siteUrl = parts[0];
                listIdValue = parts[1];
                
                // Try to get the actual list name and type from Graph API
                try {
                    const sitePathForList = siteUrl.replace('sites/', '');
                    const listUrl = `https://graph.microsoft.com/v1.0/sites/${sitePathForList}/lists/${listIdValue}`;
                    const listResponse = await axios.get(listUrl, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Accept': 'application/json'
                        }
                    });
                    listName = listResponse.data.displayName || listResponse.data.name || `List ${listIdValue}`;
                    
                    // Determine if it's a Document Library
                    if (listResponse.data.list && listResponse.data.list.template === 'documentLibrary') {
                        resourceType = 'Library';
                    }
                } catch (listError) {
                    context.log.warn(`Could not fetch list details for ${listIdValue}:`, listError.message);
                    context.log.warn(`Error response:`, listError.response?.data);
                    listName = `List ${listIdValue}`;
                }
            }
            
            // Check if this is a proxy webhook
            let isProxy = 'No';
            let forwardingUrl = '';
            if (webhook.clientState && webhook.clientState.startsWith('forward:')) {
                isProxy = 'Yes';
                forwardingUrl = webhook.clientState.substring(8);
            }
            
            const itemData = {
                fields: {
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
                    NotificationCount: existingItem ? existingItem.fields.NotificationCount || 0 : 0,
                    ClientState: webhook.clientState || '',
                    ForwardingUrl: forwardingUrl,
                    IsProxy: isProxy,
                    LastForwardedDateTime: existingItem ? existingItem.fields.LastForwardedDateTime || null : null
                }
            };

            try {
                if (existingItem) {
                    // ALWAYS preserve existing ClientState if it exists
                    // Microsoft Graph doesn't preserve clientState, but we store it in SharePoint
                    // This includes UiPath routing configs (processor:uipath...) and forwarding configs (forward:...)
                    if (existingItem.fields.ClientState) {
                        itemData.fields.ClientState = existingItem.fields.ClientState;

                        // Also preserve forwarding-specific fields if set
                        if (existingItem.fields.ForwardingUrl) {
                            itemData.fields.ForwardingUrl = existingItem.fields.ForwardingUrl;
                        }
                        if (existingItem.fields.IsProxy) {
                            itemData.fields.IsProxy = existingItem.fields.IsProxy;
                        }
                    }

                    // Update existing item
                    await updateSharePointListItem(accessToken, sitePath, listId, existingItem.id, itemData, context);
                    results.updated++;
                    existingMap.delete(webhook.id); // Remove from map to track what's left
                } else {
                    // Create new item
                    await createSharePointListItem(accessToken, sitePath, listId, itemData, context);
                    results.created++;
                }
            } catch (itemError) {
                context.log.error(`Failed to sync webhook ${webhook.id}:`, itemError.message);
                // Continue with other webhooks
            }
        }

        // Mark remaining items as deleted (no longer exist in Graph)
        for (const [subscriptionId, item] of existingMap) {
            try {
                const updateData = {
                    fields: {
                        Status: 'Deleted'
                    }
                };
                await updateSharePointListItem(accessToken, sitePath, listId, item.id, updateData, context);
                results.deleted++;
            } catch (deleteError) {
                context.log.error(`Failed to mark webhook ${subscriptionId} as deleted:`, deleteError.message);
                // Continue with other items
            }
        }

        context.log('Sync results:', results);
        return results;

    } catch (error) {
        context.log.error('Error syncing to SharePoint:', error);
        throw error;
    }
}

async function getSharePointListItems(accessToken, sitePath, listId, context) {
    try {
        const apiUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields&$top=5000`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        return response.data.value || [];
    } catch (error) {
        context.log.error('Error getting SharePoint list items:', error.response?.data || error.message);
        return [];
    }
}

async function createSharePointListItem(accessToken, sitePath, listId, itemData, context) {
    try {
        const apiUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items`;

        await axios.post(apiUrl, itemData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        context.log('Created SharePoint list item for webhook:', itemData.fields.SubscriptionId);
    } catch (error) {
        context.log.error('Error creating SharePoint list item:', error.response?.data || error.message);
        context.log.error('Item data:', JSON.stringify(itemData, null, 2));
        context.log.error('API URL:', apiUrl);
        // Don't re-throw - let the sync continue
    }
}

async function updateSharePointListItem(accessToken, sitePath, listId, itemId, itemData, context) {
    try {
        const apiUrl = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${itemId}`;
        
        await axios.patch(apiUrl, itemData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        context.log('Updated SharePoint list item:', itemId);
    } catch (error) {
        context.log.error('Error updating SharePoint list item:', error.response?.data || error.message);
    }
}