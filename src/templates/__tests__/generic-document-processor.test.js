// Mock constants first (before other imports)
jest.mock('../../shared/constants', () => ({
    UIPATH_PRIORITY: {
        LOW: 'Low',
        NORMAL: 'Normal',
        HIGH: 'High'
    },
    UIPATH_API_ENDPOINTS: {
        ADD_QUEUE_ITEM: '/odata/Queues/UiPathODataSvc.AddQueueItem',
        GET_FOLDERS: '/odata/Folders'
    },
    HTTP_STATUS: {},
    SERVICE_NAMES: {},
    ERROR_MESSAGES: {}
}));

const {
    GenericDocumentProcessor,
    createGenericDocumentProcessor
} = require('../generic-document-processor');
const { UIPATH_PRIORITY } = require('../../shared/constants');

// Mock dependencies
jest.mock('../../shared/logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }))
}));

jest.mock('../../shared/uipath-dynamic-queue-client', () => ({
    createDynamicUiPathQueueClient: jest.fn(() => ({
        buildSpecificContentFromItem: jest.fn((item, options) => ({
            ItemId: item.ID || item.id,
            Title: item.Title || item.FileLeafRef,
            ...item
        })),
        enqueue: jest.fn((params) =>
            Promise.resolve({
                success: true,
                queueName: params.queueName,
                reference: params.reference
            })
        )
    }))
}));

