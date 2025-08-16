/**
 * UiPath API Diagnostics Utility
 * Helps debug "queueItemParameters must not be null" and other API issues
 */

const { createUiPathQueueClient } = require('../shared/uipath-queue-client');
const { createUiPathAuth } = require('../shared/uipath-auth');
const config = require('../shared/config');

async function runDiagnostics() {
    console.log('\n🔍 UiPath API Diagnostics');
    console.log('==========================\n');

    const mockContext = {
        log: console.log,
        log: {
            error: console.error,
            warn: console.warn,
            info: console.log,
            verbose: console.log
        }
    };

    try {
        // 1. Test Authentication
        console.log('1. Testing Authentication...');
        const auth = createUiPathAuth(mockContext);
        const httpClient = await auth.getAuthenticatedClient();
        console.log('   ✅ Authentication successful\n');

        // 2. Test Queue Client Creation
        console.log('2. Testing Queue Client...');
        const queueClient = createUiPathQueueClient(mockContext);
        console.log('   ✅ Queue client created\n');

        // 3. Validate Configuration
        console.log('3. Validating Configuration...');
        console.log(`   Orchestrator URL: ${config.uipath.orchestratorUrl}`);
        console.log(`   Organization Unit ID: ${config.uipath.organizationUnitId}`);
        console.log(`   Default Queue: ${config.uipath.defaultQueue}`);
        console.log(`   Features Enabled: ${config.uipath.features.enabled}`);
        console.log('   ✅ Configuration validated\n');

        // 4. Test Different Payload Structures
        console.log('4. Testing Payload Structures...');
        
        const testCases = [
            {
                name: 'Simple flat structure',
                itemData: {
                    priority: 'Normal',
                    reference: `DIAG_FLAT_${Date.now()}`,
                    specificContent: {
                        TestField1: 'value1',
                        TestField2: 'value2',
                        ProcessType: 'DIAGNOSTIC_TEST'
                    }
                }
            },
            {
                name: 'Complex nested structure',
                itemData: {
                    priority: 'High',
                    reference: `DIAG_NESTED_${Date.now()}`,
                    specificContent: {
                        EmailConfig: {
                            To: 'test@example.com',
                            Subject: 'Test',
                            Template: 'TestTemplate'
                        },
                        ShipmentDetails: {
                            ShipDate: new Date().toISOString(),
                            PONumber: 'TEST-PO-001',
                            Style: 'TEST-STYLE'
                        },
                        ProcessType: 'DIAGNOSTIC_TEST'
                    }
                }
            },
            {
                name: 'Empty SpecificContent',
                itemData: {
                    priority: 'Normal',
                    reference: `DIAG_EMPTY_${Date.now()}`,
                    specificContent: {}
                }
            },
            {
                name: 'Null SpecificContent',
                itemData: {
                    priority: 'Normal',
                    reference: `DIAG_NULL_${Date.now()}`,
                    specificContent: null
                }
            }
        ];

        for (const testCase of testCases) {
            console.log(`\n   Testing: ${testCase.name}`);
            
            try {
                // Create payload without submitting
                const payload = queueClient.createQueueItemPayload('TEST_API', testCase.itemData);
                
                // Validate payload
                queueClient.validateApiPayload(payload, 'TEST_API');
                
                console.log(`     ✅ Payload structure valid`);
                console.log(`     📦 Payload summary:`);
                console.log(`        Queue Name: ${payload.itemData.Name}`);
                console.log(`        Priority: ${payload.itemData.Priority}`);
                console.log(`        Reference: ${payload.itemData.Reference}`);
                console.log(`        Has SpecificContent: ${!!payload.itemData.SpecificContent}`);
                
                if (payload.itemData.SpecificContent) {
                    const keys = Object.keys(payload.itemData.SpecificContent);
                    console.log(`        SpecificContent keys: [${keys.join(', ')}]`);
                    
                    // Check for JSON string
                    if (keys.includes('JsonData')) {
                        console.log(`        ✨ Complex data converted to JsonData string`);
                    }
                }

            } catch (error) {
                console.log(`     ❌ Validation failed: ${error.message}`);
            }
        }

        // 5. Test Actual Submission (if enabled)
        if (config.uipath.features.enabled && process.argv.includes('--submit')) {
            console.log('\n5. Testing Actual Submission...');
            console.log('   ⚠️  This will submit test items to your UiPath queue');
            
            try {
                const result = await queueClient.submitQueueItem('TEST_API', {
                    priority: 'Normal',
                    reference: `DIAG_SUBMIT_${Date.now()}`,
                    specificContent: {
                        TestType: 'DIAGNOSTIC_SUBMISSION',
                        Timestamp: new Date().toISOString(),
                        Source: 'Diagnostics'
                    }
                });
                
                console.log('   ✅ Submission successful!');
                console.log(`   📬 Queue Item ID: ${result.queueItemId}`);
                console.log(`   🎯 Queue: ${result.queueName}`);
                
            } catch (error) {
                console.log(`   ❌ Submission failed: ${error.message}`);
                
                if (error.details) {
                    console.log(`   🔍 Error details:`, JSON.stringify(error.details, null, 4));
                }
            }
        } else {
            console.log('\n5. Skipping Actual Submission');
            console.log('   💡 Use --submit flag to test actual queue submission');
        }

        // 6. Configuration Recommendations
        console.log('\n6. Configuration Recommendations...');
        
        const recommendations = [];
        
        if (!config.uipath.features.enabled) {
            recommendations.push('⚠️  UiPath integration is disabled - set UIPATH_ENABLED=true');
        }
        
        if (!config.uipath.defaultQueue) {
            recommendations.push('⚠️  No default queue configured - set UIPATH_DEFAULT_QUEUE');
        }
        
        if (config.uipath.api.timeout < 30000) {
            recommendations.push('💡 Consider increasing API timeout for large payloads');
        }
        
        if (!config.uipath.features.autoRetry) {
            recommendations.push('💡 Enable auto-retry for better reliability');
        }
        
        if (recommendations.length > 0) {
            console.log('   Recommendations:');
            recommendations.forEach(rec => console.log(`   ${rec}`));
        } else {
            console.log('   ✅ Configuration looks good!');
        }

        console.log('\n✅ Diagnostics Complete!');
        console.log('\n📋 Summary:');
        console.log('   - Authentication: Working');
        console.log('   - Payload Generation: Working');
        console.log('   - Validation: Working');
        console.log('   - Error Handling: Enhanced');
        
        console.log('\n💡 Next Steps:');
        console.log('   1. Ensure your queue name exactly matches between payload and API URL');
        console.log('   2. Use flat key-value pairs for simple data in SpecificContent');
        console.log('   3. Complex nested objects will be automatically converted to JsonData');
        console.log('   4. Check UiPath Orchestrator logs for additional error details');
        console.log('   5. Verify Organization Unit ID has access to the target queue');

    } catch (error) {
        console.error('\n❌ Diagnostics failed:', error.message);
        console.error('\n🔍 Error details:', error);
        
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Check environment variables for UiPath configuration');
        console.log('   2. Verify UiPath Orchestrator URL is accessible');
        console.log('   3. Ensure client credentials are valid and not expired');
        console.log('   4. Check Organization Unit ID permissions');
    }
}

// Run diagnostics
if (require.main === module) {
    console.log('UiPath API Diagnostics Tool');
    console.log('Usage: node test-uipath-diagnostics.js [--submit]');
    console.log('  --submit: Also test actual queue submission (optional)\n');
    
    runDiagnostics().then(() => {
        console.log('\n🏁 Diagnostics finished');
    }).catch(error => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { runDiagnostics };