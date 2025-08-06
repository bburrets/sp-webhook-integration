/**
 * Structured logging module for SharePoint webhook solution
 * Provides consistent log formatting and levels
 */

const config = require('./config');

// Log levels
const LogLevel = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
};

// Log level hierarchy
const levelPriority = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

/**
 * Get current log level from config
 * @returns {string} Current log level
 */
function getCurrentLogLevel() {
    const configLevel = config.logging?.level || 'INFO';
    return LogLevel[configLevel] || LogLevel.INFO;
}

/**
 * Check if a log level should be logged
 * @param {string} level - The log level to check
 * @returns {boolean} True if should log
 */
function shouldLog(level) {
    const currentLevel = getCurrentLogLevel();
    return levelPriority[level] <= levelPriority[currentLevel];
}

/**
 * Format log entry as structured JSON
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 * @param {Object} context - Azure Functions context
 * @returns {Object} Formatted log entry
 */
function formatLogEntry(level, message, data = {}, context = null) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...data
    };

    // Add function context if available
    if (context && context.invocationId) {
        entry.invocationId = context.invocationId;
        entry.functionName = context.functionName || 'unknown';
    }

    // Add request ID if available
    if (context && context.bindingData && context.bindingData.sys) {
        entry.requestId = context.bindingData.sys.methodName;
    }

    return entry;
}

/**
 * Log a message at specified level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 * @param {Object} context - Azure Functions context
 */
function log(level, message, data = {}, context = null) {
    if (!shouldLog(level)) {
        return;
    }

    const logEntry = formatLogEntry(level, message, data, context);

    // Use appropriate console method based on level
    switch (level) {
        case LogLevel.ERROR:
            if (context && context.error) {
                context.error(JSON.stringify(logEntry));
            } else {
                console.error(JSON.stringify(logEntry));
            }
            break;
        case LogLevel.WARN:
            if (context && context.warn) {
                context.warn(JSON.stringify(logEntry));
            } else {
                console.warn(JSON.stringify(logEntry));
            }
            break;
        default:
            if (context && context.log) {
                context.log(JSON.stringify(logEntry));
            } else {
                console.log(JSON.stringify(logEntry));
            }
    }
}

/**
 * Create a logger instance for a specific context
 * @param {Object} context - Azure Functions context
 * @returns {Object} Logger instance
 */
function createLogger(context = null) {
    return {
        error: (message, data = {}) => log(LogLevel.ERROR, message, data, context),
        warn: (message, data = {}) => log(LogLevel.WARN, message, data, context),
        info: (message, data = {}) => log(LogLevel.INFO, message, data, context),
        debug: (message, data = {}) => log(LogLevel.DEBUG, message, data, context),
        
        // Convenience methods for common scenarios
        logRequest: (method, url, data = {}) => {
            log(LogLevel.INFO, `${method} ${url}`, { 
                category: 'http_request',
                method,
                url,
                ...data 
            }, context);
        },
        
        logResponse: (status, duration, data = {}) => {
            const level = status >= 400 ? LogLevel.ERROR : LogLevel.INFO;
            log(level, `Response ${status} in ${duration}ms`, {
                category: 'http_response',
                status,
                duration,
                ...data
            }, context);
        },
        
        logWebhook: (action, subscriptionId, data = {}) => {
            log(LogLevel.INFO, `Webhook ${action}: ${subscriptionId}`, {
                category: 'webhook',
                action,
                subscriptionId,
                ...data
            }, context);
        },
        
        logSharePoint: (operation, resource, data = {}) => {
            log(LogLevel.INFO, `SharePoint ${operation}: ${resource}`, {
                category: 'sharepoint',
                operation,
                resource,
                ...data
            }, context);
        },
        
        logPerformance: (operation, duration, data = {}) => {
            const level = duration > 1000 ? LogLevel.WARN : LogLevel.INFO;
            log(level, `${operation} completed in ${duration}ms`, {
                category: 'performance',
                operation,
                duration,
                ...data
            }, context);
        }
    };
}

/**
 * Default logger instance
 */
const logger = createLogger();

module.exports = {
    createLogger,
    logger,
    LogLevel
};