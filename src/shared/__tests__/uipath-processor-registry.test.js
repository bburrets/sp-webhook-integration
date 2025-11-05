// Mock constants first (before other imports)
jest.mock('../constants', () => ({
    UIPATH_PRIORITY: {
        LOW: 'Low',
        NORMAL: 'Normal',
        HIGH: 'High'
    },
    HTTP_STATUS: { OK: 200 },
    SERVICE_NAMES: {},
    ERROR_MESSAGES: {},
    HTTP_HEADERS: {}
}));

// Mock logger
jest.mock('../logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }))
}));

// Mock the uipath-queue-client
jest.mock('../uipath-queue-client', () => ({
    createUiPathQueueClient: jest.fn(() => ({
        submitQueueItem: jest.fn()
    }))
}));

// Mock the dynamic queue client
jest.mock('../uipath-dynamic-queue-client', () => ({
    createDynamicUiPathQueueClient: jest.fn(() => ({
        buildSpecificContentFromItem: jest.fn(),
        enqueue: jest.fn()
    }))
}));

// Mock the costco-inline-routing module
jest.mock('../../templates/costco-inline-routing', () => ({
    createCostcoProcessor: jest.fn(() => ({
        processItem: jest.fn(async () => ({
            processed: true,
            queueSubmission: { success: true }
        }))
    }))
}));

// Mock the generic-document-processor module
jest.mock('../../templates/generic-document-processor', () => ({
    createGenericDocumentProcessor: jest.fn(() => ({
        processItem: jest.fn(async () => ({
            processed: true,
            queueSubmission: { success: true }
        }))
    }))
}));

const {
    registerProcessor,
    resolveProcessor,
    listProcessors,
    parseClientState
} = require('../uipath-processor-registry');

