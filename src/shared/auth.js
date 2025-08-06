const axios = require('axios');
const config = require('./config');

/**
 * Get Microsoft Graph access token using client credentials
 * @param {Object} context - Azure Functions context for logging
 * @returns {Promise<string>} Access token
 */
async function getAccessToken(context) {
    const clientId = config.azure.clientId;
    const clientSecret = config.azure.clientSecret;
    const tenantId = config.azure.tenantId;
    
    if (!clientId || !clientSecret || !tenantId) {
        throw new Error('Missing required Azure AD credentials in environment variables');
    }
    
    try {
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        
        const tokenParams = new URLSearchParams();
        tokenParams.append('client_id', clientId);
        tokenParams.append('client_secret', clientSecret);
        tokenParams.append('scope', config.api.graph.scope);
        tokenParams.append('grant_type', 'client_credentials');

        const tokenResponse = await axios.post(tokenUrl, tokenParams, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (context) {
            context.log('Access token obtained successfully');
        }
        
        return tokenResponse.data.access_token;

    } catch (error) {
        if (context) {
            context.error('Error getting access token:', error.response?.data || error.message);
        }
        throw new Error('Failed to obtain access token: ' + (error.response?.data?.error_description || error.message));
    }
}

module.exports = {
    getAccessToken
};