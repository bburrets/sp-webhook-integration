jest.mock('axios');
const axios = require('axios');
const { getAccessToken } = require('../auth');

describe('auth module', () => {
    let mockContext;
    
    beforeEach(() => {
        mockContext = global.testHelpers.createMockContext();
        jest.clearAllMocks();
    });
    
    describe('getAccessToken', () => {
        it('should successfully obtain access token', async () => {
            const mockToken = 'mock-access-token';
            const mockResponse = {
                data: {
                    access_token: mockToken,
                    token_type: 'Bearer',
                    expires_in: 3600
                }
            };
            
            axios.post.mockResolvedValue(mockResponse);
            
            const token = await getAccessToken(mockContext);
            
            expect(token).toBe(mockToken);
            expect(mockContext.log).toHaveBeenCalledWith('Access token obtained successfully');
            expect(axios.post).toHaveBeenCalledWith(
                'https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/token',
                expect.any(URLSearchParams),
                expect.objectContaining({
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                })
            );
        });
        
        it('should throw error when credentials are missing', async () => {
            // Mock the config module to have missing credentials
            jest.resetModules();
            jest.doMock('../config', () => ({
                azure: {
                    clientId: undefined,
                    clientSecret: 'test-secret',
                    tenantId: 'test-tenant'
                },
                api: {
                    graph: {
                        scope: 'https://graph.microsoft.com/.default'
                    }
                }
            }));
            
            // Re-require the auth module with mocked config
            const { getAccessToken: getAccessTokenMocked } = require('../auth');
            
            await expect(getAccessTokenMocked(mockContext))
                .rejects
                .toThrow('Missing required Azure AD credentials in environment variables');
            
            // Reset modules
            jest.resetModules();
        });
        
        it('should handle token request failure', async () => {
            const mockError = {
                response: {
                    data: {
                        error: 'invalid_client',
                        error_description: 'Invalid client credentials'
                    }
                }
            };
            
            axios.post.mockRejectedValue(mockError);
            
            await expect(getAccessToken(mockContext))
                .rejects
                .toThrow('Failed to obtain access token: Invalid client credentials');
            
            expect(mockContext.error).toHaveBeenCalledWith(
                'Error getting access token:',
                mockError.response.data
            );
        });
        
        it('should handle network errors', async () => {
            const mockError = new Error('Network error');
            mockError.code = 'ECONNREFUSED';
            
            axios.post.mockRejectedValue(mockError);
            
            await expect(getAccessToken(mockContext))
                .rejects
                .toThrow('Failed to obtain access token: Network error');
            
            expect(mockContext.error).toHaveBeenCalledWith(
                'Error getting access token:',
                'Network error'
            );
        });
        
        it('should work without context parameter', async () => {
            const mockToken = 'mock-access-token';
            const mockResponse = {
                data: {
                    access_token: mockToken
                }
            };
            
            axios.post.mockResolvedValue(mockResponse);
            
            const token = await getAccessToken();
            
            expect(token).toBe(mockToken);
            // Should not throw error when context is null
        });
    });
});