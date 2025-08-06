const {
    AppError,
    ErrorTypes,
    handleError,
    wrapHandler,
    validationError,
    authenticationError,
    authorizationError,
    notFoundError,
    conflictError,
    rateLimitError
} = require('../error-handler');

describe('error-handler module', () => {
    let mockContext;
    
    beforeEach(() => {
        mockContext = global.testHelpers.createMockContext();
        jest.clearAllMocks();
    });
    
    describe('AppError', () => {
        it('should create custom error with default values', () => {
            const error = new AppError('Test error');
            
            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(500);
            expect(error.details).toBeNull();
            expect(error.name).toBe('AppError');
            expect(error.timestamp).toBeDefined();
            expect(error.stack).toBeDefined();
        });
        
        it('should create custom error with custom values', () => {
            const details = { field: 'email', issue: 'invalid format' };
            const error = new AppError('Validation failed', 400, details);
            
            expect(error.message).toBe('Validation failed');
            expect(error.statusCode).toBe(400);
            expect(error.details).toEqual(details);
        });
    });
    
    describe('handleError', () => {
        it('should handle AppError correctly', () => {
            const error = new AppError('Custom error', 403, { reason: 'test' });
            const response = handleError(error, mockContext);
            
            expect(response.status).toBe(403);
            expect(response.headers['Content-Type']).toBe('application/json');
            expect(response.headers['X-Error-Type']).toBe(ErrorTypes.INTERNAL);
            
            const body = JSON.parse(response.body);
            expect(body.error.message).toBe('Custom error');
            expect(body.error.requestId).toBe('test-invocation-id');
        });
        
        it('should handle axios 401 error', () => {
            const error = {
                response: {
                    status: 401,
                    data: { error: 'Unauthorized' }
                }
            };
            
            const response = handleError(error, mockContext);
            
            expect(response.status).toBe(401);
            const body = JSON.parse(response.body);
            expect(body.error.type).toBe(ErrorTypes.AUTHENTICATION);
            expect(body.error.message).toBe('Authentication failed');
        });
        
        it('should handle axios 429 error', () => {
            const error = {
                response: {
                    status: 429,
                    data: { retryAfter: 60 }
                }
            };
            
            const response = handleError(error, mockContext);
            
            expect(response.status).toBe(429);
            const body = JSON.parse(response.body);
            expect(body.error.type).toBe(ErrorTypes.RATE_LIMIT);
            expect(body.error.message).toBe('Rate limit exceeded');
        });
        
        it('should handle Node.js ECONNREFUSED error', () => {
            const error = new Error('Connection refused');
            error.code = 'ECONNREFUSED';
            
            const response = handleError(error, mockContext);
            
            expect(response.status).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error.type).toBe(ErrorTypes.EXTERNAL_SERVICE);
            expect(body.error.message).toBe('Unable to connect to service');
        });
        
        it('should include stack trace in development mode', () => {
            // Mock config to set development mode
            jest.resetModules();
            jest.doMock('../config', () => ({
                debug: {
                    isDevelopment: true,
                    showStackTraces: true
                },
                api: {
                    graph: {
                        baseUrl: 'https://graph.microsoft.com/v1.0',
                        scope: 'https://graph.microsoft.com/.default'
                    }
                }
            }));
            
            // Re-require the module with mocked config
            const { handleError: handleErrorDev } = require('../error-handler');
            
            const error = new Error('Test error');
            const response = handleErrorDev(error, mockContext);
            const body = JSON.parse(response.body);
            
            expect(body.error.stack).toBeDefined();
            
            // Reset modules
            jest.resetModules();
        });
    });
    
    describe('wrapHandler', () => {
        it('should execute handler successfully', async () => {
            const mockHandler = jest.fn().mockResolvedValue({
                status: 200,
                body: 'Success'
            });
            
            const wrapped = wrapHandler(mockHandler);
            const request = global.testHelpers.createMockRequest();
            
            const response = await wrapped(request, mockContext);
            
            expect(mockHandler).toHaveBeenCalledWith(request, mockContext);
            expect(response.status).toBe(200);
            expect(response.body).toBe('Success');
        });
        
        it('should catch and handle errors', async () => {
            const mockError = new AppError('Handler error', 400);
            const mockHandler = jest.fn().mockRejectedValue(mockError);
            
            const wrapped = wrapHandler(mockHandler);
            const request = global.testHelpers.createMockRequest();
            
            const response = await wrapped(request, mockContext);
            
            expect(response.status).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error.message).toBe('Handler error');
        });
    });
    
    describe('error factory functions', () => {
        it('validationError should create 400 error', () => {
            const error = validationError('Invalid input', { field: 'email' });
            
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe('Invalid input');
            expect(error.details).toEqual({ field: 'email' });
        });
        
        it('authenticationError should create 401 error', () => {
            const error = authenticationError();
            
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe('Authentication required');
        });
        
        it('authorizationError should create 403 error', () => {
            const error = authorizationError('Admin access required');
            
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe('Admin access required');
        });
        
        it('notFoundError should create 404 error', () => {
            const error = notFoundError('User');
            
            expect(error.statusCode).toBe(404);
            expect(error.message).toBe('User not found');
        });
        
        it('conflictError should create 409 error', () => {
            const error = conflictError('Duplicate entry', { id: '123' });
            
            expect(error.statusCode).toBe(409);
            expect(error.message).toBe('Duplicate entry');
            expect(error.details).toEqual({ id: '123' });
        });
        
        it('rateLimitError should create 429 error', () => {
            const error = rateLimitError(60);
            
            expect(error.statusCode).toBe(429);
            expect(error.message).toBe('Rate limit exceeded');
            expect(error.details).toEqual({ retryAfter: 60 });
        });
    });
});