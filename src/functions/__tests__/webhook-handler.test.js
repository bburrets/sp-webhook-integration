// The real src/shared/constants.js uses `export const` syntax that Jest's default
// (unconfigured) transform cannot parse — it only works at runtime because Node
// auto-detects ES module syntax. Every existing test that transitively requires
// this module mocks it directly (see uipath-dispatcher-dynamic.test.js); mirror
// that established workaround here with the real values from constants.js.
jest.mock('../../shared/constants', () => ({
    HTTP_STATUS: {
        OK: 200,
        ACCEPTED: 202,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        METHOD_NOT_ALLOWED: 405,
        REQUEST_TIMEOUT: 408,
        INTERNAL_SERVER_ERROR: 500,
        SERVICE_UNAVAILABLE: 503
    },
    HTTP_HEADERS: {
        CONTENT_TYPE: 'Content-Type',
        AUTHORIZATION: 'Authorization',
        ACCEPT: 'application/json',
        CONTENT_TYPE_JSON: 'application/json',
        CONTENT_TYPE_TEXT: 'text/plain',
        CACHE_CONTROL: 'Cache-Control',
        NO_CACHE: 'no-cache',
        WEBHOOK_PROXY_HEADER: 'X-SharePoint-Webhook-Proxy',
        SUBSCRIPTION_ID_HEADER: 'X-Original-Subscription-Id',
        UIPATH_ORG_HEADER: 'X-UIPATH-OrganizationUnitId'
    },
    CLIENT_STATE_PATTERNS: {
        FORWARD_PREFIX: 'forward:',
        UIPATH_PROCESSOR: 'processor:uipath',
        UIPATH_ENABLED: 'uipath:enabled',
        UIPATH_QUEUE: 'uipath:',
        COSTCO_ROUTING: 'costco:routing',
        COSTCO_PROCESSOR: 'processor:costco'
    },
    ERROR_MESSAGES: {
        METHOD_NOT_ALLOWED: 'Method not allowed',
        MISSING_VALIDATION_TOKEN: 'Missing validation token'
    },
    SUCCESS_MESSAGES: {
        NOTIFICATION_PROCESSED: 'Notifications processed successfully'
    }
}));

// Capture registrations so the registered handler can be exercised directly.
jest.mock('@azure/functions', () => {
    const registered = {};
    return {
        __registered: registered,
        app: {
            http: jest.fn((name, options) => { registered[name] = options; }),
            storageQueue: jest.fn()
        },
        output: { storageQueue: jest.fn(() => ({ type: 'queue' })) }
    };
});

// webhook-handler.js pulls in uipath-dispatcher-dynamic.js, which (per the Task 1
// convention) keeps the real ../shared/uipath-processor-registry, but the template
// modules it delegates to have side effects (real queue submissions) and read from
// COSTCO_CONFIG_CONSTANTS at require time, so they're mocked here exactly as in
// uipath-dispatcher-dynamic.test.js.
jest.mock('../../templates/costco-inline-routing', () => ({
    createCostcoProcessor: jest.fn(() => ({
        processItem: jest.fn(async () => ({
            processed: true,
            queueSubmission: { success: true, queueItemId: 'queue-123', reference: 'SPDOC_TEST_123' }
        }))
    }))
}));

jest.mock('../../templates/generic-document-processor', () => ({
    createGenericDocumentProcessor: jest.fn(() => ({
        processItem: jest.fn(async () => ({
            processed: true,
            queueSubmission: { success: true, queueItemId: 'queue-456', reference: 'SPDOC_TEST_456' }
        }))
    }))
}));

jest.mock('../../shared/processing-deduplicator', () => ({
    createDeduplicator: jest.fn(() => ({
        filterDuplicates: jest.fn(async (resource, items) => ({
            toProcess: items,
            skipped: []
        })),
        recordProcessed: jest.fn(async () => undefined)
    }))
}));

jest.mock('../../shared/uipath-environment-config', () => ({
    getEnvironmentConfig: jest.fn(() => ({
        tenantName: 'FAMBrands_RPAOPS',
        organizationUnitId: '277500',
        environment: 'DEV'
    }))
}));