describe('generic-document-processor', () => {
    beforeEach(() => {
        process.env.UIPATH_DEFAULT_QUEUE = 'TestQueue';
        jest.clearAllMocks();
    });

    describe('GenericDocumentProcessor', () => {
        describe('constructor', () => {
            it('should initialize with default options', () => {
                const processor = new GenericDocumentProcessor(null);

                expect(processor.options.defaultQueue).toBe('TestQueue');
                expect(processor.options.referencePrefix).toBe('SPDOC');
                expect(processor.options.priority).toBe(UIPATH_PRIORITY.NORMAL);
                expect(processor.options.includeFields).toBeNull();
                expect(processor.options.excludeFields).toEqual([]);
            });

            it('should merge custom options', () => {
                const customOptions = {
                    referencePrefix: 'CUSTOM',
                    priority: UIPATH_PRIORITY.HIGH,
                    includeFields: ['Field1', 'Field2'],
                    excludeFields: ['_internal'],
                    allowedExtensions: ['pdf', 'docx']
                };

                const processor = new GenericDocumentProcessor(null, customOptions);

                expect(processor.options.referencePrefix).toBe('CUSTOM');
                expect(processor.options.priority).toBe(UIPATH_PRIORITY.HIGH);
                expect(processor.options.includeFields).toEqual(['Field1', 'Field2']);
                expect(processor.options.excludeFields).toEqual(['_internal']);
                expect(processor.options.allowedExtensions).toEqual(['pdf', 'docx']);
            });
        });

        describe('shouldProcessItem', () => {
            let processor;

            beforeEach(() => {
                processor = new GenericDocumentProcessor(null);
            });

            it('should return false for null or undefined item', () => {
                expect(processor.shouldProcessItem(null)).toBe(false);
                expect(processor.shouldProcessItem(undefined)).toBe(false);
            });

            it('should return true for any item when no extension filter configured', () => {
                const item = { ID: 123, FileLeafRef: 'document.pdf' };
                expect(processor.shouldProcessItem(item)).toBe(true);
            });

            it('should filter by allowed extensions', () => {
                processor.options.allowedExtensions = ['pdf', 'docx'];

                expect(processor.shouldProcessItem({ FileLeafRef: 'document.pdf' })).toBe(true);
                expect(processor.shouldProcessItem({ FileLeafRef: 'document.docx' })).toBe(true);
                expect(processor.shouldProcessItem({ FileLeafRef: 'spreadsheet.xlsx' })).toBe(false);
            });

            it('should be case-insensitive for extension matching', () => {
                processor.options.allowedExtensions = ['pdf', 'docx'];

                expect(processor.shouldProcessItem({ FileLeafRef: 'document.PDF' })).toBe(true);
                expect(processor.shouldProcessItem({ FileLeafRef: 'document.DOCX' })).toBe(true);
            });

            it('should handle files without extensions', () => {
                processor.options.allowedExtensions = ['pdf'];

                expect(processor.shouldProcessItem({ FileLeafRef: 'README' })).toBe(false);
            });

            it('should return true when no FileLeafRef and no extension filter', () => {
                const item = { ID: 123, Title: 'Some Item' };
                expect(processor.shouldProcessItem(item)).toBe(true);
            });
        });

        describe('buildReference', () => {
            let processor;

            beforeEach(() => {
                processor = new GenericDocumentProcessor(null);
                jest.spyOn(Date, 'now').mockReturnValue(1234567890);
            });

            afterEach(() => {
                Date.now.mockRestore();
            });

            it('should build reference from FileLeafRef and ID', () => {
                const item = { ID: 123, FileLeafRef: 'invoice.pdf' };
                const reference = processor.buildReference(item);

                expect(reference).toBe('SPDOC_invoice.pdf_123_1234567890');
            });

            it('should use Title as fallback', () => {
                const item = { ID: 456, Title: 'Document Title' };
                const reference = processor.buildReference(item);

                expect(reference).toBe('SPDOC_Document_Title_456_1234567890');
            });

            it('should use id (lowercase) if ID not present', () => {
                const item = { id: 789, FileLeafRef: 'file.docx' };
                const reference = processor.buildReference(item);

                expect(reference).toBe('SPDOC_file.docx_789_1234567890');
            });

            it('should replace spaces and commas with underscores', () => {
                const item = { ID: 1, FileLeafRef: 'My Document, Version 2.pdf' };
                const reference = processor.buildReference(item);

                expect(reference).toBe('SPDOC_My_Document__Version_2.pdf_1_1234567890');
            });

            it('should handle missing ID and filename', () => {
                const item = {};
                const reference = processor.buildReference(item);

                expect(reference).toBe('SPDOC_ITEM_NOID_1234567890');
            });

            it('should use custom reference prefix', () => {
                processor.options.referencePrefix = 'CUSTOM';
                const item = { ID: 123, FileLeafRef: 'test.pdf' };
                const reference = processor.buildReference(item);

                expect(reference).toBe('CUSTOM_test.pdf_123_1234567890');
            });
        });

        describe('buildAdditionalContent', () => {
            let processor;

            beforeEach(() => {
                processor = new GenericDocumentProcessor(null);
            });

            it('should extract file metadata', () => {
                const item = {
                    FileRef: '/sites/test/Documents/file.pdf',
                    FileDirRef: '/sites/test/Documents',
                    FileLeafRef: 'file.pdf',
                    UniqueId: 'abc-123',
                    ContentType: 'Document'
                };

                const content = processor.buildAdditionalContent(item);

                expect(content.FilePath).toBe('/sites/test/Documents/file.pdf');
                expect(content.FileDirectory).toBe('/sites/test/Documents');
                expect(content.FileName).toBe('file.pdf');
                expect(content.UniqueId).toBe('abc-123');
                expect(content.ContentType).toBe('Document');
            });

            it('should extract Author and Editor information', () => {
                const item = {
                    Author: { Email: 'author@example.com', Title: 'John Doe' },
                    Editor: { Email: 'editor@example.com', Title: 'Jane Smith' }
                };

                const content = processor.buildAdditionalContent(item);

                expect(content.CreatedBy).toBe('author@example.com');
                expect(content.ModifiedBy).toBe('editor@example.com');
            });

            it('should use Title as fallback for Author/Editor', () => {
                const item = {
                    Author: { Title: 'John Doe' },
                    Editor: { Title: 'Jane Smith' }
                };

                const content = processor.buildAdditionalContent(item);

                expect(content.CreatedBy).toBe('John Doe');
                expect(content.ModifiedBy).toBe('Jane Smith');
            });

            it('should stringify complex Author/Editor objects as fallback', () => {
                const item = {
                    Author: { id: 123, displayName: 'User' },
                    Editor: { id: 456, displayName: 'Admin' }
                };

                const content = processor.buildAdditionalContent(item);

                expect(content.CreatedBy).toBe(JSON.stringify(item.Author));
                expect(content.ModifiedBy).toBe(JSON.stringify(item.Editor));
            });

            it('should extract timestamp and URL fields', () => {
                const item = {
                    LastModifiedDateTime: '2025-01-01T10:00:00Z',
                    WebUrl: 'https://example.sharepoint.com/document.pdf'
                };

                const content = processor.buildAdditionalContent(item);

                expect(content.LastModified).toBe('2025-01-01T10:00:00Z');
                expect(content.WebUrl).toBe('https://example.sharepoint.com/document.pdf');
            });

            it('should prefer LastModifiedDateTime over Modified', () => {
                const item = {
                    LastModifiedDateTime: '2025-01-01T10:00:00Z',
                    Modified: '2024-12-31T10:00:00Z'
                };

                const content = processor.buildAdditionalContent(item);

                expect(content.LastModified).toBe('2025-01-01T10:00:00Z');
            });

            it('should return empty values for missing fields', () => {
                const item = {};
                const content = processor.buildAdditionalContent(item);

                expect(content.LastModified).toBeNull();
                expect(content.WebUrl).toBeNull();
            });
        });

        describe('processItem', () => {
            let processor;

            beforeEach(() => {
                processor = new GenericDocumentProcessor(null);
            });

            it('should skip item that does not meet criteria', async () => {
                jest.spyOn(processor, 'shouldProcessItem').mockReturnValue(false);

                const item = { ID: 123 };
                const result = await processor.processItem(item);

                expect(result.processed).toBe(false);
                expect(result.reason).toBe('Item did not meet processing criteria');
                expect(result.itemId).toBe(123);
            });

            it('should throw error when queue name not configured', async () => {
                delete process.env.UIPATH_DEFAULT_QUEUE;
                processor = new GenericDocumentProcessor(null);

                const item = { ID: 123, FileLeafRef: 'test.pdf' };

                await expect(processor.processItem(item)).rejects.toThrow(
                    'UiPath queue name not configured for generic document processor'
                );
            });

            it('should process item successfully', async () => {
                const item = {
                    ID: 123,
                    FileLeafRef: 'invoice.pdf',
                    FileRef: '/sites/test/Documents/invoice.pdf',
                    ContentType: 'Document'
                };

                const result = await processor.processItem(item);

                expect(result.processed).toBe(true);
                expect(result.itemId).toBe(123);
                expect(result.template).toBe('generic-document');
                expect(result.queueSubmission).toBeDefined();
                expect(result.queueSubmission.success).toBe(true);
            });

            it('should use queueNameOverride when provided', async () => {
                const item = { ID: 123, FileLeafRef: 'test.pdf' };

                await processor.processItem(item, null, 'CustomQueue');

                expect(processor.queueClient.enqueue).toHaveBeenCalledWith(
                    expect.objectContaining({
                        queueName: 'CustomQueue'
                    })
                );
            });

            it('should pass includeFields and excludeFields to queue client', async () => {
                processor.options.includeFields = ['Field1', 'Field2'];
                processor.options.excludeFields = ['_internal'];

                const item = { ID: 123, FileLeafRef: 'test.pdf' };

                await processor.processItem(item);

                expect(processor.queueClient.buildSpecificContentFromItem).toHaveBeenCalledWith(
                    item,
                    {
                        includeFields: ['Field1', 'Field2'],
                        excludeFields: ['_internal']
                    }
                );
            });

            it('should use custom priority from options', async () => {
                processor.options.priority = UIPATH_PRIORITY.HIGH;

                const item = { ID: 123, FileLeafRef: 'urgent.pdf' };

                await processor.processItem(item);

                expect(processor.queueClient.enqueue).toHaveBeenCalledWith(
                    expect.objectContaining({
                        priority: UIPATH_PRIORITY.HIGH
                    })
                );
            });

            it('should merge additional content into specificContent', async () => {
                const item = {
                    ID: 123,
                    FileLeafRef: 'document.pdf',
                    FileRef: '/sites/test/document.pdf',
                    Author: { Email: 'test@example.com' }
                };

                await processor.processItem(item);

                // Verify enqueue was called
                expect(processor.queueClient.enqueue).toHaveBeenCalled();
                const enqueuedContent = processor.queueClient.enqueue.mock.calls[0][0].specificContent;

                // Should include data from buildAdditionalContent
                expect(enqueuedContent.FilePath).toBe('/sites/test/document.pdf');
                expect(enqueuedContent.CreatedBy).toBe('test@example.com');
            });

            it('should handle queue submission failure gracefully', async () => {
                processor.queueClient.enqueue.mockResolvedValue({ success: false, error: 'Queue error' });

                const item = { ID: 123, FileLeafRef: 'test.pdf' };
                const result = await processor.processItem(item);

                expect(result.processed).toBe(false);
                expect(result.queueSubmission.success).toBe(false);
            });
        });
    });

    describe('createGenericDocumentProcessor', () => {
        it('should create a new instance of GenericDocumentProcessor', () => {
            const processor = createGenericDocumentProcessor(null);

            expect(processor).toBeInstanceOf(GenericDocumentProcessor);
        });

        it('should pass context and options to constructor', () => {
            const mockContext = { log: jest.fn() };
            const options = { referencePrefix: 'TEST' };

            const processor = createGenericDocumentProcessor(mockContext, options);

            expect(processor.context).toBe(mockContext);
            expect(processor.options.referencePrefix).toBe('TEST');
        });
    });

    describe('Integration - end-to-end processing', () => {
        it('should process a complete document item workflow', async () => {
            const processor = createGenericDocumentProcessor(null, {
                referencePrefix: 'INV',
                priority: UIPATH_PRIORITY.HIGH,
                allowedExtensions: ['pdf']
            });

            const documentItem = {
                ID: 456,
                FileLeafRef: 'invoice-2025-001.pdf',
                FileRef: '/sites/accounting/Invoices/invoice-2025-001.pdf',
                FileDirRef: '/sites/accounting/Invoices',
                UniqueId: 'xyz-789',
                ContentType: 'Document',
                Author: { Email: 'accountant@example.com' },
                LastModifiedDateTime: '2025-01-01T12:00:00Z'
            };

            const result = await processor.processItem(documentItem, null, 'Invoice_Queue');

            expect(result.processed).toBe(true);
            expect(result.itemId).toBe(456);
            expect(result.template).toBe('generic-document');
            expect(result.queueSubmission.queueName).toBe('Invoice_Queue');
        });

        it('should reject non-pdf files when extension filter is configured', async () => {
            const processor = createGenericDocumentProcessor(null, {
                allowedExtensions: ['pdf']
            });

            const item = { ID: 789, FileLeafRef: 'spreadsheet.xlsx' };
            const result = await processor.processItem(item);

            expect(result.processed).toBe(false);
            expect(result.reason).toBe('Item did not meet processing criteria');
        });
    });
});
