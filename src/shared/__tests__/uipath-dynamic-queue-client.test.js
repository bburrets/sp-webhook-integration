// Mock constants first (before other imports)
jest.mock('../constants', () => ({
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
    DynamicUiPathQueueClient,
    createDynamicUiPathQueueClient
} = require('../uipath-dynamic-queue-client');
const { UIPATH_PRIORITY } = require('../constants');

// Mock the base queue client
jest.mock('../uipath-queue-client', () => ({
    createUiPathQueueClient: jest.fn(() => ({
        submitQueueItem: jest.fn((queueName, payload) =>
            Promise.resolve({ success: true, queueName, payload })
        )
    }))
}));

describe('uipath-dynamic-queue-client', () => {
    describe('DynamicUiPathQueueClient', () => {
        let client;

        beforeEach(() => {
            client = new DynamicUiPathQueueClient(null);
        });

        describe('normaliseBaseMetadata', () => {
            it('should extract standard list item metadata', () => {
                const item = {
                    ID: 123,
                    Title: 'Test Item',
                    Modified: '2025-01-01T10:00:00Z',
                    Created: '2025-01-01T09:00:00Z',
                    UniqueId: 'abc-123-def',
                    WebUrl: 'https://example.sharepoint.com/sites/test'
                };

                const metadata = client.normaliseBaseMetadata(item);

                expect(metadata.ItemId).toBe(123);
                expect(metadata.Title).toBe('Test Item');
                expect(metadata.LastModified).toBe('2025-01-01T10:00:00Z');
                expect(metadata.Created).toBe('2025-01-01T09:00:00Z');
                expect(metadata.ListItemUniqueId).toBe('abc-123-def');
                expect(metadata.WebUrl).toBe('https://example.sharepoint.com/sites/test');
            });

            it('should extract document metadata', () => {
                const item = {
                    id: '456',
                    name: 'document.pdf',
                    FileLeafRef: 'document.pdf',
                    FileRef: '/sites/test/Shared Documents/document.pdf',
                    FileDirRef: '/sites/test/Shared Documents',
                    ContentType: 'Document',
                    lastModifiedDateTime: '2025-01-01T11:00:00Z',
                    createdDateTime: '2025-01-01T10:00:00Z',
                    webUrl: 'https://example.sharepoint.com/document.pdf',
                    listItemUniqueId: 'xyz-789'
                };

                const metadata = client.normaliseBaseMetadata(item);

                expect(metadata.ItemId).toBe('456');
                expect(metadata.Title).toBe('document.pdf');
                expect(metadata.FileName).toBe('document.pdf');
                expect(metadata.FilePath).toBe('/sites/test/Shared Documents/document.pdf');
                expect(metadata.FileDirectory).toBe('/sites/test/Shared Documents');
                expect(metadata.ContentType).toBe('Document');
                expect(metadata.LastModified).toBe('2025-01-01T11:00:00Z');
                expect(metadata.Created).toBe('2025-01-01T10:00:00Z');
            });

            it('should handle item with fields.File_x0020_Type', () => {
                const item = {
                    ID: 1,
                    Title: 'Test',
                    fields: {
                        File_x0020_Type: 'pdf'
                    }
                };

                const metadata = client.normaliseBaseMetadata(item);

                expect(metadata.FileType).toBe('pdf');
            });

            it('should handle missing fields gracefully', () => {
                const item = {
                    ID: 123
                };

                const metadata = client.normaliseBaseMetadata(item);

                expect(metadata.ItemId).toBe(123);
                expect(metadata.Title).toBeNull();
                expect(metadata.LastModified).toBeNull();
            });

            it('should return all null for empty item', () => {
                const metadata = client.normaliseBaseMetadata({});

                expect(metadata.ItemId).toBeNull();
                expect(metadata.Title).toBeNull();
                expect(metadata.WebUrl).toBeNull();
            });

            it('should prefer ID over id', () => {
                const item = {
                    ID: 123,
                    id: 456
                };

                const metadata = client.normaliseBaseMetadata(item);

                expect(metadata.ItemId).toBe(123);
            });

            it('should prefer Title over FileLeafRef over name', () => {
                const item1 = { Title: 'Title', FileLeafRef: 'File', name: 'Name' };
                expect(client.normaliseBaseMetadata(item1).Title).toBe('Title');

                const item2 = { FileLeafRef: 'File', name: 'Name' };
                expect(client.normaliseBaseMetadata(item2).Title).toBe('File');

                const item3 = { name: 'Name' };
                expect(client.normaliseBaseMetadata(item3).Title).toBe('Name');
            });
        });

        describe('buildSpecificContentFromItem', () => {
            it('should merge base metadata with item fields', () => {
                const item = {
                    ID: 123,
                    Title: 'Test Item',
                    Status: 'Active',
                    Priority: 'High',
                    fields: {
                        CustomField1: 'Value1',
                        CustomField2: 'Value2'
                    }
                };

                const content = client.buildSpecificContentFromItem(item);

                expect(content.ItemId).toBe(123);
                expect(content.Title).toBe('Test Item');
                expect(content.Status).toBe('Active');
                expect(content.Priority).toBe('High');
                expect(content.CustomField1).toBe('Value1');
                expect(content.CustomField2).toBe('Value2');
            });

            it('should filter fields using includeFields option', () => {
                const item = {
                    ID: 123,
                    Title: 'Test',
                    Status: 'Active',
                    Priority: 'High',
                    Description: 'Test description'
                };

                const content = client.buildSpecificContentFromItem(item, {
                    includeFields: ['ItemId', 'Title', 'Status']
                });

                expect(content.ItemId).toBe(123);
                expect(content.Title).toBe('Test');
                expect(content.Status).toBe('Active');
                expect(content.Priority).toBeUndefined();
                expect(content.Description).toBeUndefined();
            });

            it('should filter fields using excludeFields option', () => {
                const item = {
                    ID: 123,
                    Title: 'Test',
                    _UIVersionString: '1.0',
                    _ComplianceFlags: 'flags'
                };

                const content = client.buildSpecificContentFromItem(item, {
                    excludeFields: ['_UIVersionString', '_ComplianceFlags']
                });

                expect(content.ItemId).toBe(123);
                expect(content.Title).toBe('Test');
                expect(content._UIVersionString).toBeUndefined();
                expect(content._ComplianceFlags).toBeUndefined();
            });

            it('should skip @odata fields', () => {
                const item = {
                    ID: 123,
                    Title: 'Test',
                    '@odata.type': '#Microsoft.Graph.ListItem',
                    '@odata.etag': 'etag-value'
                };

                const content = client.buildSpecificContentFromItem(item);

                expect(content['@odata.type']).toBeUndefined();
                expect(content['@odata.etag']).toBeUndefined();
            });

            it('should skip reserved system fields', () => {
                const item = {
                    ID: 123,
                    Title: 'Test',
                    fields: {
                        CustomField: 'value'
                    },
                    parentReference: {
                        path: '/sites/test'
                    },
                    fileSystemInfo: {
                        lastModifiedDateTime: '2025-01-01'
                    }
                };

                const content = client.buildSpecificContentFromItem(item);

                // Should not include 'fields', 'parentReference', 'fileSystemInfo' keys themselves
                expect(content.fields).toBeUndefined();
                expect(content.parentReference).toBeUndefined();
                expect(content.fileSystemInfo).toBeUndefined();

                // But should include extracted values
                expect(content.CustomField).toBe('value');
                expect(content.ParentPath).toBe('/sites/test');
            });

            it('should extract parentReference metadata', () => {
                const item = {
                    ID: 123,
                    parentReference: {
                        path: '/sites/test/documents',
                        siteId: 'site-123'
                    }
                };

                const content = client.buildSpecificContentFromItem(item);

                expect(content.ParentPath).toBe('/sites/test/documents');
                expect(content.ParentSite).toBe('site-123');
            });

            it('should extract file hash and size', () => {
                const item = {
                    ID: 123,
                    file: {
                        hashes: {
                            sha1Hash: 'abc123def456'
                        }
                    },
                    size: 1024
                };

                const content = client.buildSpecificContentFromItem(item);

                expect(content.FileHash).toBe('abc123def456');
                expect(content.FileSizeBytes).toBe(1024);
            });

            it('should skip null and undefined values', () => {
                const item = {
                    ID: 123,
                    Title: 'Test',
                    NullField: null,
                    UndefinedField: undefined,
                    EmptyString: ''
                };

                const content = client.buildSpecificContentFromItem(item);

                expect(content.NullField).toBeUndefined();
                expect(content.UndefinedField).toBeUndefined();
                expect(content.EmptyString).toBe(''); // Empty string is preserved
            });
        });

        describe('enqueue', () => {
            it('should submit queue item with correct payload structure', async () => {
                const queueName = 'TestQueue';
                const specificContent = {
                    ItemId: 123,
                    Title: 'Test Item'
                };
                const reference = 'TEST-123';

                const result = await client.enqueue({
                    queueName,
                    specificContent,
                    reference
                });

                expect(result.success).toBe(true);
                expect(result.queueName).toBe('TestQueue');
                expect(result.payload).toEqual({
                    priority: UIPATH_PRIORITY.NORMAL,
                    reference: 'TEST-123',
                    specificContent: {
                        ItemId: 123,
                        Title: 'Test Item'
                    }
                });
            });

            it('should use custom priority when provided', async () => {
                const result = await client.enqueue({
                    queueName: 'TestQueue',
                    specificContent: { test: 'data' },
                    reference: 'TEST-456',
                    priority: UIPATH_PRIORITY.HIGH
                });

                expect(result.payload.priority).toBe(UIPATH_PRIORITY.HIGH);
            });

            it('should default to NORMAL priority', async () => {
                const result = await client.enqueue({
                    queueName: 'TestQueue',
                    specificContent: { test: 'data' },
                    reference: 'TEST-789'
                });

                expect(result.payload.priority).toBe(UIPATH_PRIORITY.NORMAL);
            });
        });
    });

    describe('createDynamicUiPathQueueClient', () => {
        it('should create a new instance of DynamicUiPathQueueClient', () => {
            const client = createDynamicUiPathQueueClient(null);

            expect(client).toBeInstanceOf(DynamicUiPathQueueClient);
        });

        it('should pass context to constructor', () => {
            const mockContext = { log: jest.fn() };
            const client = createDynamicUiPathQueueClient(mockContext);

            expect(client.context).toBe(mockContext);
        });
    });

    describe('Integration - full workflow', () => {
        it('should build and enqueue a complete SharePoint list item', async () => {
            const client = createDynamicUiPathQueueClient(null);

            const sharePointItem = {
                ID: 123,
                Title: 'COSTCO Routing Form',
                Status: 'Send Generated Form',
                Priority: 'High',
                fields: {
                    ShipToEmail: 'test@example.com',
                    CustomerName: 'COSTCO',
                    OrderNumber: 'ORD-001'
                }
            };

            const specificContent = client.buildSpecificContentFromItem(sharePointItem);

            const result = await client.enqueue({
                queueName: 'COSTCO_Queue',
                specificContent,
                reference: `COSTCO-${sharePointItem.ID}`,
                priority: UIPATH_PRIORITY.HIGH
            });

            expect(result.success).toBe(true);
            expect(result.payload.specificContent).toMatchObject({
                ItemId: 123,
                Title: 'COSTCO Routing Form',
                Status: 'Send Generated Form',
                Priority: 'High',
                ShipToEmail: 'test@example.com',
                CustomerName: 'COSTCO',
                OrderNumber: 'ORD-001'
            });
        });

        it('should build and enqueue a document library item', async () => {
            const client = createDynamicUiPathQueueClient(null);

            const documentItem = {
                id: 'doc-456',
                name: 'invoice.pdf',
                FileLeafRef: 'invoice.pdf',
                FileRef: '/sites/accounting/Documents/invoice.pdf',
                size: 2048,
                lastModifiedDateTime: '2025-01-01T12:00:00Z',
                file: {
                    hashes: {
                        sha1Hash: 'hash123'
                    }
                },
                fields: {
                    InvoiceNumber: 'INV-2025-001',
                    Amount: 1500.00
                }
            };

            const specificContent = client.buildSpecificContentFromItem(documentItem);

            const result = await client.enqueue({
                queueName: 'Invoice_Processing',
                specificContent,
                reference: `INV-${documentItem.id}`
            });

            expect(result.success).toBe(true);
            expect(result.payload.specificContent).toMatchObject({
                ItemId: 'doc-456',
                Title: 'invoice.pdf',
                FileName: 'invoice.pdf',
                FilePath: '/sites/accounting/Documents/invoice.pdf',
                FileSizeBytes: 2048,
                FileHash: 'hash123',
                InvoiceNumber: 'INV-2025-001',
                Amount: 1500.00
            });
        });
    });
});