describe('uipath-processor-registry', () => {
    describe('parseClientState', () => {
        it('should parse semicolon-delimited clientState', () => {
            const clientState = 'forward:https://example.com;processor:uipath;env:dev';
            const tokens = parseClientState(clientState);

            expect(tokens).toEqual([
                'forward:https://example.com',
                'processor:uipath',
                'env:dev'
            ]);
        });

        it('should normalize tokens to lowercase', () => {
            const clientState = 'PROCESSOR:UIPATH;ENV:DEV';
            const tokens = parseClientState(clientState);

            expect(tokens).toEqual([
                'processor:uipath',
                'env:dev'
            ]);
        });

        it('should trim whitespace from tokens', () => {
            const clientState = ' processor:uipath ; env:dev ';
            const tokens = parseClientState(clientState);

            expect(tokens).toEqual([
                'processor:uipath',
                'env:dev'
            ]);
        });

        it('should filter out empty tokens', () => {
            const clientState = 'processor:uipath;;env:dev;';
            const tokens = parseClientState(clientState);

            expect(tokens).toEqual([
                'processor:uipath',
                'env:dev'
            ]);
        });

        it('should return empty array for null or undefined', () => {
            expect(parseClientState(null)).toEqual([]);
            expect(parseClientState(undefined)).toEqual([]);
        });

        it('should return empty array for non-string input', () => {
            expect(parseClientState(123)).toEqual([]);
            expect(parseClientState({})).toEqual([]);
        });

        it('should handle clientState without delimiters', () => {
            const clientState = 'processor:uipath';
            const tokens = parseClientState(clientState);

            expect(tokens).toEqual(['processor:uipath']);
        });
    });

    describe('registerProcessor', () => {
        // Note: Since registry is module-level and pre-populated,
        // we can't easily test registration in isolation without
        // mocking. These tests verify the default registered processors.

        it('should list default registered processors', () => {
            const processors = listProcessors();

            expect(processors).toContain('costco-inline-routing');
            expect(processors).toContain('generic-document');
        });

        it('should throw error for invalid processor descriptor', () => {
            expect(() => registerProcessor(null))
                .toThrow('Invalid processor descriptor registration');

            expect(() => registerProcessor({}))
                .toThrow('Invalid processor descriptor registration');

            expect(() => registerProcessor({ name: 'test' }))
                .toThrow('Invalid processor descriptor registration');
        });
    });

    describe('resolveProcessor - costco-inline-routing', () => {
        it('should match costco token in clientState', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:costco;env:dev',
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(descriptor.name).toBe('costco-inline-routing');
        });

        it('should match processor:costco token', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:costco;queue:test',
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(descriptor.name).toBe('costco-inline-routing');
        });

        it('should match costco in resource path', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:uipath',
                resource: 'sites/example.sharepoint.com:/sites/COSTCO-INLINE:/lists/123',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(descriptor.name).toBe('costco-inline-routing');
        });

        it('should be case-insensitive for resource matching', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:uipath',
                resource: 'sites/example.sharepoint.com:/sites/costco-test:/lists/123',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(descriptor.name).toBe('costco-inline-routing');
        });

        it('should have a factory function that creates processor', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:costco',
                resource: '',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(typeof descriptor.factory).toBe('function');

            const processor = descriptor.factory(null);
            expect(processor).toHaveProperty('name');
            expect(processor).toHaveProperty('process');
            expect(typeof processor.process).toBe('function');
        });
    });

    describe('resolveProcessor - generic-document', () => {
        it('should match processor:document token', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:document;queue:test',
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(descriptor.name).toBe('generic-document');
        });

        it('should match "shared documents" in resource', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:uipath',
                resource: 'sites/example.sharepoint.com:/sites/test:/Shared Documents',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(descriptor.name).toBe('generic-document');
        });

        it('should match "documents" in resource', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:uipath',
                resource: 'sites/example.sharepoint.com:/sites/test:/documents/folder',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(descriptor.name).toBe('generic-document');
        });

        it('should match "/drives/" in resource', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:uipath',
                resource: 'sites/example.sharepoint.com:/drives/b!abc123',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(descriptor.name).toBe('generic-document');
        });

        it('should have a factory function that creates processor', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:document',
                resource: '',
                item: {}
            });

            expect(descriptor).not.toBeNull();
            expect(typeof descriptor.factory).toBe('function');

            const processor = descriptor.factory(null);
            expect(processor).toHaveProperty('name');
            expect(processor).toHaveProperty('process');
            expect(typeof processor.process).toBe('function');
        });
    });

    describe('resolveProcessor - priority and fallback', () => {
        it('should prioritize costco over generic-document for costco resources', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:uipath',
                resource: 'sites/example.sharepoint.com:/sites/COSTCO-INLINE:/Shared Documents',
                item: {}
            });

            // Costco is registered first, so it should match first
            expect(descriptor).not.toBeNull();
            expect(descriptor.name).toBe('costco-inline-routing');
        });

        it('should return null when no processor matches', () => {
            const descriptor = resolveProcessor({
                clientState: 'some:random;tokens:here',
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                item: {}
            });

            expect(descriptor).toBeNull();
        });

        it('should handle empty parameters gracefully', () => {
            const descriptor = resolveProcessor({});
            expect(descriptor).toBeNull();
        });

        it('should handle missing clientState', () => {
            const descriptor = resolveProcessor({
                resource: 'sites/example.sharepoint.com:/sites/test:/lists/123',
                item: {}
            });

            // Should still work if resource matching is available
            expect(descriptor).toBeNull();
        });

        it('should handle missing resource', () => {
            const descriptor = resolveProcessor({
                clientState: 'processor:random',
                item: {}
            });

            expect(descriptor).toBeNull();
        });
    });

    describe('resolveProcessor - error handling', () => {
        it('should handle processor match function errors gracefully', () => {
            // This tests the try-catch in resolveProcessor
            // If a processor.matches() throws, it should be caught and logged
            // but not stop the iteration

            const descriptor = resolveProcessor({
                clientState: 'processor:costco',
                resource: null, // This might cause errors in some match functions
                item: null
            });

            // Should still resolve since we have resilient matching logic
            expect(descriptor).not.toBeNull();
        });
    });

    describe('listProcessors', () => {
        it('should return array of processor names', () => {
            const processors = listProcessors();

            expect(Array.isArray(processors)).toBe(true);
            expect(processors.length).toBeGreaterThan(0);
        });

        it('should include default processors', () => {
            const processors = listProcessors();

            expect(processors).toContain('costco-inline-routing');
            expect(processors).toContain('generic-document');
        });
    });
});
