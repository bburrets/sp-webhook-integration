/**
 * UiPath Integration Test Function
 * Test function for UiPath dispatcher integration - useful for development and debugging
 */

const { app } = require('@azure/functions');
const { wrapHandler, validationError } = require('../shared/error-handler');
const { createLogger } = require('../shared/logger');
const { createUiPathAuth } = require('../shared/uipath-auth');
const { createUiPathQueueClient } = require('../shared/uipath-queue-client');
const { createCostcoProcessor } = require('../templates/costco-inline-routing');
const { processUiPathNotification, createTestNotification } = require('./uipath-dispatcher');
const config = require('../shared/config');

// UiPath Test Function
app.http('uipath-test', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: wrapHandler(async (request, context) => {
        const logger = createLogger(context);
        const startTime = Date.now();
        
        logger.logRequest(request.method, request.url, {
            headers: Object.fromEntries(request.headers.entries()),
            service: 'uipath-test'
        });

        const testType = request.query.get('test') || 'auth';
        const results = {};

        try {
            // Test 1: Authentication
            if (testType === 'auth' || testType === 'all') {
                logger.info('Testing UiPath authentication', { service: 'uipath-test' });
                results.authentication = await testAuthentication(context);
            }

            // Test 2: Queue submission
            if (testType === 'queue' || testType === 'all') {
                logger.info('Testing UiPath queue submission', { service: 'uipath-test' });
                results.queueSubmission = await testQueueSubmission(context);
            }

            // Test 3: COSTCO template processing
            if (testType === 'costco' || testType === 'all') {
                logger.info('Testing COSTCO template processing', { service: 'uipath-test' });
                results.costcoProcessing = await testCostcoProcessing(context);
            }

            // Test 4: Full dispatcher workflow
            if (testType === 'dispatcher' || testType === 'all') {
                logger.info('Testing UiPath dispatcher workflow', { service: 'uipath-test' });
                results.dispatcherWorkflow = await testDispatcherWorkflow(context);
            }

            // Test 5: Configuration validation
            if (testType === 'config' || testType === 'all') {
                logger.info('Testing UiPath configuration', { service: 'uipath-test' });
                results.configuration = testConfiguration();
            }

            const duration = Date.now() - startTime;
            
            logger.logResponse(200, duration, {
                testType,
                resultsCount: Object.keys(results).length,
                service: 'uipath-test'
            });
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    testType,
                    timestamp: new Date().toISOString(),
                    duration,
                    results,
                    summary: generateTestSummary(results)
                }, null, 2)
            };

        } catch (error) {
            logger.error('UiPath test failed', {
                testType,
                error: error.message,
                service: 'uipath-test'
            });

            return {
                status: 500,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    testType,
                    timestamp: new Date().toISOString(),
                    error: error.message,
                    results
                }, null, 2)
            };
        }
    })
});

/**
 * Test UiPath authentication
 * @param {Object} context - Azure Functions context
 * @returns {Promise<Object>} Test result
 */
