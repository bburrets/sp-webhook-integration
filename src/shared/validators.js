/**
 * Input validation module for SharePoint webhook solution
 * Provides schema validation and sanitization for incoming requests
 */

const { validationError, AppError } = require('./error-handler');

/**
 * Validate webhook notification payload
 * @param {Object} data - The notification data to validate
 * @returns {Object} Validated and sanitized data
 * @throws {AppError} If validation fails
 */
function validateWebhookNotification(data) {
    if (!data || typeof data !== 'object') {
        throw validationError('Invalid notification payload: must be an object');
    }

    if (!data.value || !Array.isArray(data.value)) {
        throw validationError('Invalid notification format: missing or invalid "value" array', {
            received: typeof data.value,
            expected: 'array'
        });
    }

    // Validate each notification in the array
    const validatedNotifications = [];
    for (let i = 0; i < data.value.length; i++) {
        const notification = data.value[i];
        
        if (!notification || typeof notification !== 'object') {
            throw validationError(`Invalid notification at index ${i}: must be an object`);
        }

        // Required fields
        if (!notification.subscriptionId || typeof notification.subscriptionId !== 'string') {
            throw validationError(`Invalid notification at index ${i}: missing or invalid subscriptionId`, {
                received: notification.subscriptionId
            });
        }

        if (!notification.resource || typeof notification.resource !== 'string') {
            throw validationError(`Invalid notification at index ${i}: missing or invalid resource`, {
                received: notification.resource
            });
        }

        if (!notification.changeType || typeof notification.changeType !== 'string') {
            throw validationError(`Invalid notification at index ${i}: missing or invalid changeType`, {
                received: notification.changeType
            });
        }

        // Validate changeType values (case-insensitive)
        const validChangeTypes = ['created', 'updated', 'deleted'];
        const normalizedChangeType = notification.changeType.toLowerCase();
        if (!validChangeTypes.includes(normalizedChangeType)) {
            throw validationError(`Invalid notification at index ${i}: invalid changeType value`, {
                received: notification.changeType,
                allowed: validChangeTypes
            });
        }

        // Optional but validated fields
        // Allow null for clientState - it will be enriched from tracking list
        if (notification.clientState !== undefined &&
            notification.clientState !== null &&
            typeof notification.clientState !== 'string') {
            throw validationError(`Invalid notification at index ${i}: clientState must be a string or null`, {
                received: typeof notification.clientState
            });
        }

        if (notification.tenantId && typeof notification.tenantId !== 'string') {
            throw validationError(`Invalid notification at index ${i}: tenantId must be a string`, {
                received: typeof notification.tenantId
            });
        }

        // Validate resourceData if present
        if (notification.resourceData) {
            if (typeof notification.resourceData !== 'object') {
                throw validationError(`Invalid notification at index ${i}: resourceData must be an object`, {
                    received: typeof notification.resourceData
                });
            }

            // SharePoint specific validation
            if (notification.resourceData['@odata.type'] && 
                !notification.resourceData['@odata.type'].startsWith('#Microsoft.Graph.')) {
                throw validationError(`Invalid notification at index ${i}: invalid @odata.type`, {
                    received: notification.resourceData['@odata.type']
                });
            }
        }

        // Add validated notification
        validatedNotifications.push({
            subscriptionId: notification.subscriptionId.trim(),
            resource: notification.resource.trim(),
            changeType: notification.changeType.toLowerCase(),
            clientState: notification.clientState,
            tenantId: notification.tenantId,
            resourceData: notification.resourceData
        });
    }

    return {
        value: validatedNotifications
    };
}

/**
 * Validate subscription creation request
 * @param {Object} data - The subscription data to validate
 * @returns {Object} Validated and sanitized data
 * @throws {AppError} If validation fails
 */
