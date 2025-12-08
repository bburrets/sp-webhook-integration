/**
 * UiPath Environment Configuration Module
 * Provides utilities to parse environment configuration from clientState
 * and build dynamic UiPath configurations for multi-environment support
 */

const config = require('./config');
const { createLogger } = require('./logger');

/**
 * Environment configuration presets
 */
const ENVIRONMENT_PRESETS = {
    DEV: {
        tenantName: 'FAMBrands_RPAOPS',
        organizationUnitId: '277500',
        orchestratorUrl: 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_'
    },
    PROD: {
        tenantName: 'FAMBrands_RPAOPS_PROD',
        organizationUnitId: '376892',
        orchestratorUrl: 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_'
    }
};

/**
 * Parse environment configuration from clientState
 * Expected clientState format:
 * processor:uipath;uipath:QueueName;env:DEV;folder:277500;config:AzureFunctionApp
 *
 * @param {string} clientState - Client state string from webhook
 * @returns {Object|null} Parsed environment configuration or null if not found
 */
function parseEnvironmentFromClientState(clientState) {
    if (!clientState || typeof clientState !== 'string') {
        return null;
    }

    const envConfig = {
        environment: null,
        folder: null,
        queueName: null
    };

    // Parse semicolon-separated tokens
    const tokens = clientState.split(';').map(t => t.trim());

    for (const token of tokens) {
        const colonIndex = token.indexOf(':');
        if (colonIndex === -1) continue;

        const key = token.substring(0, colonIndex).toLowerCase();
        const value = token.substring(colonIndex + 1);

        if (key === 'env' || key === 'environment') {
            envConfig.environment = value.toUpperCase();
        } else if (key === 'folder' || key === 'organizationunitid') {
            envConfig.folder = value;
        } else if (key === 'uipath' && !value.includes(':')) {
            // Extract queue name from "uipath:QueueName"
            envConfig.queueName = value;
        }
    }

    return envConfig;
}

/**
 * Build UiPath configuration object with environment overrides
 *
 * @param {Object} envConfig - Parsed environment configuration
 * @param {Object} context - Azure Functions context (optional, for logging)
 * @returns {Object} Complete UiPath configuration
 */
function buildUiPathConfig(envConfig, context = null) {
    const logger = context ? createLogger(context) : createLogger();

    // Start with default configuration from environment variables
    const uipathConfig = {
        orchestratorUrl: config.uipath.orchestratorUrl,
        tenantName: config.uipath.tenantName,
        clientId: config.uipath.clientId,
        clientSecret: config.uipath.clientSecret,
        organizationUnitId: config.uipath.organizationUnitId,
        defaultQueue: config.uipath.defaultQueue
    };

    // Apply environment preset if specified
    if (envConfig && envConfig.environment) {
        const preset = ENVIRONMENT_PRESETS[envConfig.environment];

        if (preset) {
            logger.info('Applying UiPath environment preset', {
                environment: envConfig.environment,
                tenantName: preset.tenantName,
                folder: preset.organizationUnitId
            });

            // Override with preset values
            uipathConfig.orchestratorUrl = preset.orchestratorUrl;
            uipathConfig.tenantName = preset.tenantName;
            uipathConfig.organizationUnitId = preset.organizationUnitId;
        } else {
            logger.warn('Unknown environment preset requested', {
                environment: envConfig.environment,
                availablePresets: Object.keys(ENVIRONMENT_PRESETS)
            });
        }
    }

    // Apply folder override if specified (takes precedence over preset)
    if (envConfig && envConfig.folder) {
        logger.debug('Applying folder override', {
            originalFolder: uipathConfig.organizationUnitId,
            newFolder: envConfig.folder
        });
        uipathConfig.organizationUnitId = envConfig.folder;
    }

    // Apply queue override if specified
    if (envConfig && envConfig.queueName) {
        uipathConfig.defaultQueue = envConfig.queueName;
    }

    return uipathConfig;
}

/**
 * Get environment configuration from clientState with full config
 * This is the main function to use in webhook handlers
 *
 * @param {string} clientState - Client state from webhook notification
 * @param {Object} context - Azure Functions context
 * @returns {Object} Complete UiPath configuration with environment overrides
 */
function getEnvironmentConfig(clientState, context = null) {
    const logger = context ? createLogger(context) : createLogger();

    // Parse environment from clientState
    const envConfig = parseEnvironmentFromClientState(clientState);

    if (!envConfig || !envConfig.environment) {
        logger.debug('No environment configuration in clientState, using defaults', {
            clientState: clientState?.substring(0, 100)
        });
    }

    // Build and return complete config
    const finalConfig = buildUiPathConfig(envConfig, context);

    logger.debug('Built UiPath environment configuration', {
        environment: envConfig?.environment || 'DEFAULT',
        tenantName: finalConfig.tenantName,
        folder: finalConfig.organizationUnitId,
        queue: finalConfig.defaultQueue
    });

    return finalConfig;
}

/**
 * Validate environment configuration
 *
 * @param {Object} uipathConfig - UiPath configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validateEnvironmentConfig(uipathConfig) {
    const required = ['orchestratorUrl', 'tenantName', 'clientId', 'clientSecret'];
    const missing = required.filter(field => !uipathConfig[field]);

    if (missing.length > 0) {
        throw new Error(`Missing required UiPath configuration: ${missing.join(', ')}`);
    }

    // Validate URL format
    try {
        new URL(uipathConfig.orchestratorUrl);
    } catch (error) {
        throw new Error(`Invalid UiPath Orchestrator URL: ${uipathConfig.orchestratorUrl}`);
    }

    return true;
}

/**
 * Get environment name from configuration for logging/display
 *
 * @param {Object} uipathConfig - UiPath configuration
 * @returns {string} Environment name (DEV, PROD, or CUSTOM)
 */
function getEnvironmentName(uipathConfig) {
    for (const [envName, preset] of Object.entries(ENVIRONMENT_PRESETS)) {
        if (preset.tenantName === uipathConfig.tenantName &&
            preset.organizationUnitId === uipathConfig.organizationUnitId) {
            return envName;
        }
    }
    return 'CUSTOM';
}

module.exports = {
    parseEnvironmentFromClientState,
    buildUiPathConfig,
    getEnvironmentConfig,
    validateEnvironmentConfig,
    getEnvironmentName,
    ENVIRONMENT_PRESETS
};
