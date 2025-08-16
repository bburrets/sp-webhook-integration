const axios = require('axios');

/**
 * Get all webhook subscriptions from Microsoft Graph
 * @param {string} accessToken - Graph API access token
 * @returns {Promise<Array>} Array of webhook subscriptions
 */
async function getSubscriptions(accessToken) {
    const response = await axios.get('https://graph.microsoft.com/v1.0/subscriptions', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
    
    return response.data.value;
}

/**
 * Create a new webhook subscription
 * @param {string} accessToken - Graph API access token
 * @param {Object} subscription - Subscription data
 * @returns {Promise<Object>} Created subscription
 */
async function createSubscription(accessToken, subscription) {
    const response = await axios.post('https://graph.microsoft.com/v1.0/subscriptions', subscription, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        timeout: 30000
    });
    
    return response.data;
}

/**
 * Delete a webhook subscription
 * @param {string} accessToken - Graph API access token
 * @param {string} subscriptionId - Subscription ID to delete
 * @returns {Promise<void>}
 */
async function deleteSubscription(accessToken, subscriptionId) {
    await axios.delete(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
}

/**
 * Get SharePoint list items
 * @param {string} accessToken - Graph API access token
 * @param {string} sitePath - SharePoint site path
 * @param {string} listId - SharePoint list ID
 * @returns {Promise<Array>} Array of list items
 */
async function getListItems(accessToken, sitePath, listId) {
    const url = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items?$expand=fields`;
    const response = await axios.get(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });
    
    return response.data.value;
}

/**
 * Create a SharePoint list item
 * @param {string} accessToken - Graph API access token
 * @param {string} sitePath - SharePoint site path
 * @param {string} listId - SharePoint list ID
 * @param {Object} fields - Item fields
 * @returns {Promise<Object>} Created item
 */
async function createListItem(accessToken, sitePath, listId, fields) {
    const url = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items`;
    const response = await axios.post(url, { fields }, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    
    return response.data;
}

/**
 * Update a SharePoint list item
 * @param {string} accessToken - Graph API access token
 * @param {string} sitePath - SharePoint site path
 * @param {string} listId - SharePoint list ID
 * @param {string} itemId - Item ID to update
 * @param {Object} fields - Fields to update
 * @returns {Promise<Object>} Updated item
 */
async function updateListItem(accessToken, sitePath, listId, itemId, fields) {
    const url = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${itemId}`;
    const response = await axios.patch(url, { fields }, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    
    return response.data;
}

/**
 * Get SharePoint site information
 * @param {string} accessToken - Graph API access token
 * @param {string} sitePath - SharePoint site path
 * @returns {Promise<Object>} Site information
 */
async function getSiteInfo(accessToken, sitePath) {
    const url = `https://graph.microsoft.com/v1.0/sites/${sitePath}`;
    const response = await axios.get(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });
    
    return response.data;
}

/**
 * Get drive item (document) information
 * @param {string} accessToken - Graph API access token
 * @param {string} siteId - SharePoint site ID
 * @param {string} itemId - Drive item ID
 * @returns {Promise<Object>} Drive item information
 */
async function getDriveItem(accessToken, siteId, itemId) {
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}`;
    const response = await axios.get(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });
    
    return response.data;
}

/**
 * Get drive item download URL
 * @param {string} accessToken - Graph API access token
 * @param {string} siteId - SharePoint site ID
 * @param {string} itemId - Drive item ID
 * @returns {Promise<string>} Download URL
 */
async function getDriveItemDownloadUrl(accessToken, siteId, itemId) {
    const driveItem = await getDriveItem(accessToken, siteId, itemId);
    return driveItem['@microsoft.graph.downloadUrl'] || null;
}

/**
 * Download drive item content
 * @param {string} accessToken - Graph API access token
 * @param {string} siteId - SharePoint site ID
 * @param {string} itemId - Drive item ID
 * @returns {Promise<Buffer>} File content as buffer
 */
async function downloadDriveItemContent(accessToken, siteId, itemId) {
    const downloadUrl = await getDriveItemDownloadUrl(accessToken, siteId, itemId);
    
    if (!downloadUrl) {
        throw new Error('No download URL available for this item');
    }

    const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 60000 // 60 seconds for file downloads
    });
    
    return Buffer.from(response.data);
}

/**
 * Get list attachments for a specific item
 * @param {string} accessToken - Graph API access token
 * @param {string} sitePath - SharePoint site path
 * @param {string} listId - SharePoint list ID
 * @param {string} itemId - List item ID
 * @returns {Promise<Array>} Array of attachments
 */
async function getListItemAttachments(accessToken, sitePath, listId, itemId) {
    const url = `https://graph.microsoft.com/v1.0/sites/${sitePath}/lists/${listId}/items/${itemId}/attachments`;
    const response = await axios.get(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });
    
    return response.data.value || [];
}

module.exports = {
    getSubscriptions,
    createSubscription,
    deleteSubscription,
    getListItems,
    createListItem,
    updateListItem,
    getSiteInfo,
    getDriveItem,
    getDriveItemDownloadUrl,
    downloadDriveItemContent,
    getListItemAttachments
};