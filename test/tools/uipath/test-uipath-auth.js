/**
 * Test utility for UiPath authentication
 * Use this to verify UiPath credentials are configured correctly
 */

const { UiPathAuth } = require('../../../src/shared/uipath-auth');
const { config } = require('../../../src/shared/config');
const { createLogger } = require('../../../src/shared/logger');

async function testAuth() {
    const mockContext = {
        log: Object.assign(console.log, {
            error: console.error,
            warn: console.warn,
            info: console.log,
            verbose: console.log,
            metric: (name, value, properties) => {
                console.log(`METRIC: ${name} = ${value}`, properties);
            }
        })
    };

    const logger = createLogger(mockContext);

    console.log('\n🔐 Testing UiPath Authentication');
    console.log('=====================================');

    // Check configuration
    console.log('\n📋 Configuration Check:');
    const requiredConfig = [
        'UIPATH_ORCHESTRATOR_URL',
        'UIPATH_TENANT_NAME',
        'UIPATH_CLIENT_ID',
        'UIPATH_CLIENT_SECRET',
        'UIPATH_ORGANIZATION_UNIT_ID'
    ];

    let configValid = true;
    requiredConfig.forEach(key => {
        const value = process.env[key] || config.uipath?.[key.replace('UIPATH_', '').toLowerCase()];
        if (value && value !== 'your-value-here') {
            console.log(`  ✅ ${key}: Configured`);
        } else {
            console.log(`  ❌ ${key}: Missing or not configured`);
            configValid = false;
        }
    });

    if (!configValid) {
        console.log('\n❌ Configuration incomplete. Please set all required environment variables.');
        console.log('   You can use the deployment script: ./scripts/deploy-uipath-config.sh');
        return;
    }

    // Test authentication
    console.log('\n🔑 Testing Authentication:');
    try {
        const auth = new UiPathAuth(mockContext);
        
        console.log('  Attempting to authenticate...');
        const startTime = Date.now();
        const token = await auth.authenticate();
        const duration = Date.now() - startTime;
        
        console.log(`  ✅ Authentication successful! (${duration}ms)`);
        console.log(`  Token preview: ${token.substring(0, 20)}...`);
        console.log(`  Token length: ${token.length} characters`);
        
        // Test token caching
        console.log('\n📦 Testing Token Cache:');
        const startTime2 = Date.now();
        const token2 = await auth.authenticate();
        const duration2 = Date.now() - startTime2;
        
        if (token === token2 && duration2 < 10) {
            console.log(`  ✅ Token caching working! (${duration2}ms)`);
        } else {
            console.log(`  ⚠️  Token caching may not be working (${duration2}ms)`);
        }
        
        // Get cache statistics
        const stats = auth.getCacheStats();
        console.log('\n📊 Cache Statistics:');
        console.log(`  Hits: ${stats.hits}`);
        console.log(`  Misses: ${stats.misses}`);
        console.log(`  Hit Rate: ${stats.hitRate}%`);
        
        // Test token refresh
        console.log('\n🔄 Testing Token Refresh:');
        console.log('  Forcing token refresh...');
        const token3 = await auth.authenticate(true);
        if (token3 !== token) {
            console.log('  ✅ Token refresh successful!');
        } else {
            console.log('  ⚠️  Token refresh may not have worked');
        }
        
        console.log('\n✅ All authentication tests passed!');
        
        // Display configuration summary
        console.log('\n🔧 Active Configuration:');
        console.log(`  Orchestrator URL: ${auth.orchestratorUrl}`);
        console.log(`  Tenant: ${auth.tenantName}`);
        console.log(`  Organization Unit: ${auth.organizationUnitId}`);
        console.log(`  Client ID: ${auth.clientId.substring(0, 8)}...`);
        
    } catch (error) {
        console.error('\n❌ Authentication failed:', error.message);
        
        if (error.response) {
            console.error('\nError details:');
            console.error('  Status:', error.response.status);
            console.error('  Data:', error.response.data);
        }
        
        console.log('\n🔍 Troubleshooting tips:');
        console.log('  1. Verify your UiPath Orchestrator URL is correct');
        console.log('  2. Check that your Client ID and Secret are valid');
        console.log('  3. Ensure your tenant name is correct');
        console.log('  4. Verify the Organization Unit ID exists');
        console.log('  5. Check that the application has the necessary permissions in UiPath');
    }
}

// Run if executed directly
if (require.main === module) {
    testAuth().then(() => {
        console.log('\n✅ Test complete!');
    }).catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testAuth };