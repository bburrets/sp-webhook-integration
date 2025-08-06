/**
 * Centralized error handling module for SharePoint webhook solution
 * Provides consistent error formatting and logging across all functions
 */

const config = require('./config');

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Error types enum for consistent error categorization
 */
const ErrorTypes = {
    VALIDATION: 'VALIDATION_ERROR',
    AUTHENTICATION: 'AUTHENTICATION_ERROR',
    AUTHORIZATION: 'AUTHORIZATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    RATE_LIMIT: 'RATE_LIMIT_ERROR',
    EXTERNAL_SERVICE: 'EXTERNAL_SERVICE_ERROR',
    INTERNAL: 'INTERNAL_ERROR'
};

/**
 * Handle and format errors consistently
 * @param {Error} error - The error to handle
 * @param {Object} context - Azure Functions context for logging
 * @returns {Object} Formatted error response
 */
function handleError(error, context) {
    // Log the error
    if (context) {
        context.error('Error occurred:', {
            name: error.name,
            message: error.message,
            statusCode: error.statusCode,
            details: error.details,
            stack: config.debug.showStackTraces ? error.stack : undefined
        });
    }

    // Determine error type and status code
    let statusCode = 500;
    let errorType = ErrorTypes.INTERNAL;
    let publicMessage = 'An unexpected error occurred';
    let details = null;

    if (error instanceof AppError) {
        statusCode = error.statusCode;
        publicMessage = error.message;
        details = error.details;
    } else if (error.response) {
        // Axios error
        statusCode = error.response.status || 500;
        
        if (statusCode === 401) {
            errorType = ErrorTypes.AUTHENTICATION;
            publicMessage = 'Authentication failed';
        } else if (statusCode === 403) {
            errorType = ErrorTypes.AUTHORIZATION;
            publicMessage = 'Access denied';
        } else if (statusCode === 404) {
            errorType = ErrorTypes.NOT_FOUND;
            publicMessage = 'Resource not found';
        } else if (statusCode === 409) {
            errorType = ErrorTypes.CONFLICT;
            publicMessage = 'Resource conflict';
        } else if (statusCode === 429) {
            errorType = ErrorTypes.RATE_LIMIT;
            publicMessage = 'Rate limit exceeded';
        } else if (statusCode >= 500) {
            errorType = ErrorTypes.EXTERNAL_SERVICE;
            publicMessage = 'External service error';
        }
        
        details = error.response.data;
    } else if (error.code) {
        // Node.js system errors
        if (error.code === 'ECONNREFUSED') {
            errorType = ErrorTypes.EXTERNAL_SERVICE;
            publicMessage = 'Unable to connect to service';
        } else if (error.code === 'ETIMEDOUT') {
            errorType = ErrorTypes.EXTERNAL_SERVICE;
            publicMessage = 'Request timeout';
        }
    }

    // Format the response
    const errorResponse = {
        error: {
            type: errorType,
            message: publicMessage,
            timestamp: new Date().toISOString(),
            requestId: context?.invocationId
        }
    };

    // Add details in development mode
    if (config.debug.isDevelopment) {
        errorResponse.error.details = details;
        errorResponse.error.stack = error.stack;
    }

    return {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'X-Error-Type': errorType
        },
        body: JSON.stringify(errorResponse)
    };
}

/**
 * Wrap an async handler function with error handling
 * @param {Function} handler - The async handler function to wrap
 * @returns {Function} Wrapped handler with error handling
 */
function wrapHandler(handler) {
    return async (request, context) => {
        try {
            return await handler(request, context);
        } catch (error) {
            return handleError(error, context);
        }
    };
}

/**
 * Create validation error
 * @param {string} message - Validation error message
 * @param {Object} details - Validation details
 * @returns {AppError} Validation error
 */
function validationError(message, details = null) {
    return new AppError(message, 400, details);
}

/**
 * Create authentication error
 * @param {string} message - Authentication error message
 * @returns {AppError} Authentication error
 */
function authenticationError(message = 'Authentication required') {
    return new AppError(message, 401);
}

/**
 * Create authorization error
 * @param {string} message - Authorization error message
 * @returns {AppError} Authorization error
 */
function authorizationError(message = 'Access denied') {
    return new AppError(message, 403);
}

/**
 * Create not found error
 * @param {string} resource - Resource that was not found
 * @returns {AppError} Not found error
 */
function notFoundError(resource = 'Resource') {
    return new AppError(`${resource} not found`, 404);
}

/**
 * Create conflict error
 * @param {string} message - Conflict error message
 * @param {Object} details - Conflict details
 * @returns {AppError} Conflict error
 */
function conflictError(message, details = null) {
    return new AppError(message, 409, details);
}

/**
 * Create rate limit error
 * @param {number} retryAfter - Seconds until rate limit resets
 * @returns {AppError} Rate limit error
 */
function rateLimitError(retryAfter = null) {
    const error = new AppError('Rate limit exceeded', 429);
    if (retryAfter) {
        error.details = { retryAfter };
    }
    return error;
}

module.exports = {
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
};