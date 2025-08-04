const { app } = require('@azure/functions');

// Simple webhook notification logger
app.http('webhook-notification-log', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        // This would normally connect to a database or storage
        // For now, we'll return a simple message
        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Webhook notification logging endpoint',
                info: 'Notifications are being received and processed by webhook-handler',
                testListWebhook: {
                    id: 'e0ce4684-4a2e-4422-a6ff-d989fa3fe821',
                    resource: 'testList (30516097-c58c-478c-b87f-76c8f6ce2b56)',
                    status: 'Active - Receiving notifications'
                }
            })
        };
    }
});