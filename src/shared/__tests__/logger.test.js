const { createLogger, logger, LogLevel } = require('../logger');

describe('logger module', () => {
    let mockContext;
    let consoleLogSpy, consoleErrorSpy, consoleWarnSpy;
    
    beforeEach(() => {
        mockContext = global.testHelpers.createMockContext();
        
        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        // Clear mocks
        jest.clearAllMocks();
    });
    
    afterEach(() => {
        // Restore console methods
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });
    
    describe('createLogger', () => {
        it('should create logger with all methods', () => {
            const log = createLogger(mockContext);
            
            expect(log).toHaveProperty('error');
            expect(log).toHaveProperty('warn');
            expect(log).toHaveProperty('info');
            expect(log).toHaveProperty('debug');
            expect(log).toHaveProperty('logRequest');
            expect(log).toHaveProperty('logResponse');
            expect(log).toHaveProperty('logWebhook');
            expect(log).toHaveProperty('logSharePoint');
            expect(log).toHaveProperty('logPerformance');
        });
        
        it('should log error messages with context', () => {
            const log = createLogger(mockContext);
            
            log.error('Test error', { code: 'TEST001' });
            
            expect(mockContext.error).toHaveBeenCalledWith(
                expect.stringContaining('"level":"ERROR"')
            );
            expect(mockContext.error).toHaveBeenCalledWith(
                expect.stringContaining('"message":"Test error"')
            );
            expect(mockContext.error).toHaveBeenCalledWith(
                expect.stringContaining('"code":"TEST001"')
            );
        });
        
        it('should log info messages', () => {
            const log = createLogger(mockContext);
            
            log.info('Test info', { userId: '123' });
            
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"level":"INFO"')
            );
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"userId":"123"')
            );
        });
        
        it('should include invocation ID when available', () => {
            mockContext.invocationId = 'test-invocation-123';
            mockContext.functionName = 'test-function';
            
            const log = createLogger(mockContext);
            log.info('Test message');
            
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"invocationId":"test-invocation-123"')
            );
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"functionName":"test-function"')
            );
        });
        
        it('should fall back to console when context not available', () => {
            const log = createLogger();
            
            log.error('Console error');
            log.warn('Console warning');
            log.info('Console info');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('"level":"ERROR"')
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('"level":"WARN"')
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('"level":"INFO"')
            );
        });
    });
    
    describe('specialized logging methods', () => {
        it('should log HTTP requests', () => {
            const log = createLogger(mockContext);
            
            log.logRequest('POST', '/api/webhook', { 
                body: { test: 'data' },
                headers: { 'content-type': 'application/json' }
            });
            
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"category":"http_request"')
            );
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"method":"POST"')
            );
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"url":"/api/webhook"')
            );
        });
        
        it('should log HTTP responses with appropriate level', () => {
            const log = createLogger(mockContext);
            
            // Success response
            log.logResponse(200, 150, { size: 1024 });
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"level":"INFO"')
            );
            
            // Error response
            log.logResponse(500, 2000, { error: 'Internal error' });
            expect(mockContext.error).toHaveBeenCalledWith(
                expect.stringContaining('"level":"ERROR"')
            );
        });
        
        it('should log webhook operations', () => {
            const log = createLogger(mockContext);
            
            log.logWebhook('created', 'sub-123', { 
                resource: 'sites/test',
                expiresIn: '3 days'
            });
            
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"category":"webhook"')
            );
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"action":"created"')
            );
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"subscriptionId":"sub-123"')
            );
        });
        
        it('should log SharePoint operations', () => {
            const log = createLogger(mockContext);
            
            log.logSharePoint('get-item', 'lists/test-list/items/1', {
                fields: ['Title', 'Modified']
            });
            
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"category":"sharepoint"')
            );
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"operation":"get-item"')
            );
        });
        
        it('should log performance with warning for slow operations', () => {
            const log = createLogger(mockContext);
            
            // Fast operation
            log.logPerformance('database-query', 50);
            expect(mockContext.log).toHaveBeenCalledWith(
                expect.stringContaining('"level":"INFO"')
            );
            
            mockContext.log.mockClear();
            mockContext.warn.mockClear();
            
            // Slow operation (over 1 second)
            log.logPerformance('api-call', 1500);
            expect(mockContext.warn).toHaveBeenCalledWith(
                expect.stringContaining('"level":"WARN"')
            );
            expect(mockContext.warn).toHaveBeenCalledWith(
                expect.stringContaining('"duration":1500')
            );
        });
    });
    
    describe('log formatting', () => {
        it('should include timestamp in logs', () => {
            const log = createLogger();
            const beforeTime = new Date().toISOString();
            
            log.info('Test message');
            
            const afterTime = new Date().toISOString();
            
            const logCall = consoleLogSpy.mock.calls[0][0];
            const logData = JSON.parse(logCall);
            
            expect(new Date(logData.timestamp).toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(logData.timestamp >= beforeTime).toBe(true);
            expect(logData.timestamp <= afterTime).toBe(true);
        });
        
        it('should format log entries as valid JSON', () => {
            const log = createLogger();
            
            log.info('Test message', { 
                nested: { 
                    data: 'value',
                    array: [1, 2, 3]
                }
            });
            
            const logCall = consoleLogSpy.mock.calls[0][0];
            expect(() => JSON.parse(logCall)).not.toThrow();
            
            const parsed = JSON.parse(logCall);
            expect(parsed.nested.data).toBe('value');
            expect(parsed.nested.array).toEqual([1, 2, 3]);
        });
    });
    
    describe('default logger instance', () => {
        it('should provide a default logger', () => {
            expect(logger).toBeDefined();
            expect(logger.info).toBeDefined();
            expect(logger.error).toBeDefined();
            
            // Should work without context
            logger.info('Default logger test');
            expect(consoleLogSpy).toHaveBeenCalled();
        });
    });
});