async function testAuthentication(context) {
    const logger = createLogger(context);
    
    try {
        const auth = createUiPathAuth(context);
        
        const startTime = Date.now();
        const token = await auth.authenticate();
        const duration = Date.now() - startTime;
        
        // Test token cache
        const cachedToken = auth.getCachedToken();
        const cacheStats = auth.getCacheStats();
        
        logger.info('UiPath authentication test completed', {
            duration,
            tokenLength: token?.length,
            hasCachedToken: !!cachedToken,
            cacheStats,
            service: 'uipath-test'
        });

        return {
            success: true,
            duration,
            tokenReceived: !!token,
            tokenLength: token?.length,
            cacheWorking: cachedToken === token,
            cacheStats
        };

    } catch (error) {
        logger.error('UiPath authentication test failed', {
            error: error.message,
            service: 'uipath-test'
        });

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Test UiPath queue submission
 * @param {Object} context - Azure Functions context
 * @returns {Promise<Object>} Test result
 */
async function testQueueSubmission(context) {
    const logger = createLogger(context);
    
    try {
        const queueClient = createUiPathQueueClient(context);
        
        // Create test data
        const testData = {
            priority: 'Normal',
            reference: `TEST_${Date.now()}`,
            specificContent: {
                TestField: 'TestValue',
                ProcessType: 'TEST_PROCESS',
                TriggerSource: 'UiPath_Test_Function',
                ProcessedAt: new Date().toISOString(),
                SharePointItemId: 'test-123',
                TestMessage: 'This is a test queue item from the UiPath integration test'
            }
        };

        const startTime = Date.now();
        const result = await queueClient.submitQueueItem(
            config.uipath.defaultQueue || 'Test-Queue',
            testData
        );
        const duration = Date.now() - startTime;

        logger.info('UiPath queue submission test completed', {
            duration,
            queueItemId: result.queueItemId,
            success: result.success,
            service: 'uipath-test'
        });

        return {
            success: result.success,
            duration,
            queueItemId: result.queueItemId,
            queueName: result.queueName,
            status: result.status,
            reference: result.reference
        };

    } catch (error) {
        logger.error('UiPath queue submission test failed', {
            error: error.message,
            service: 'uipath-test'
        });

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Test COSTCO template processing
 * @param {Object} context - Azure Functions context
 * @returns {Promise<Object>} Test result
 */
async function testCostcoProcessing(context) {
    const logger = createLogger(context);
    
    try {
        const costcoProcessor = createCostcoProcessor(context);
        
        // Create test COSTCO item
        const testItem = {
            ID: 'test-123',
            Title: 'Test COSTCO Item',
            Status: 'Send Generated Form',
            'Ship_x0020_To_x0020_Email': 'test@example.com',
            'Ship_x0020_Date': new Date().toISOString(),
            'Style': 'TEST-STYLE-001',
            'PO_x005f_no': 'TEST-PO-12345',
            'Generated_x0020_Routing_x0020_Form_x0020_URL': 'https://example.com/form.pdf',
            Created: new Date().toISOString(),
            Modified: new Date().toISOString(),
            Author: { Title: 'Test User' },
            Editor: { Title: 'Test User' }
        };

        const startTime = Date.now();
        
        // Test validation
        const shouldProcess = costcoProcessor.shouldProcessItem(testItem);
        costcoProcessor.validateRequiredFields(testItem);
        const transformedData = costcoProcessor.transformItemData(testItem);
        
        // Test full processing (will submit to queue if enabled)
        const processingResult = await costcoProcessor.processItem(testItem);
        
        const duration = Date.now() - startTime;

        logger.info('COSTCO template processing test completed', {
            duration,
            shouldProcess,
            processed: processingResult.processed,
            transformedFields: Object.keys(transformedData),
            service: 'uipath-test'
        });

        return {
            success: true,
            duration,
            shouldProcess,
            validationPassed: true,
            transformedFieldCount: Object.keys(transformedData).length,
            processingResult
        };

    } catch (error) {
        logger.error('COSTCO template processing test failed', {
            error: error.message,
            service: 'uipath-test'
        });

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Test full UiPath dispatcher workflow
 * @param {Object} context - Azure Functions context
 * @returns {Promise<Object>} Test result
 */
async function testDispatcherWorkflow(context) {
    const logger = createLogger(context);
    
    try {
        // Create test notification
        const testNotification = await createTestNotification(context, {
            subscriptionId: 'test-subscription-uipath',
            clientState: 'processor:uipath',
            changeType: 'updated',
            resource: '/sites/test-site/lists/test-list/items/123'
        });

        logger.info('UiPath dispatcher workflow test completed', {
            processed: testNotification.processed,
            service: 'uipath-test'
        });

        return {
            success: true,
            testNotificationResult: testNotification
        };

    } catch (error) {
        logger.error('UiPath dispatcher workflow test failed', {
            error: error.message,
            service: 'uipath-test'
        });

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Test UiPath configuration
 * @returns {Object} Configuration test result
 */
function testConfiguration() {
    const requiredConfig = [
        'uipath.orchestratorUrl',
        'uipath.tenantName',
        'uipath.clientId',
        'uipath.clientSecret'
    ];

    const missingConfig = [];
    const presentConfig = [];

    for (const configPath of requiredConfig) {
        const value = getConfigValue(config, configPath);
        if (value) {
            presentConfig.push(configPath);
        } else {
            missingConfig.push(configPath);
        }
    }

    return {
        success: missingConfig.length === 0,
        enabled: config.uipath.features.enabled,
        presentConfig,
        missingConfig,
        totalRequired: requiredConfig.length,
        configuredCount: presentConfig.length
    };
}

/**
 * Get nested configuration value
 * @param {Object} obj - Configuration object
 * @param {string} path - Dot-separated path
 * @returns {*} Configuration value
 */
function getConfigValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Generate test summary
 * @param {Object} results - Test results
 * @returns {Object} Test summary
 */
function generateTestSummary(results) {
    const tests = Object.keys(results);
    const passedTests = tests.filter(test => results[test].success);
    const failedTests = tests.filter(test => !results[test].success);

    return {
        totalTests: tests.length,
        passedCount: passedTests.length,
        failedCount: failedTests.length,
        passedTests,
        failedTests,
        overallSuccess: failedTests.length === 0
    };
}

module.exports = {
    testAuthentication,
    testQueueSubmission,
    testCostcoProcessing,
    testDispatcherWorkflow,
    testConfiguration,
    generateTestSummary
};