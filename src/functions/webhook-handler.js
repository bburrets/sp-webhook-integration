const { app } = require('@azure/functions');


// Webhook endpoint to handle Microsoft Graph notifications
app.http('webhook-handler', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Webhook request received:', request.method);
        context.log('Query parameters:', request.query);
        context.log('Headers:', request.headers);

        try {
            // Check for validation token in query string (works for both GET and POST)
            const validationToken = request.query.get('validationToken');
            
            if (validationToken) {
                context.log('Validation token found:', validationToken);
                context.log('Request method for validation:', request.method);
                
                // Microsoft Graph requires exact 200 status and plain text response
                return {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/plain',
                        'Cache-Control': 'no-cache'
                    },
                    body: validationToken
                };
            }

            if (request.method === 'GET') {
                return {
                    status: 400,
                    headers: {
                        'Content-Type': 'text/plain'
                    },
                    body: 'Missing validation token'
                };
            }

            if (request.method === 'POST') {
                // Handle webhook notifications
                const requestBody = await request.text();
                context.log('Webhook notification body:', requestBody);
                
                let notifications;
                try {
                    notifications = JSON.parse(requestBody);
                } catch (parseError) {
                    context.log.error('Failed to parse request body:', parseError);
                    return {
                        status: 400,
                        body: 'Invalid JSON in request body'
                    };
                }

                // Process each notification
                if (notifications.value && Array.isArray(notifications.value)) {
                    for (const notification of notifications.value) {
                        await processNotification(notification, context);
                    }
                    
                    return {
                        status: 200,
                        body: 'Notifications processed successfully'
                    };
                } else {
                    context.log.error('Invalid notification format:', notifications);
                    return {
                        status: 400,
                        body: 'Invalid notification format'
                    };
                }
            }

            return {
                status: 405,
                body: 'Method not allowed'
            };

        } catch (error) {
            context.log.error('Error processing webhook:', error);
            return {
                status: 500,
                body: 'Internal server error'
            };
        }
    }
});

async function processNotification(notification, context) {
    try {
        context.log('Processing notification:', {
            subscriptionId: notification.subscriptionId,
            resource: notification.resource,
            changeType: notification.changeType,
            clientState: notification.clientState
        });

        // Extract information from the notification
        const subscriptionId = notification.subscriptionId;
        const resource = notification.resource;
        const changeType = notification.changeType;
        const resourceData = notification.resourceData;

        // Log the change details
        context.log('SharePoint change detected:', {
            changeType: changeType,
            resource: resource,
            resourceId: resourceData?.id,
            webId: resourceData?.webId,
            listId: resourceData?.listId
        });

        // Here you can add your business logic to handle the changes
        // For example:
        // - Send notifications
        // - Trigger workflows
        // - Update databases
        // - Call other APIs

        context.log('Notification processed successfully');

    } catch (error) {
        context.log.error('Error processing individual notification:', error);
        throw error;
    }
}