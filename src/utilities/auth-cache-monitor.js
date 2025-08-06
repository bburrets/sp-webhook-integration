const { app } = require('@azure/functions');
const { getCacheStatistics } = require('../shared/auth');
const { wrapHandler } = require('../shared/error-handler');

/**
 * Monitor authentication token cache performance
 * This is a utility function for development and debugging
 */
async function authCacheMonitor(request, context) {
    context.log('Auth cache monitor requested');
    
    const stats = getCacheStatistics();
    
    // Add recommendations based on statistics
    const recommendations = [];
    
    if (stats.hitRate === '0%' && stats.misses > 10) {
        recommendations.push('Token cache appears to be ineffective. Check if tokens are expiring too quickly.');
    }
    
    if (stats.errors > 0) {
        recommendations.push(`There have been ${stats.errors} authentication errors. Check your Azure AD configuration.`);
    }
    
    if (stats.hits > 100) {
        recommendations.push('Cache is performing well with many hits. Consider monitoring memory usage.');
    }
    
    const response = {
        cacheStatistics: stats,
        recommendations,
        timestamp: new Date().toISOString()
    };
    
    return {
        status: 200,
        jsonBody: response
    };
}

app.http('auth-cache-monitor', {
    methods: ['GET'],
    authLevel: 'function',
    handler: wrapHandler(authCacheMonitor)
});

module.exports = authCacheMonitor;