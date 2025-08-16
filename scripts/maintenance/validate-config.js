/**
 * Configuration Validation Script
 * Validates that the configuration is properly structured and backward compatible
 */

const config = require('../../src/shared/config');

function validateConfig() {
    console.log('🔍 Validating configuration structure...\n');
    
    const requiredSections = [
        'azure',
        'sharepoint', 
        'api',
        'webhook',
        'storage',
        'functionApp',
        'features',
        'debug',
        'logging',
        'uipath'
    ];
    
    let isValid = true;
    const errors = [];
    
    // Check required sections exist
    requiredSections.forEach(section => {
        if (!config[section]) {
            errors.push(`❌ Missing required configuration section: ${section}`);
            isValid = false;
        } else {
            console.log(`✅ Configuration section '${section}' exists`);
        }
    });
    
    // Validate existing webhook functionality config
    const existingWebhookConfig = [
        'sharepoint.primarySite.siteUrl',
        'sharepoint.lists.webhookManagement',
        'api.graph.baseUrl',
        'webhook.maxExpirationDays',
        'storage.tableName'
    ];
    
    existingWebhookConfig.forEach(path => {
        const value = getNestedValue(config, path);
        if (value === undefined || value === null) {
            errors.push(`❌ Missing or null value for existing config: ${path}`);
            isValid = false;
        } else {
            console.log(`✅ Existing config '${path}' has value`);
        }
    });
    
    // Validate UiPath configuration structure
    if (config.uipath) {
        console.log('\n🔧 Validating UiPath configuration structure...');
        
        const uipathRequiredFields = [
            'orchestratorUrl',
            'tenantName', 
            'clientId',
            'clientSecret',
            'organizationUnitId',
            'defaultQueue'
        ];
        
        uipathRequiredFields.forEach(field => {
            if (config.uipath[field] === undefined) {
                console.log(`⚠️  UiPath config field '${field}' is undefined (expected for placeholder config)`);
            } else {
                console.log(`✅ UiPath config field '${field}' is defined`);
            }
        });
        
        // Check UiPath API configuration
        if (config.uipath.api) {
            console.log('✅ UiPath API configuration exists');
        } else {
            errors.push('❌ Missing UiPath API configuration');
            isValid = false;
        }
        
        // Check UiPath features configuration
        if (config.uipath.features) {
            console.log('✅ UiPath features configuration exists');
            console.log(`   - enabled: ${config.uipath.features.enabled}`);
            console.log(`   - autoRetry: ${config.uipath.features.autoRetry}`);
            console.log(`   - enableLogging: ${config.uipath.features.enableLogging}`);
        } else {
            errors.push('❌ Missing UiPath features configuration');
            isValid = false;
        }
    }
    
    console.log('\n📊 Validation Summary:');
    if (isValid) {
        console.log('✅ Configuration is valid and backward compatible');
        console.log('✅ All existing webhook functionality should continue to work');
        console.log('✅ UiPath configuration is properly structured');
        return true;
    } else {
        console.log('❌ Configuration validation failed:');
        errors.forEach(error => console.log(error));
        return false;
    }
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
}

// Run validation
if (require.main === module) {
    const isValid = validateConfig();
    process.exit(isValid ? 0 : 1);
}

module.exports = { validateConfig };