function validateSubscriptionRequest(data) {
    if (!data || typeof data !== 'object') {
        throw validationError('Invalid subscription request: must be an object');
    }

    // Required fields
    if (!data.resource || typeof data.resource !== 'string') {
        throw validationError('Missing or invalid resource field', {
            received: data.resource
        });
    }

    if (!data.changeType || typeof data.changeType !== 'string') {
        throw validationError('Missing or invalid changeType field', {
            received: data.changeType
        });
    }

    if (!data.notificationUrl || typeof data.notificationUrl !== 'string') {
        throw validationError('Missing or invalid notificationUrl field', {
            received: data.notificationUrl
        });
    }

    // Validate changeType
    const validChangeTypes = ['created', 'updated', 'deleted'];
    if (!validChangeTypes.includes(data.changeType)) {
        throw validationError('Invalid changeType value', {
            received: data.changeType,
            allowed: validChangeTypes
        });
    }

    // Validate notificationUrl is HTTPS
    try {
        const url = new URL(data.notificationUrl);
        if (url.protocol !== 'https:') {
            throw validationError('Notification URL must use HTTPS protocol', {
                received: url.protocol
            });
        }
    } catch (error) {
        if (error instanceof AppError) {
            throw error; // Re-throw our validation error
        }
        throw validationError('Invalid notification URL format', {
            received: data.notificationUrl,
            error: error.message
        });
    }

    // Validate resource format (SharePoint specific)
    const resourcePattern = /^sites\/[^\/]+:\/sites\/[^\/]+:\/lists\/[a-f0-9-]+$/;
    if (!resourcePattern.test(data.resource)) {
        throw validationError('Invalid resource format for SharePoint list', {
            received: data.resource,
            expected: 'sites/{domain}:/sites/{sitename}:/lists/{list-id}'
        });
    }

    // Optional fields validation
    if (data.expirationDateTime) {
        const expiration = new Date(data.expirationDateTime);
        if (isNaN(expiration.getTime())) {
            throw validationError('Invalid expirationDateTime format', {
                received: data.expirationDateTime
            });
        }

        // Check if expiration is in the future
        if (expiration <= new Date()) {
            throw validationError('Expiration date must be in the future', {
                received: data.expirationDateTime
            });
        }

        // SharePoint webhooks max 3 days
        const maxExpiration = new Date();
        maxExpiration.setDate(maxExpiration.getDate() + 3);
        if (expiration > maxExpiration) {
            throw validationError('Expiration date cannot exceed 3 days for SharePoint webhooks', {
                received: data.expirationDateTime,
                maxAllowed: maxExpiration.toISOString()
            });
        }
    }

    if (data.clientState && data.clientState.length > 128) {
        throw validationError('ClientState cannot exceed 128 characters', {
            length: data.clientState.length,
            maxLength: 128
        });
    }

    return {
        resource: data.resource.trim(),
        changeType: data.changeType.toLowerCase(),
        notificationUrl: data.notificationUrl.trim(),
        expirationDateTime: data.expirationDateTime,
        clientState: data.clientState
    };
}

/**
 * Validate resource identifier format
 * @param {string} resource - The resource string to validate
 * @returns {Object} Parsed resource components
 * @throws {AppError} If validation fails
 */
function validateResourceFormat(resource) {
    if (!resource || typeof resource !== 'string') {
        throw validationError('Resource must be a non-empty string');
    }

    const resourcePattern = /^sites\/([^\/]+):\/sites\/([^\/]+):\/lists\/([a-f0-9-]+)$/;
    const match = resource.match(resourcePattern);

    if (!match) {
        throw validationError('Invalid resource format', {
            received: resource,
            expected: 'sites/{domain}:/sites/{sitename}:/lists/{list-id}'
        });
    }

    return {
        domain: match[1],
        siteName: match[2],
        listId: match[3],
        fullResource: resource
    };
}

/**
 * Validate GUID format
 * @param {string} guid - The GUID to validate
 * @param {string} fieldName - The field name for error messages
 * @returns {string} Validated GUID
 * @throws {AppError} If validation fails
 */
function validateGuid(guid, fieldName = 'ID') {
    if (!guid || typeof guid !== 'string') {
        throw validationError(`${fieldName} must be a non-empty string`);
    }

    const guidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (!guidPattern.test(guid)) {
        throw validationError(`Invalid ${fieldName} format`, {
            received: guid,
            expected: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
        });
    }

    return guid.toLowerCase();
}

/**
 * Sanitize string input
 * @param {string} input - The string to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
function sanitizeString(input, maxLength = 1000) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    // Remove control characters and trim
    let sanitized = input.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();

    // Limit length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
}

module.exports = {
    validateWebhookNotification,
    validateSubscriptionRequest,
    validateResourceFormat,
    validateGuid,
    sanitizeString
};