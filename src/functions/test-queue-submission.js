/**
 * Test function to verify UiPath queue submission
 */

const { app } = require('@azure/functions');
const { createUiPathQueueClient } = require('../shared/uipath-queue-client');
const { createLogger } = require('../shared/logger');

app.http('test-queue-submission', {
    methods: ['GET', 'POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        const logger = createLogger(context);
        
        try {
            logger.info('Testing UiPath queue submission');
            
            const queueClient = createUiPathQueueClient(context);
            
            const testData = {
                specificContent: {
                    TestField: 'Test Value',
                    Timestamp: new Date().toISOString(),
                    Source: 'Direct Test'
                },
                priority: 'Low',
                reference: `TEST_DIRECT_${Date.now()}`
            };
            
            logger.info('Submitting test item to TEST_API queue', testData);
            
            const result = await queueClient.submitQueueItem('TEST_API', testData);
            
            logger.info('Successfully submitted test item', result);
            
            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    result: result,
                    message: 'Test item submitted successfully to UiPath queue'
                })
            };
            
        } catch (error) {
            logger.error('Test failed', {
                error: error.message,
                stack: error.stack
            });
            
            return {
                status: 500,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: error.message,
                    details: error.response?.data
                })
            };
        }
    }
});