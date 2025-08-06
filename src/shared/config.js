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
            '9e35f709-48be-4995-8b28-79730ad12b89': 'DWI List'
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
    }
};