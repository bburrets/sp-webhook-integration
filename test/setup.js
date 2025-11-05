// Test setup file for Jest
// Sets up environment variables and global test utilities

// Set test environment
process.env.NODE_ENV = 'test';

// Mock Azure environment variables
process.env.AZURE_CLIENT_ID = 'test-client-id';
process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
process.env.AZURE_TENANT_ID = 'test-tenant-id';
process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test;EndpointSuffix=core.windows.net';

// Mock function app settings
process.env.WEBHOOK_LIST_ID = 'test-webhook-list-id';
process.env.WEBSITE_SITE_NAME = 'test-function-app';
process.env.WEBSITE_HOSTNAME = 'test-function-app.azurewebsites.net';

// Mock UiPath settings
process.env.UIPATH_ORCHESTRATOR_URL = 'https://test-orchestrator.uipath.com';
process.env.UIPATH_TENANT_NAME = 'test-tenant';
process.env.UIPATH_CLIENT_ID = 'test-uipath-client-id';
process.env.UIPATH_CLIENT_SECRET = 'test-uipath-client-secret';
process.env.UIPATH_ORGANIZATION_UNIT_ID = '12345';
process.env.UIPATH_DEFAULT_QUEUE = 'TestQueue';
process.env.UIPATH_ENABLED = 'true';

// Global test utilities
global.testHelpers = {
    // Create mock Azure Functions context
    createMockContext: () => ({
        invocationId: 'test-invocation-id',
        executionContext: {
            invocationId: 'test-invocation-id',
            functionName: 'test-function',
            functionDirectory: '/test/function'
        },
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        verbose: jest.fn(),
        done: jest.fn()
    }),
    
    // Create mock HTTP request
    createMockRequest: (options = {}) => ({
        method: options.method || 'GET',
        url: options.url || 'http://localhost:7071/api/test',
        headers: options.headers || {},
        query: new Map(Object.entries(options.query || {})),
        params: options.params || {},
        body: options.body,
        text: jest.fn().mockResolvedValue(JSON.stringify(options.body || {})),
        json: jest.fn().mockResolvedValue(options.body || {}),
        user: options.user
    }),
    
    // Create mock axios response
    createMockAxiosResponse: (data, status = 200) => ({
        data,
        status,
        statusText: 'OK',
        headers: {},
        config: {}
    })
};

// Increase test timeout for integration tests
jest.setTimeout(30000);