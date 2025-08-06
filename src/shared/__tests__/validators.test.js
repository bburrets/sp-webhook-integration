const {
    validateWebhookNotification,
    validateSubscriptionRequest,
    validateResourceFormat,
    validateGuid,
    sanitizeString
} = require('../validators');

describe('validators module', () => {
    describe('validateWebhookNotification', () => {
        it('should validate correct notification payload', () => {
            const payload = {
                value: [{
                    subscriptionId: '123e4567-e89b-12d3-a456-426614174000',
                    resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123e4567-e89b-12d3-a456-426614174000',
                    changeType: 'updated',
                    clientState: 'myState',
                    tenantId: '456e7890-e89b-12d3-a456-426614174000',
                    resourceData: {
                        '@odata.type': '#Microsoft.Graph.ListItem',
                        id: '123'
                    }
                }]
            };

            const result = validateWebhookNotification(payload);
            
            expect(result.value).toHaveLength(1);
            expect(result.value[0].subscriptionId).toBe('123e4567-e89b-12d3-a456-426614174000');
            expect(result.value[0].changeType).toBe('updated');
        });

        it('should throw error for missing value array', () => {
            expect(() => validateWebhookNotification({}))
                .toThrow('Invalid notification format: missing or invalid "value" array');
        });

        it('should throw error for non-array value', () => {
            expect(() => validateWebhookNotification({ value: 'not-array' }))
                .toThrow('Invalid notification format: missing or invalid "value" array');
        });

        it('should throw error for missing subscriptionId', () => {
            const payload = {
                value: [{
                    resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123',
                    changeType: 'updated'
                }]
            };

            expect(() => validateWebhookNotification(payload))
                .toThrow('Invalid notification at index 0: missing or invalid subscriptionId');
        });

        it('should throw error for invalid changeType', () => {
            const payload = {
                value: [{
                    subscriptionId: '123',
                    resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123',
                    changeType: 'invalid'
                }]
            };

            expect(() => validateWebhookNotification(payload))
                .toThrow('Invalid notification at index 0: invalid changeType value');
        });

        it('should normalize changeType to lowercase', () => {
            const payload = {
                value: [{
                    subscriptionId: '123',
                    resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123',
                    changeType: 'UPDATED'
                }]
            };

            const result = validateWebhookNotification(payload);
            expect(result.value[0].changeType).toBe('updated');
        });

        it('should validate @odata.type if present', () => {
            const payload = {
                value: [{
                    subscriptionId: '123',
                    resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123',
                    changeType: 'updated',
                    resourceData: {
                        '@odata.type': 'InvalidType'
                    }
                }]
            };

            expect(() => validateWebhookNotification(payload))
                .toThrow('Invalid notification at index 0: invalid @odata.type');
        });
    });

    describe('validateSubscriptionRequest', () => {
        it('should validate correct subscription request', () => {
            const request = {
                resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123e4567-e89b-12d3-a456-426614174000',
                changeType: 'updated',
                notificationUrl: 'https://example.com/webhook',
                expirationDateTime: new Date(Date.now() + 86400000).toISOString(), // +1 day
                clientState: 'myState'
            };

            const result = validateSubscriptionRequest(request);
            
            expect(result.resource).toBe(request.resource);
            expect(result.changeType).toBe('updated');
            expect(result.notificationUrl).toBe(request.notificationUrl);
        });

        it('should throw error for missing required fields', () => {
            expect(() => validateSubscriptionRequest({}))
                .toThrow('Missing or invalid resource field');

            expect(() => validateSubscriptionRequest({ resource: 'test' }))
                .toThrow('Missing or invalid changeType field');

            expect(() => validateSubscriptionRequest({ resource: 'test', changeType: 'updated' }))
                .toThrow('Missing or invalid notificationUrl field');
        });

        it('should throw error for non-HTTPS notification URL', () => {
            const request = {
                resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123',
                changeType: 'updated',
                notificationUrl: 'http://example.com/webhook'
            };

            expect(() => validateSubscriptionRequest(request))
                .toThrow('Notification URL must use HTTPS protocol');
        });

        it('should throw error for invalid resource format', () => {
            const request = {
                resource: 'invalid-resource-format',
                changeType: 'updated',
                notificationUrl: 'https://example.com/webhook'
            };

            expect(() => validateSubscriptionRequest(request))
                .toThrow('Invalid resource format for SharePoint list');
        });

        it('should throw error for past expiration date', () => {
            const request = {
                resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123e4567-e89b-12d3-a456-426614174000',
                changeType: 'updated',
                notificationUrl: 'https://example.com/webhook',
                expirationDateTime: new Date(Date.now() - 86400000).toISOString() // -1 day
            };

            expect(() => validateSubscriptionRequest(request))
                .toThrow('Expiration date must be in the future');
        });

        it('should throw error for expiration beyond 3 days', () => {
            const request = {
                resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123e4567-e89b-12d3-a456-426614174000',
                changeType: 'updated',
                notificationUrl: 'https://example.com/webhook',
                expirationDateTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString() // +4 days
            };

            expect(() => validateSubscriptionRequest(request))
                .toThrow('Expiration date cannot exceed 3 days for SharePoint webhooks');
        });

        it('should throw error for clientState exceeding 128 characters', () => {
            const request = {
                resource: 'sites/example.sharepoint.com:/sites/mysite:/lists/123e4567-e89b-12d3-a456-426614174000',
                changeType: 'updated',
                notificationUrl: 'https://example.com/webhook',
                clientState: 'a'.repeat(129)
            };

            expect(() => validateSubscriptionRequest(request))
                .toThrow('ClientState cannot exceed 128 characters');
        });
    });

    describe('validateResourceFormat', () => {
        it('should parse valid resource format', () => {
            const resource = 'sites/example.sharepoint.com:/sites/mysite:/lists/123e4567-e89b-12d3-a456-426614174000';
            const result = validateResourceFormat(resource);
            
            expect(result.domain).toBe('example.sharepoint.com');
            expect(result.siteName).toBe('mysite');
            expect(result.listId).toBe('123e4567-e89b-12d3-a456-426614174000');
            expect(result.fullResource).toBe(resource);
        });

        it('should throw error for invalid format', () => {
            expect(() => validateResourceFormat('invalid'))
                .toThrow('Invalid resource format');
        });

        it('should throw error for non-string input', () => {
            expect(() => validateResourceFormat(null))
                .toThrow('Resource must be a non-empty string');
        });
    });

    describe('validateGuid', () => {
        it('should validate correct GUID format', () => {
            const guid = '123e4567-e89b-12d3-a456-426614174000';
            const result = validateGuid(guid);
            
            expect(result).toBe(guid);
        });

        it('should convert to lowercase', () => {
            const guid = '123E4567-E89B-12D3-A456-426614174000';
            const result = validateGuid(guid);
            
            expect(result).toBe(guid.toLowerCase());
        });

        it('should throw error for invalid format', () => {
            expect(() => validateGuid('not-a-guid'))
                .toThrow('Invalid ID format');
        });

        it('should use custom field name in error', () => {
            expect(() => validateGuid('invalid', 'subscriptionId'))
                .toThrow('Invalid subscriptionId format');
        });
    });

    describe('sanitizeString', () => {
        it('should trim whitespace', () => {
            expect(sanitizeString('  test  ')).toBe('test');
        });

        it('should remove control characters', () => {
            expect(sanitizeString('test\x00\x1F\x7F')).toBe('test');
        });

        it('should limit length', () => {
            const longString = 'a'.repeat(2000);
            expect(sanitizeString(longString, 100)).toHaveLength(100);
        });

        it('should return empty string for non-string input', () => {
            expect(sanitizeString(null)).toBe('');
            expect(sanitizeString(undefined)).toBe('');
            expect(sanitizeString(123)).toBe('');
        });
    });
});