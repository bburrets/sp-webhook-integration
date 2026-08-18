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

    describe('failure propagation', () => {
        it('throws when UiPath dispatch failed so the queue retries', async () => {
            processNotification.mockResolvedValueOnce({
                subscriptionId: 'sub-1',
                uipath: { attempted: true, success: false, error: 'Queue does not exist' }
            });

            await expect(
                handleQueueMessage(JSON.stringify({ subscriptionId: 'sub-1' }), context)
            ).rejects.toThrow('Queue does not exist');
        });

        it('does not throw when UiPath dispatch succeeded', async () => {
            processNotification.mockResolvedValueOnce({
                subscriptionId: 'sub-2',
                uipath: { attempted: true, success: true, error: null }
            });

            await expect(
                handleQueueMessage(JSON.stringify({ subscriptionId: 'sub-2' }), context)
            ).resolves.toBeUndefined();
        });

        it('does not throw when UiPath was never attempted', async () => {
            processNotification.mockResolvedValueOnce({
                subscriptionId: 'sub-3',
                uipath: { attempted: false, success: false, error: null }
            });

            await expect(
                handleQueueMessage(JSON.stringify({ subscriptionId: 'sub-3' }), context)
            ).resolves.toBeUndefined();
        });

        it('requests throwing enrichment so a Graph failure retries', async () => {
            processNotification.mockResolvedValueOnce({
                subscriptionId: 'sub-4',
                uipath: { attempted: false, success: false, error: null }
            });

            await handleQueueMessage(JSON.stringify({ subscriptionId: 'sub-4' }), context);

            expect(enrichNotificationsWithClientState).toHaveBeenCalledWith(
                expect.any(Array),
                context,
                { throwOnFailure: true }
            );
        });
    });
});
