jest.mock('@azure/functions', () => ({
    app: { http: jest.fn(), storageQueue: jest.fn() },
    output: { storageQueue: jest.fn(() => ({ type: 'queue' })) }
}));

jest.mock('../webhook-handler', () => ({
    processNotification: jest.fn(() => Promise.resolve()),
    enrichNotificationsWithClientState: jest.fn(notifications =>
        Promise.resolve(notifications.map(n => ({ ...n, clientState: 'enriched' })))
    )
}));

const { handleQueueMessage } = require('../notification-worker');
const { processNotification, enrichNotificationsWithClientState } = require('../webhook-handler');

describe('notification-worker', () => {
    const context = { invocationId: 'test', log: jest.fn(), error: jest.fn(), warn: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('enriches then processes a JSON string message', async () => {
        const message = JSON.stringify({ subscriptionId: 'sub-1', resource: 'sites/a/lists/b' });

        await handleQueueMessage(message, context);

        expect(enrichNotificationsWithClientState).toHaveBeenCalledTimes(1);
        expect(processNotification).toHaveBeenCalledTimes(1);
        expect(processNotification.mock.calls[0][0].clientState).toBe('enriched');
    });

    it('accepts an already-parsed object message', async () => {
        await handleQueueMessage({ subscriptionId: 'sub-2', resource: 'sites/c/lists/d' }, context);

        expect(processNotification).toHaveBeenCalledTimes(1);
        expect(processNotification.mock.calls[0][0].subscriptionId).toBe('sub-2');
    });

    it('rethrows so the queue retries the message', async () => {
        processNotification.mockRejectedValueOnce(new Error('UiPath submission failed'));

        await expect(
            handleQueueMessage(JSON.stringify({ subscriptionId: 'sub-3' }), context)
        ).rejects.toThrow('UiPath submission failed');
    });
});