jest.mock('../uipath-dispatcher', () => ({
    shouldProcessForUiPath: jest.fn((clientState) =>
        clientState && (clientState.includes('processor:uipath') || clientState.includes('destination:uipath'))
    ),
    fetchSharePointItem: jest.fn(() => Promise.resolve({
        ID: '123',
        Title: 'Test Item',
        Status: 'Active',
        FileLeafRef: 'test-document.pdf'
    }))
}));

jest.mock('../../shared/auth', () => ({
    getAccessToken: jest.fn(() => Promise.resolve('mock-access-token'))
}));

// processNotification fires updateNotificationCount() without awaiting it. Left unmocked,
// axios would make a real Graph call that outlives the test.
jest.mock('axios', () => ({
    get: jest.fn(() => Promise.resolve({ data: { value: [] } })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {}, status: 200 }))
}));

const { buildQueueMessages, processNotification } = require('../webhook-handler');

describe('webhook-handler', () => {
    describe('buildQueueMessages', () => {
        it('produces one JSON message per notification, stamped with receivedAt', () => {
            const notifications = [
                { subscriptionId: 'sub-1', resource: 'sites/a/lists/b', changeType: 'updated' },
                { subscriptionId: 'sub-2', resource: 'sites/c/lists/d', changeType: 'updated' }
            ];

            const messages = buildQueueMessages(notifications, '2026-08-18T00:00:00.000Z');

            expect(messages).toHaveLength(2);
            expect(JSON.parse(messages[0])).toEqual({
                subscriptionId: 'sub-1',
                resource: 'sites/a/lists/b',
                changeType: 'updated',
                receivedAt: '2026-08-18T00:00:00.000Z'
            });
            expect(JSON.parse(messages[1]).subscriptionId).toBe('sub-2');
        });

        it('returns an empty array for no notifications', () => {
            expect(buildQueueMessages([], '2026-08-18T00:00:00.000Z')).toEqual([]);
        });
    });

    describe('registered HTTP handler', () => {
        const getHandler = () =>
            require('@azure/functions').__registered['webhook-handler'].handler;

        const makeContext = () => ({
            invocationId: 'test-invocation',
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            extraOutputs: { set: jest.fn() }
        });

        const makeRequest = ({ method = 'GET', query = {}, body = '' } = {}) => ({
            method,
            url: 'https://example.com/api/webhook-handler',
            query: new URLSearchParams(query),
            headers: new Map(),
            text: jest.fn().mockResolvedValue(body)
        });

        afterEach(() => {
            delete process.env.ASYNC_PROCESSING;
        });

        it('echoes the validationToken as plain text with status 200', async () => {
            const context = makeContext();
            const request = makeRequest({ query: { validationToken: 'abc123' } });

            const response = await getHandler()(request, context);

            expect(response.status).toBe(200);
            expect(response.body).toBe('abc123');
            expect(response.headers['Content-Type']).toMatch(/text\/plain/);
        });

        it('enqueues and returns 202 when ASYNC_PROCESSING is enabled', async () => {
            process.env.ASYNC_PROCESSING = 'true';
            const context = makeContext();
            const request = makeRequest({
                method: 'POST',
                body: JSON.stringify({
                    value: [{
                        subscriptionId: 'sub-1',
                        resource: 'sites/a/lists/b',
                        changeType: 'updated',
                        clientState: ''
                    }]
                })
            });

            const response = await getHandler()(request, context);

            expect(response.status).toBe(202);
            expect(context.extraOutputs.set).toHaveBeenCalledTimes(1);
            const [, messages] = context.extraOutputs.set.mock.calls[0];
            expect(messages).toHaveLength(1);
            expect(JSON.parse(messages[0]).subscriptionId).toBe('sub-1');
        });
    });
    // These tests deliberately exercise the REAL processNotification -> routeToUiPathDispatcher
    // -> uipath-dispatcher-dynamic.processNotification chain. The worker tests mock
    // processNotification wholesale, which is exactly why the hardcoded `success: true` in
    // routeToUiPathDispatcher survived review: the dispatcher swallows every error and reports
    // it via a returned `error` field rather than throwing, so a failed UiPath submission was
    // being reported up the chain as a success.
    describe('processNotification -> UiPath dispatch outcome', () => {
        const makeContext = () => ({
            invocationId: 'test-invocation',
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        });

        beforeEach(() => {
            // clearAllMocks only — resetAllMocks would wipe the module-factory implementations
            // above (processItem stubs, fetchSharePointItem) and break every other suite.
            jest.clearAllMocks();
        });

        it('reports success: false when the processor throws, so the worker can retry', async () => {
            const { createCostcoProcessor } = require('../../templates/costco-inline-routing');
            createCostcoProcessor.mockImplementationOnce(() => ({
                // Reject inside processItem (not at factory time): the factory call sits
                // OUTSIDE the dispatcher's inner try, so a factory throw would escape to
                // routeToUiPathDispatcher's own catch and return success:false even on the
                // unfixed code, making this test vacuous.
                processItem: jest.fn().mockRejectedValue(new Error('UiPath queue submission failed: 500'))
            }));

            const result = await processNotification({
                subscriptionId: 'sub-fail',
                resource: 'sites/example.sharepoint.com:/sites/costco:/lists/123',
                changeType: 'updated',
                clientState: 'processor:uipath;costco:routing',
                resourceData: { '@odata.type': '#Microsoft.Graph.ListItem', id: '15' }
            }, makeContext());

            expect(result.uipath.attempted).toBe(true);
            expect(result.uipath.success).toBe(false);
            expect(result.uipath.error).toBe('UiPath queue submission failed: 500');
        });

        it('reports success: false when the processor returns { processed: false, error }', async () => {
            // costco-inline-routing.js processItem catches its own errors and RETURNS the
            // error rather than throwing, so this is the shape production actually produces.
            const { createCostcoProcessor } = require('../../templates/costco-inline-routing');
            createCostcoProcessor.mockImplementationOnce(() => ({
                processItem: jest.fn(async () => ({
                    processed: false,
                    error: 'Request failed with status code 401',
                    itemId: '15',
                    template: 'costco'
                }))
            }));

            const result = await processNotification({
                subscriptionId: 'sub-returned-error',
                resource: 'sites/example.sharepoint.com:/sites/costco:/lists/123',
                changeType: 'updated',
                clientState: 'processor:uipath;costco:routing',
                resourceData: { '@odata.type': '#Microsoft.Graph.ListItem', id: '15' }
            }, makeContext());

            expect(result.uipath.attempted).toBe(true);
            expect(result.uipath.success).toBe(false);
            expect(result.uipath.error).toBe('Request failed with status code 401');
        });

        it('keeps success: true for a legitimate non-failure that returns processed: false', async () => {
            // No processor matches (no costco/documents/drives token or resource segment), so
            // the dispatcher returns { processed: false, reason } with NO error. That must not
            // be treated as a failure, or the queue would retry and poison healthy traffic.
            const result = await processNotification({
                subscriptionId: 'sub-no-processor',
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                changeType: 'updated',
                clientState: 'processor:uipath;unknown:config',
                resourceData: { '@odata.type': '#Microsoft.Graph.ListItem', id: '99' }
            }, makeContext());

            expect(result.uipath.attempted).toBe(true);
            expect(result.uipath.success).toBe(true);
            expect(result.uipath.error).toBeNull();
        });

        it('reports success: true on a normal successful dispatch', async () => {
            const result = await processNotification({
                subscriptionId: 'sub-ok',
                resource: 'sites/example.sharepoint.com:/sites/costco:/lists/123',
                changeType: 'updated',
                clientState: 'processor:uipath;costco:routing',
                resourceData: { '@odata.type': '#Microsoft.Graph.ListItem', id: '15' }
            }, makeContext());

            expect(result.uipath.attempted).toBe(true);
            expect(result.uipath.success).toBe(true);
            expect(result.uipath.error).toBeNull();
        });
    });
});
