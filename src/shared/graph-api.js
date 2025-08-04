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

module.exports = {
    getSubscriptions,
    createSubscription,
    deleteSubscription,
    getListItems,
    createListItem,
    updateListItem
};