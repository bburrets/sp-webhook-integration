jest.mock('axios');
const axios = require('axios');
const { getAccessToken, clearTokenCache, isTokenValid } = require('../auth');

describe('auth module', () => {
    let mockContext;
    
    beforeEach(() => {
        mockContext = global.testHelpers.createMockContext();
        jest.clearAllMocks();
        // Clear token cache before each test
        clearTokenCache();
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
            expect(mockContext.log).toHaveBeenCalledWith('Fetching new access token from Azure AD');
            expect(mockContext.log).toHaveBeenCalledWith('Access token obtained successfully, expires in 3600 seconds (cache hit rate: 0%)');
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
                    access_token: mockToken,
                    expires_in: 3600
                }
            };
            
            axios.post.mockResolvedValue(mockResponse);
            
            const token = await getAccessToken();
            
            expect(token).toBe(mockToken);
            // Should not throw error when context is null
        });
        
        describe('token caching', () => {
            it('should cache token and reuse it', async () => {
                const mockToken = 'cached-access-token';
                const mockResponse = {
                    data: {
                        access_token: mockToken,
                        expires_in: 3600
                    }
                };
                
                axios.post.mockResolvedValue(mockResponse);
                
                // First call - should fetch from API
                const token1 = await getAccessToken(mockContext);
                expect(token1).toBe(mockToken);
                expect(axios.post).toHaveBeenCalledTimes(1);
                expect(mockContext.log).toHaveBeenCalledWith('Fetching new access token from Azure AD');
                
                // Clear logs
                mockContext.log.mockClear();
                
                // Second call - should use cache
                const token2 = await getAccessToken(mockContext);
                expect(token2).toBe(mockToken);
                expect(axios.post).toHaveBeenCalledTimes(1); // Still 1, not called again
                expect(mockContext.log).toHaveBeenCalledWith(expect.stringMatching(/^Returning cached access token \(cache hit rate: \d+%\)$/));
            });
            
            it('should force refresh when requested', async () => {
                const mockToken1 = 'first-token';
                const mockToken2 = 'refreshed-token';
                
                axios.post
                    .mockResolvedValueOnce({ data: { access_token: mockToken1, expires_in: 3600 } })
                    .mockResolvedValueOnce({ data: { access_token: mockToken2, expires_in: 3600 } });
                
                // First call
                const token1 = await getAccessToken(mockContext);
                expect(token1).toBe(mockToken1);
                
                // Force refresh
                const token2 = await getAccessToken(mockContext, true);
                expect(token2).toBe(mockToken2);
                expect(axios.post).toHaveBeenCalledTimes(2);
            });
            
            it('should refresh token when expired', async () => {
                const mockToken1 = 'expired-token';
                const mockToken2 = 'new-token';
                
                // First response with very short expiry
                axios.post.mockResolvedValueOnce({ 
                    data: { 
                        access_token: mockToken1, 
                        expires_in: 1 // 1 second
                    } 
                });
                
                const token1 = await getAccessToken(mockContext);
                expect(token1).toBe(mockToken1);
                
                // Wait for token to expire
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Second response
                axios.post.mockResolvedValueOnce({ 
                    data: { 
                        access_token: mockToken2, 
                        expires_in: 3600 
                    } 
                });
                
                const token2 = await getAccessToken(mockContext);
                expect(token2).toBe(mockToken2);
                expect(axios.post).toHaveBeenCalledTimes(2);
            }, 10000); // Increase timeout for this test
            
            it('should clear cache on error', async () => {
                const mockToken = 'valid-token';
                
                // First successful call
                axios.post.mockResolvedValueOnce({ 
                    data: { 
                        access_token: mockToken, 
                        expires_in: 3600 
                    } 
                });
                
                const token1 = await getAccessToken(mockContext);
                expect(token1).toBe(mockToken);
                expect(isTokenValid()).toBe(true);
                
                // Force refresh with error
                axios.post.mockRejectedValueOnce(new Error('Auth error'));
                
                await expect(getAccessToken(mockContext, true))
                    .rejects
                    .toThrow('Failed to obtain access token: Auth error');
                
                // Cache should be cleared
                expect(isTokenValid()).toBe(false);
            });
            
            it('should handle tokens with no expiry time', async () => {
                const mockToken = 'no-expiry-token';
                
                // Response without expires_in
                axios.post.mockResolvedValueOnce({ 
                    data: { 
                        access_token: mockToken
                    } 
                });
                
                const token = await getAccessToken(mockContext);
                expect(token).toBe(mockToken);
                expect(isTokenValid()).toBe(true); // Should still be valid with default expiry
            });
        });
    });
});