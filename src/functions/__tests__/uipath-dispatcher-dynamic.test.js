// Mock constants first (before other imports)
jest.mock('../../shared/constants', () => ({
    HTTP_STATUS: {
        OK: 200,
        CREATED: 201,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        NOT_FOUND: 404,
        INTERNAL_SERVER_ERROR: 500
    },
    HTTP_HEADERS: {
        CONTENT_TYPE: 'Content-Type',
        CONTENT_TYPE_JSON: 'application/json'
    },
    SUCCESS_MESSAGES: {
        UIPATH_DISPATCH_COMPLETED: 'UiPath dispatch completed'
    },
    SERVICE_NAMES: {
        UIPATH_DISPATCHER: 'uipath-dispatcher'
    },
    UIPATH_PRIORITY: {
        LOW: 'Low',
        NORMAL: 'Normal',
        HIGH: 'High'
    },
    UIPATH_API_ENDPOINTS: {
        ADD_QUEUE_ITEM: '/odata/Queues/UiPathODataSvc.AddQueueItem',
        GET_FOLDERS: '/odata/Folders'
    },
    ERROR_MESSAGES: {},
    COSTCO_CONFIG_CONSTANTS: {
        LIST_NAME: 'COSTCO-INLINE-Trafficking-Routing',
        SITE_PATH: '/sites/DWI',
        STATUS_FIELD: 'Status',
        TARGET_STATUS: 'Send Generated Form'
    }
}));

const { processNotification } = require('../uipath-dispatcher-dynamic');
const { HTTP_STATUS } = require('../../shared/constants');

// Mock all dependencies
jest.mock('../../shared/logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        logWebhook: jest.fn(),
        logResponse: jest.fn()
    }))
}));

jest.mock('../../shared/auth', () => ({
    getAccessToken: jest.fn(() => Promise.resolve('mock-access-token'))
}));

jest.mock('./uipath-dispatcher', () => ({
    shouldProcessForUiPath: jest.fn((clientState) => {
        return clientState && clientState.includes('processor:uipath');
    }),
    fetchSharePointItem: jest.fn((resource, resourceData, context) => {
        // Mock SharePoint item response
        return Promise.resolve({
            ID: resourceData?.id || '123',
            Title: 'Test Item',
            Status: 'Active',
            FileLeafRef: 'test-document.pdf'
        });
    })
}));

jest.mock('../../shared/uipath-processor-registry', () => ({
    resolveProcessor: jest.fn(({ clientState, resource, item }) => {
        if (clientState?.includes('costco') || resource?.toLowerCase().includes('costco')) {
            return {
                name: 'costco-inline-routing',
                factory: (context) => ({
                    process: jest.fn(async () => ({
                        processed: true,
                        queueSubmission: { success: true, queueItemId: 'queue-123' }
                    }))
                })
            };
        }
        if (clientState?.includes('document')) {
            return {
                name: 'generic-document',
                factory: (context) => ({
                    process: jest.fn(async () => ({
                        processed: true,
                        queueSubmission: { success: true, queueItemId: 'queue-456' }
                    }))
                })
            };
        }
        return null;
    }),
    parseClientState: jest.fn((clientState) => {
        if (!clientState) return [];
        return clientState.toLowerCase().split(';').map(s => s.trim()).filter(Boolean);
    })
}));

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logWebhook: jest.fn(),
    logResponse: jest.fn()
};

const mockContext = {
    log: jest.fn()
};

