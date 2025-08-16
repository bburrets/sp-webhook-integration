/**
 * UiPath Orchestrator Authentication Module
 * Handles OAuth2 authentication with token caching for improved performance
 */

const axios = require('axios');
const config = require('./config');
const { createLogger } = require('./logger');
const { AppError, authenticationError } = require('./error-handler');

// In-memory token cache (in production, consider using Redis or Azure Cache for Redis)
const tokenCache = new Map();

/**
 * Token cache entry structure
 * @typedef {Object} TokenCacheEntry
 * @property {string} accessToken - The OAuth2 access token
 * @property {number} expiresAt - Timestamp when token expires
 * @property {string} tokenType - Type of token (usually 'Bearer')
 */

/**
 * UiPath Authentication Client
 */
class UiPathAuth {
    constructor(context = null) {
        this.logger = createLogger(context);
        this.orchestratorUrl = config.uipath.orchestratorUrl;
        this.tenantName = config.uipath.tenantName;
        this.clientId = config.uipath.clientId;
        this.clientSecret = config.uipath.clientSecret;
        this.organizationUnitId = config.uipath.organizationUnitId;
        
        // Validate required configuration
        this.validateConfig();
        
        // Configure axios instance
        this.httpClient = axios.create({
            baseURL: this.orchestratorUrl,
            timeout: config.uipath.api.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'SharePoint-Webhook-Integration/1.0'
            }
        });

