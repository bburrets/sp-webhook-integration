/**
 * Central configuration module for SharePoint webhook solution
 * All environment-specific and hardcoded values should be managed here
 */

module.exports = {
    // Azure AD Configuration
    azure: {
        clientId: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
        tenantId: process.env.AZURE_TENANT_ID,
        functionKey: process.env.FUNCTION_KEY
    },

    // SharePoint Configuration
    sharepoint: {
        // Primary site configuration
        primarySite: {
            domain: process.env.SHAREPOINT_DOMAIN || 'fambrandsllc.sharepoint.com',
            siteName: process.env.SHAREPOINT_SITE_NAME || 'sphookmanagement',
            sitePath: process.env.SHAREPOINT_SITE_PATH || 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:',
            siteUrl: process.env.SHAREPOINT_SITE_URL || 'https://fambrandsllc.sharepoint.com/sites/sphookmanagement'
        },
        
        // List IDs
        lists: {
            webhookManagement: process.env.WEBHOOK_LIST_ID || '82a105da-8206-4bd0-851b-d3f2260043f4',
            test: process.env.TEST_LIST_ID || '30516097-c58c-478c-b87f-76c8f6ce2b56'
        },
        
        // Known list mappings
        listMappings: {
            '30516097-c58c-478c-b87f-76c8f6ce2b56': 'testList',
            '82a105da-8206-4bd0-851b-d3f2260043f4': 'Webhook Management',
            '9e35f709-48be-4995-8b28-79730ad12b89': 'DWI List',
            '8bfe9dca-9dc3-44a8-8964-ac6d8712d8e3': 'COSTCO US INLINE Routing Tracker (PROD)'
        },
        
        // Known site configurations
        knownSites: {
            'DWI': {
                path: 'fambrandsllc.sharepoint.com:/sites/DWI:',
                subsites: {
                    'COSTCO-INLINE-Trafficking-Routing': 'fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:',
                    'Logistics_Receiving_Inspections': 'fambrandsllc.sharepoint.com:/sites/DWI/Logistics_Receiving_Inspections:'
                }
            }
        }
    },

    // API Configuration
    api: {
        graph: {
            baseUrl: 'https://graph.microsoft.com/v1.0',
            scope: 'https://graph.microsoft.com/.default'
        },
        timeout: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000 // 1 second
    },

    // Webhook Configuration
    webhook: {
        maxExpirationDays: 3,
        defaultClientState: 'SharePointWebhook',
        validationTimeout: 5000, // 5 seconds
        notificationTimeout: 10000, // 10 seconds
        loopPreventionWindow: 10000 // 10 seconds
    },

    // Azure Table Storage Configuration
    storage: {
        accountName: process.env.AZURE_STORAGE_ACCOUNT || 'webhookstorageacct002',
        tableName: process.env.STORAGE_TABLE_NAME || 'SharePointItemStates',
        connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING
    },

    // Function App Configuration
    functionApp: {
        name: process.env.WEBSITE_SITE_NAME || 'webhook-functions-sharepoint-002',
        hostname: process.env.WEBSITE_HOSTNAME,
        environment: process.env.AZURE_FUNCTIONS_ENVIRONMENT || 'production'
    },

    // Feature Flags
    features: {
        skipSelfNotifications: process.env.SKIP_SELF_NOTIFICATIONS === 'true',
        enableMetricsCollection: process.env.ENABLE_METRICS === 'true',
        enableDetailedLogging: process.env.DETAILED_LOGGING === 'true',
        enableTokenCaching: process.env.ENABLE_TOKEN_CACHE === 'true'
    },

    // Development/Debug Configuration
    debug: {
        isDevelopment: process.env.NODE_ENV === 'development',
        showStackTraces: process.env.SHOW_STACK_TRACES === 'true' || process.env.NODE_ENV === 'development'
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'INFO', // ERROR, WARN, INFO, DEBUG
        format: process.env.LOG_FORMAT || 'json', // json or text
        includeTimestamp: process.env.LOG_TIMESTAMP !== 'false',
        includeInvocationId: process.env.LOG_INVOCATION_ID !== 'false'
    },

    // UiPath Configuration
    uipath: {
        orchestratorUrl: process.env.UIPATH_ORCHESTRATOR_URL,
        tenantName: process.env.UIPATH_TENANT_NAME,
        clientId: process.env.UIPATH_CLIENT_ID,
        clientSecret: process.env.UIPATH_CLIENT_SECRET,
        organizationUnitId: process.env.UIPATH_ORGANIZATION_UNIT_ID,
        defaultQueue: process.env.UIPATH_DEFAULT_QUEUE,
        
        // API Configuration
        api: {
            authEndpoint: '/api/account/authenticate',
            queueEndpoint: '/odata/Queues/UiPathODataSvc.AddQueueItem',
            queueItemsEndpoint: '/odata/QueueItems',
            jobEndpoint: '/odata/Jobs',
            timeout: 30000, // 30 seconds
            retryAttempts: 3,
            retryDelay: 2000 // 2 seconds
        },

        // Feature flags for UiPath integration
        features: {
            enabled: process.env.UIPATH_ENABLED === 'true',
            autoRetry: process.env.UIPATH_AUTO_RETRY !== 'false',
            enableLogging: process.env.UIPATH_LOGGING === 'true'
        }
    }
};