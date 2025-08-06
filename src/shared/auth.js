const axios = require('axios');
const config = require('./config');

// Token cache
let tokenCache = {
    token: null,
    expiresAt: null
};

// Cache statistics for monitoring
let cacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
    lastFetchTime: null
};

/**
 * Check if cached token is still valid
 * @returns {boolean} True if token is valid
 */
function isTokenValid() {
    if (!tokenCache.token || !tokenCache.expiresAt) {
        return false;
    }
    
    // Check if token expires in less than 5 minutes (to be safe)
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    return (tokenCache.expiresAt - now) > fiveMinutes;
}

/**
 * Clear the token cache
 */
function clearTokenCache() {
    tokenCache.token = null;
    tokenCache.expiresAt = null;
}

/**
 * Get cache hit rate percentage
 * @returns {number} Cache hit rate as percentage
 */
function getCacheHitRate() {
    const total = cacheStats.hits + cacheStats.misses;
    if (total === 0) return 0;
    return Math.round((cacheStats.hits / total) * 100);
}

/**
 * Get cache statistics for monitoring
 * @returns {Object} Cache statistics
 */
function getCacheStatistics() {
    return {
        ...cacheStats,
        hitRate: getCacheHitRate() + '%',
        isTokenCached: isTokenValid(),
        tokenExpiresAt: tokenCache.expiresAt ? new Date(tokenCache.expiresAt).toISOString() : null
    };
}

/**
 * Get Microsoft Graph access token using client credentials
 * Implements caching to reduce authentication API calls
 * @param {Object} context - Azure Functions context for logging
 * @param {boolean} forceRefresh - Force a new token even if cached token is valid
 * @returns {Promise<string>} Access token
 */
async function getAccessToken(context, forceRefresh = false) {
    // Check cache first unless forced refresh
    if (!forceRefresh && isTokenValid()) {
        cacheStats.hits++;
        if (context) {
            context.log(`Returning cached access token (cache hit rate: ${getCacheHitRate()}%)`);
        }
        return tokenCache.token;
    }
    
    // Cache miss
    cacheStats.misses++;
    
    const clientId = config.azure.clientId;
    const clientSecret = config.azure.clientSecret;
    const tenantId = config.azure.tenantId;
    
    if (!clientId || !clientSecret || !tenantId) {
        throw new Error('Missing required Azure AD credentials in environment variables');
    }
    
    try {
        if (context) {
            context.log('Fetching new access token from Azure AD');
        }
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

        // Cache the token
        tokenCache.token = tokenResponse.data.access_token;
        // Calculate expiration time (expires_in is in seconds)
        const expiresIn = tokenResponse.data.expires_in || 3600; // Default to 1 hour
        tokenCache.expiresAt = Date.now() + (expiresIn * 1000);
        cacheStats.lastFetchTime = new Date().toISOString();
        
        if (context) {
            context.log(`Access token obtained successfully, expires in ${expiresIn} seconds (cache hit rate: ${getCacheHitRate()}%)`);
        }
        
        return tokenCache.token;

    } catch (error) {
        // Clear cache on error
        clearTokenCache();
        cacheStats.errors++;
        
        if (context) {
            context.error('Error getting access token:', error.response?.data || error.message);
        }
        throw new Error('Failed to obtain access token: ' + (error.response?.data?.error_description || error.message));
    }
}

module.exports = {
    getAccessToken,
    clearTokenCache,
    isTokenValid,
    getCacheStatistics
};