        // Add request/response interceptors for logging
        this.setupInterceptors();
    }

    /**
     * Validate required UiPath configuration
     * @throws {AppError} If configuration is invalid
     */
    validateConfig() {
        const requiredFields = [
            'orchestratorUrl',
            'tenantName',
            'clientId',
            'clientSecret'
        ];

        const missingFields = requiredFields.filter(field => !config.uipath[field]);
        
        if (missingFields.length > 0) {
            throw new AppError(
                `Missing required UiPath configuration: ${missingFields.join(', ')}`,
                500,
                { missingFields }
            );
        }

        // Validate URL format
        try {
            new URL(this.orchestratorUrl);
        } catch (error) {
            throw new AppError(
                'Invalid UiPath Orchestrator URL format',
                500,
                { orchestratorUrl: this.orchestratorUrl }
            );
        }
    }

    /**
     * Setup axios interceptors for logging and error handling
     */
    setupInterceptors() {
        // Request interceptor
        this.httpClient.interceptors.request.use(
            (config) => {
                this.logger.logRequest(config.method?.toUpperCase(), config.url, {
                    service: 'uipath',
                    headers: this.sanitizeHeaders(config.headers)
                });
                return config;
            },
            (error) => {
                this.logger.error('UiPath request failed', { 
                    error: error.message,
                    service: 'uipath'
                });
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.httpClient.interceptors.response.use(
            (response) => {
                this.logger.logResponse(response.status, 0, {
                    service: 'uipath',
                    url: response.config.url
                });
                return response;
            },
            (error) => {
                const status = error.response?.status || 0;
                this.logger.error('UiPath response error', {
                    status,
                    error: error.message,
                    service: 'uipath',
                    url: error.config?.url,
                    responseData: error.response?.data
                });
                return Promise.reject(error);
            }
        );
    }

    /**
     * Sanitize headers for logging (remove sensitive information)
     * @param {Object} headers - Request headers
     * @returns {Object} Sanitized headers
     */
    sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        if (sanitized.Authorization) {
            sanitized.Authorization = '[REDACTED]';
        }
        return sanitized;
    }

    /**
     * Generate cache key for token storage
     * @returns {string} Cache key
     */
    getCacheKey() {
        return `uipath_token_${this.tenantName}_${this.clientId}`;
    }

    /**
     * Check if cached token is valid
     * @param {TokenCacheEntry} cacheEntry - Cached token entry
     * @returns {boolean} True if token is valid
     */
    isTokenValid(cacheEntry) {
        if (!cacheEntry || !cacheEntry.accessToken) {
            return false;
        }

        // Add 5-minute buffer before expiration
        const bufferMs = 5 * 60 * 1000;
        const now = Date.now();
        
        return cacheEntry.expiresAt > (now + bufferMs);
    }

    /**
     * Get cached authentication token if valid
     * @returns {string|null} Valid access token or null
     */
    getCachedToken() {
        if (!config.features.enableTokenCaching) {
            return null;
        }

        const cacheKey = this.getCacheKey();
        const cacheEntry = tokenCache.get(cacheKey);

        if (this.isTokenValid(cacheEntry)) {
            this.logger.debug('Using cached UiPath token', {
                service: 'uipath',
                cacheKey,
                expiresAt: new Date(cacheEntry.expiresAt).toISOString()
            });
            return cacheEntry.accessToken;
        }

        // Remove invalid token from cache
        if (cacheEntry) {
            tokenCache.delete(cacheKey);
            this.logger.debug('Removed expired UiPath token from cache', {
                service: 'uipath',
                cacheKey
            });
        }

        return null;
    }

    /**
     * Store token in cache
     * @param {string} accessToken - Access token
     * @param {number} expiresIn - Token lifetime in seconds
     * @param {string} tokenType - Token type
     */
    cacheToken(accessToken, expiresIn, tokenType = 'Bearer') {
        if (!config.features.enableTokenCaching) {
            return;
        }

        const cacheKey = this.getCacheKey();
        const expiresAt = Date.now() + (expiresIn * 1000);

        const cacheEntry = {
            accessToken,
            expiresAt,
            tokenType
        };

        tokenCache.set(cacheKey, cacheEntry);

        this.logger.debug('Cached UiPath token', {
            service: 'uipath',
            cacheKey,
            expiresAt: new Date(expiresAt).toISOString(),
            expiresInSeconds: expiresIn
        });
    }

    /**
     * Authenticate with UiPath Orchestrator using OAuth2 client credentials flow
     * @returns {Promise<string>} Access token
     * @throws {AppError} If authentication fails
     */
    async authenticate() {
        try {
            // Check for cached valid token first
            const cachedToken = this.getCachedToken();
            if (cachedToken) {
                return cachedToken;
            }

            this.logger.info('Authenticating with UiPath Orchestrator', {
                service: 'uipath',
                tenantName: this.tenantName,
                clientId: this.clientId,
                orchestratorUrl: this.orchestratorUrl
            });

            // Prepare authentication request
            // For External Applications, don't include scope
            const authData = {
                grant_type: 'client_credentials',
                client_id: this.clientId,
                client_secret: this.clientSecret
            };

            const startTime = Date.now();

            // Make authentication request using OAuth2 endpoint
            // Use the global identity server endpoint
            const tokenUrl = `https://cloud.uipath.com/identity_/connect/token`;
            
            const response = await axios.post(
                tokenUrl,
                new URLSearchParams(authData).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            const duration = Date.now() - startTime;

            // Validate response
            if (!response.data || !response.data.access_token) {
                throw new AppError(
                    'Invalid authentication response from UiPath',
                    500,
                    { response: response.data }
                );
            }

            const { access_token, expires_in, token_type } = response.data;

            // Cache the token
            this.cacheToken(access_token, expires_in, token_type);

            this.logger.info('Successfully authenticated with UiPath', {
                service: 'uipath',
                duration,
                tokenType: token_type,
                expiresIn: expires_in
            });

            return access_token;

        } catch (error) {
            this.logger.error('UiPath authentication failed', {
                service: 'uipath',
                error: error.message,
                status: error.response?.status,
                responseData: error.response?.data
            });

            if (error.response?.status === 401) {
                throw authenticationError('Invalid UiPath credentials');
            } else if (error.response?.status === 403) {
                throw authenticationError('UiPath access denied - check tenant and permissions');
            } else if (error.response?.status >= 500) {
                throw new AppError(
                    'UiPath Orchestrator service unavailable',
                    503,
                    { originalError: error.message }
                );
            }

            throw new AppError(
                'UiPath authentication failed',
                500,
                { originalError: error.message }
            );
        }
    }

    /**
     * Get authenticated HTTP client with token
     * @returns {Promise<Object>} Axios instance with authentication headers
     */
    async getAuthenticatedClient() {
        const token = await this.authenticate();

        // Create new client instance with auth headers
        const authenticatedClient = axios.create({
            baseURL: this.orchestratorUrl,
            timeout: config.uipath.api.timeout,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-UIPATH-TenantName': this.tenantName,
                'User-Agent': 'SharePoint-Webhook-Integration/1.0'
            }
        });

        // Add organization unit header if specified
        if (this.organizationUnitId) {
            authenticatedClient.defaults.headers['X-UIPATH-OrganizationUnitId'] = this.organizationUnitId;
        }

        return authenticatedClient;
    }

    /**
     * Clear cached tokens (useful for testing or forced re-authentication)
     * @param {boolean} allTokens - If true, clear all cached tokens; otherwise, clear only this client's token
     */
    clearTokenCache(allTokens = false) {
        if (allTokens) {
            tokenCache.clear();
            this.logger.info('Cleared all UiPath token cache', {
                service: 'uipath'
            });
        } else {
            const cacheKey = this.getCacheKey();
            tokenCache.delete(cacheKey);
            this.logger.info('Cleared UiPath token cache for current client', {
                service: 'uipath',
                cacheKey
            });
        }
    }

    /**
     * Get token cache statistics (for monitoring/debugging)
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        const stats = {
            totalCachedTokens: tokenCache.size,
            tokens: []
        };

        for (const [key, entry] of tokenCache.entries()) {
            stats.tokens.push({
                key,
                isValid: this.isTokenValid(entry),
                expiresAt: new Date(entry.expiresAt).toISOString(),
                tokenType: entry.tokenType
            });
        }

        return stats;
    }
}

/**
 * Create UiPath authentication client
 * @param {Object} context - Azure Functions context
 * @returns {UiPathAuth} Authentication client instance
 */
function createUiPathAuth(context = null) {
    return new UiPathAuth(context);
}

module.exports = {
    UiPathAuth,
    createUiPathAuth
};