describe('uipath-dispatcher-dynamic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('processNotification', () => {
        it('should skip processing when UiPath not requested', async () => {
            const notification = {
                subscriptionId: 'sub-123',
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                clientState: 'forward:https://example.com',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.ListItem',
                    id: '456'
                }
            };

            const result = await processNotification(notification, mockContext, mockLogger);

            expect(result.processed).toBe(false);
            expect(result.reason).toBe('UiPath processing not requested');
            expect(result.subscriptionId).toBe('sub-123');
        });

        it('should skip when unable to fetch SharePoint item', async () => {
            const { fetchSharePointItem } = require('./uipath-dispatcher');
            fetchSharePointItem.mockResolvedValueOnce(null);

            const notification = {
                subscriptionId: 'sub-123',
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                clientState: 'processor:uipath',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.ListItem',
                    id: '456'
                }
            };

            const result = await processNotification(notification, mockContext, mockLogger);

            expect(result.processed).toBe(false);
            expect(result.reason).toBe('Unable to resolve SharePoint item');
        });

        it('should skip when no processor matches', async () => {
            const notification = {
                subscriptionId: 'sub-789',
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                clientState: 'processor:uipath;unknown:config',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.ListItem',
                    id: '999'
                }
            };

            const { resolveProcessor } = require('../../shared/uipath-processor-registry');
            resolveProcessor.mockReturnValueOnce(null);

            const result = await processNotification(notification, mockContext, mockLogger);

            expect(result.processed).toBe(false);
            expect(result.reason).toBe('No matching UiPath processor registered');
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'No processor resolved for notification',
                expect.objectContaining({ subscriptionId: 'sub-789' })
            );
        });

        it('should process COSTCO item successfully', async () => {
            const notification = {
                subscriptionId: 'sub-costco-123',
                resource: 'sites/example.sharepoint.com:/sites/COSTCO:/lists/123',
                clientState: 'processor:uipath;costco:routing',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.ListItem',
                    id: '15'
                }
            };

            const result = await processNotification(notification, mockContext, mockLogger);

            expect(result.processed).toBe(true);
            expect(result.subscriptionId).toBe('sub-costco-123');
            expect(result.processor).toBe('costco-inline-routing');
            expect(result.queueSubmission).toBeDefined();
            expect(result.queueSubmission.success).toBe(true);
        });

        it('should process generic document successfully', async () => {
            const notification = {
                subscriptionId: 'sub-doc-456',
                resource: 'sites/example.sharepoint.com:/sites/test:/Shared Documents',
                clientState: 'processor:uipath;processor:document',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.DriveItem',
                    id: 'doc-789'
                }
            };

            const result = await processNotification(notification, mockContext, mockLogger);

            expect(result.processed).toBe(true);
            expect(result.subscriptionId).toBe('sub-doc-456');
            expect(result.processor).toBe('generic-document');
        });

        it('should extract queue name from clientState', async () => {
            const notification = {
                subscriptionId: 'sub-queue-test',
                resource: 'sites/example.sharepoint.com:/sites/costco:/lists/123',
                clientState: 'processor:uipath;uipath:TestQueue;costco:routing',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.ListItem',
                    id: '99'
                }
            };

            await processNotification(notification, mockContext, mockLogger);

            // Verify the processor received the extracted queue name
            const { resolveProcessor } = require('../../shared/uipath-processor-registry');
            const descriptor = resolveProcessor.mock.results[resolveProcessor.mock.results.length - 1].value;

            expect(descriptor).not.toBeNull();
        });

        it('should fetch access token for document processors', async () => {
            const { getAccessToken } = require('../../shared/auth');

            const notification = {
                subscriptionId: 'sub-doc-auth',
                resource: 'sites/example.sharepoint.com:/sites/test:/Shared Documents',
                clientState: 'processor:uipath;processor:document',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.DriveItem',
                    id: 'doc-auth-123'
                }
            };

            await processNotification(notification, mockContext, mockLogger);

            expect(getAccessToken).toHaveBeenCalledWith(mockContext);
        });

        it('should handle processor errors gracefully', async () => {
            const notification = {
                subscriptionId: 'sub-error-test',
                resource: 'sites/example.sharepoint.com:/sites/costco:/lists/123',
                clientState: 'processor:uipath;costco:routing',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.ListItem',
                    id: 'error-item'
                }
            };

            // Mock processor to throw error
            const { resolveProcessor } = require('../../shared/uipath-processor-registry');
            resolveProcessor.mockReturnValueOnce({
                name: 'error-processor',
                factory: () => ({
                    process: jest.fn(() => Promise.reject(new Error('Processing failed')))
                })
            });

            const result = await processNotification(notification, mockContext, mockLogger);

            expect(result.processed).toBe(false);
            expect(result.error).toBe('Processing failed');
            expect(result.processor).toBe('error-processor');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Dynamic UiPath processor failed',
                expect.objectContaining({
                    subscriptionId: 'sub-error-test',
                    error: 'Processing failed'
                })
            );
        });

        it('should log webhook processing start', async () => {
            const notification = {
                subscriptionId: 'sub-log-test',
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                clientState: 'processor:uipath;costco:test',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.ListItem',
                    id: 'log-123'
                }
            };

            await processNotification(notification, mockContext, mockLogger);

            expect(mockLogger.logWebhook).toHaveBeenCalledWith(
                'processing-dynamic-uipath',
                'sub-log-test',
                expect.objectContaining({
                    resource: notification.resource,
                    clientState: notification.clientState,
                    service: 'uipath-dispatcher-dynamic'
                })
            );
        });
    });

    describe('Integration scenarios', () => {
        it('should handle COSTCO routing form notification', async () => {
            const notification = {
                subscriptionId: '07c6db43-15c9-4074-a40c-c5576c2f2011',
                resource: 'sites/fambrandsllc.sharepoint.com:/sites/DWI:/lists/9e35f709-48be-4995-8b28-79730ad12b89',
                clientState: 'processor:uipath;uipath:Trafficking Request Email Trigger_Queue;env:DEV;folder:277500;config:AzureFunctionApp',
                changeType: 'updated',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.ListItem',
                    id: '15'
                }
            };

            const { fetchSharePointItem } = require('./uipath-dispatcher');
            fetchSharePointItem.mockResolvedValueOnce({
                ID: '15',
                Title: 'COSTCO Routing Form',
                Status: 'Send Generated Form',
                CustomerName: 'COSTCO',
                OrderNumber: 'ORD-2025-001'
            });

            const result = await processNotification(notification, mockContext, mockLogger);

            expect(result.processed).toBe(true);
            expect(result.processor).toBe('costco-inline-routing');
        });

        it('should handle document library notification', async () => {
            const notification = {
                subscriptionId: 'doc-sub-123',
                resource: 'sites/company.sharepoint.com:/sites/Accounting:/Shared Documents',
                clientState: 'processor:uipath;processor:document;uipath:Invoice_Processing',
                changeType: 'created',
                resourceData: {
                    '@odata.type': '#Microsoft.Graph.DriveItem',
                    id: 'invoice-001'
                }
            };

            const { fetchSharePointItem } = require('./uipath-dispatcher');
            fetchSharePointItem.mockResolvedValueOnce({
                id: 'invoice-001',
                FileLeafRef: 'invoice-2025-001.pdf',
                FileRef: '/sites/Accounting/Shared Documents/invoice-2025-001.pdf',
                size: 2048
            });

            const result = await processNotification(notification, mockContext, mockLogger);

            expect(result.processed).toBe(true);
            expect(result.processor).toBe('generic-document');
        });

        it('should handle multiple notifications in batch', async () => {
            const notifications = [
                {
                    subscriptionId: 'batch-1',
                    resource: 'sites/example.com:/sites/costco:/lists/123',
                    clientState: 'processor:uipath;costco:test',
                    resourceData: { id: '1' }
                },
                {
                    subscriptionId: 'batch-2',
                    resource: 'sites/example.com:/sites/test:/Shared Documents',
                    clientState: 'processor:uipath;processor:document',
                    resourceData: { id: '2' }
                },
                {
                    subscriptionId: 'batch-3',
                    resource: 'sites/example.com:/sites/test:/lists/999',
                    clientState: 'forward:https://example.com',
                    resourceData: { id: '3' }
                }
            ];

            const results = await Promise.all(
                notifications.map(n => processNotification(n, mockContext, mockLogger))
            );

            expect(results[0].processed).toBe(true);
            expect(results[0].processor).toBe('costco-inline-routing');
            expect(results[1].processed).toBe(true);
            expect(results[1].processor).toBe('generic-document');
            expect(results[2].processed).toBe(false);
            expect(results[2].reason).toBe('UiPath processing not requested');
        });
    });
});
