/**
 * UiPath Queue Client Module
 * Handles queue item submission to UiPath Orchestrator with retry logic and error handling
 */

const axiosRetry = require('axios-retry').default;
const config = require('./config');
const { createLogger } = require('./logger');
const { createUiPathAuth } = require('./uipath-auth');
const { AppError, validationError } = require('./error-handler');
const {
    UIPATH_PRIORITY,
    UIPATH_QUEUE_STATUS,
    UIPATH_API_ENDPOINTS,
    SHAREPOINT_FIELD_MAPPINGS,
    SERVICE_NAMES,
    ERROR_MESSAGES
} = require('./constants');

/**
 * Queue item priority levels
 * @deprecated Use UIPATH_PRIORITY from constants instead
 */
const Priority = UIPATH_PRIORITY;

/**
 * Queue item status values
 * @deprecated Use UIPATH_QUEUE_STATUS from constants instead
 */
const QueueItemStatus = UIPATH_QUEUE_STATUS;

/**
 * UiPath Queue Client
 */
class UiPathQueueClient {
    constructor(context = null) {
        this.logger = createLogger(context);
        this.auth = createUiPathAuth(context);
        this.defaultQueue = config.uipath.defaultQueue;
        
        // Validate UiPath is enabled
        if (!config.uipath.features.enabled) {
            this.logger.warn(ERROR_MESSAGES.UIPATH_DISABLED, {
                service: SERVICE_NAMES.UIPATH_QUEUE_CLIENT,
                feature: 'queue_client'
            });
        }
    }

    /**
     * Setup retry logic for HTTP client
     * @param {Object} httpClient - Axios instance
     */
    setupRetryLogic(httpClient) {
        if (!config.uipath.features.autoRetry) {
            return;
        }

        axiosRetry(httpClient, {
            retries: config.uipath.api.retryAttempts,
            retryDelay: (retryCount) => {
                const delay = config.uipath.api.retryDelay * Math.pow(2, retryCount - 1);
                this.logger.debug('Retrying UiPath request', {
                    service: 'uipath',
                    retryCount,
                    delay
                });
                return delay;
            },
            retryCondition: (error) => {
                // Retry on network errors and 5xx responses
                return axiosRetry.isNetworkError(error) || 
                       axiosRetry.isRetryableError(error) ||
                       (error.response?.status >= 500);
            },
            onRetry: (retryCount, error, requestConfig) => {
                this.logger.warn('Retrying UiPath request', {
                    service: 'uipath',
                    retryCount,
                    url: requestConfig.url,
                    method: requestConfig.method,
                    error: error.message
                });
            }
        });
    }

    /**
     * Validate queue item data
     * @param {Object} queueItem - Queue item to validate
     * @throws {AppError} If validation fails
     */
    validateQueueItem(queueItem) {
        if (!queueItem) {
            throw validationError(ERROR_MESSAGES.QUEUE_ITEM_REQUIRED);
        }

        if (!queueItem.Name) {
            throw validationError(ERROR_MESSAGES.QUEUE_NAME_REQUIRED);
        }

        if (queueItem.Priority && !Object.values(Priority).includes(queueItem.Priority)) {
            throw validationError(
                `Invalid priority. Must be one of: ${Object.values(Priority).join(', ')}`,
                { providedPriority: queueItem.Priority }
            );
        }

        // Validate specific content if provided
        if (queueItem.SpecificContent) {
            if (typeof queueItem.SpecificContent !== 'object') {
                throw validationError('SpecificContent must be an object');
            }

            // Check for circular references
            try {
                JSON.stringify(queueItem.SpecificContent);
            } catch (error) {
                throw validationError('SpecificContent contains circular references or invalid data');
            }
        }
    }

    /**
     * Encode SharePoint field names for UiPath consumption
     * SharePoint internal names may contain encoded characters like _x0020_ for spaces
     * @param {Object} data - Data object with SharePoint field names
     * @returns {Object} Data with properly encoded field names
     */
    encodeSharePointFields(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const encoded = {};
        
        for (const [key, value] of Object.entries(data)) {
            // Handle common SharePoint field encodings
            let encodedKey = key;
            
            // Common SharePoint field name transformations
            const fieldMappings = {
                'Ship To Email': 'Ship_x0020_To_x0020_Email',
                'Ship Date': 'Ship_x0020_Date',
                'PO_no': 'PO_x005f_no',
                'Generated Routing Form URL': 'Generated_x0020_Routing_x0020_Form_x0020_URL'
            };

            // Use mapping if available, otherwise encode spaces and special characters
            if (fieldMappings[key]) {
                encodedKey = fieldMappings[key];
            } else {
                encodedKey = key
                    .replace(/ /g, '_x0020_')  // Space
                    .replace(/_/g, '_x005f_')  // Underscore (only if not already encoded)
                    .replace(/&/g, '_x0026_')  // Ampersand
                    .replace(/'/g, '_x0027_')  // Apostrophe
                    .replace(/\(/g, '_x0028_')  // Left parenthesis
                    .replace(/\)/g, '_x0029_'); // Right parenthesis
            }

            encoded[encodedKey] = value;
        }

        this.logger.debug('Encoded SharePoint field names for UiPath', {
            service: 'uipath',
            originalFields: Object.keys(data),
            encodedFields: Object.keys(encoded)
        });

        return encoded;
    }

    /**
     * Flatten nested objects into key-value pairs for UiPath
     * UiPath SpecificContent requires flat structure, not nested objects
     * @param {Object} obj - Object to flatten
     * @param {string} prefix - Prefix for nested keys
     * @returns {Object} Flattened object
     */
    flattenObject(obj, prefix = '') {
        const flattened = {};
        
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}_${key}` : key;
            
            if (value === null || value === undefined) {
                flattened[newKey] = '';
            } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                // Recursively flatten nested objects
                Object.assign(flattened, this.flattenObject(value, newKey));
            } else if (Array.isArray(value)) {
                // Convert arrays to comma-separated strings
                flattened[newKey] = value.join(',');
            } else if (value instanceof Date) {
                // Convert dates to ISO strings
                flattened[newKey] = value.toISOString();
            } else {
                // Simple values
                flattened[newKey] = String(value);
            }
        }
        
        return flattened;
    }

    /**
     * Create queue item payload
     * @param {string} queueName - Name of the queue
     * @param {Object} itemData - Queue item data
     * @returns {Object} Queue item payload
     */
    createQueueItemPayload(queueName, itemData) {
        // Process SpecificContent - always flatten for UiPath
        let processedContent = {};
        
        if (itemData.specificContent) {
            // Always flatten the entire structure for UiPath
            // UiPath SpecificContent expects flat key-value pairs, not nested objects
            processedContent = this.flattenObject(itemData.specificContent);
            
            // Apply SharePoint field encoding after flattening
            processedContent = this.encodeSharePointFields(processedContent);
            
            this.logger.debug('Flattened SpecificContent for UiPath', {
                service: 'uipath',
                originalKeys: Object.keys(itemData.specificContent),
                flattenedKeys: Object.keys(processedContent).slice(0, 10), // Show first 10 keys
                totalFields: Object.keys(processedContent).length
            });
        }

        const payload = {
            itemData: {
                Name: queueName, // Must match the queue name exactly
                Priority: itemData.priority || Priority.NORMAL,
                SpecificContent: processedContent,
                Reference: itemData.reference || null,
                DeferDate: itemData.deferDate || null,
                DueDate: itemData.dueDate || null
            }
        };

        // Add output data if provided
        if (itemData.outputData) {
            payload.itemData.OutputData = itemData.outputData;
        }

        // Add analytics if provided
        if (itemData.analytics) {
            payload.itemData.Analytics = itemData.analytics;
        }

        this.logger.debug('Created UiPath queue item payload', {
            service: 'uipath',
            queueName,
            payloadStructure: {
                hasSpecificContent: !!processedContent && Object.keys(processedContent).length > 0,
                specificContentKeys: Object.keys(processedContent),
                priority: payload.itemData.Priority,
                hasReference: !!payload.itemData.Reference
            }
        });

        return payload;
    }

    /**
     * Validate UiPath API payload structure
     * @param {Object} payload - Payload to validate
     * @param {string} queueName - Target queue name
     * @throws {AppError} If payload is invalid
     */
    validateApiPayload(payload, queueName) {
        if (!payload || !payload.itemData) {
            throw validationError('UiPath API payload must contain itemData object');
        }

        const itemData = payload.itemData;

        // Critical validation: Name must match queue name
        if (itemData.Name !== queueName) {
            throw validationError(
                `UiPath itemData.Name (${itemData.Name}) must exactly match target queue name (${queueName})`
            );
        }

        // Validate required fields
        if (!itemData.Name) {
            throw validationError('UiPath itemData.Name is required');
        }

        // Validate SpecificContent structure
        if (itemData.SpecificContent !== null && itemData.SpecificContent !== undefined) {
            if (typeof itemData.SpecificContent !== 'object') {
                throw validationError('UiPath itemData.SpecificContent must be an object or null');
            }

            // Check for invalid SpecificContent values
            for (const [key, value] of Object.entries(itemData.SpecificContent)) {
                if (value === undefined) {
                    throw validationError(
                        `UiPath SpecificContent contains undefined value for key: ${key}`
                    );
                }
                if (typeof value === 'function') {
                    throw validationError(
                        `UiPath SpecificContent contains function for key: ${key}`
                    );
                }
            }
        }

        this.logger.debug('UiPath API payload validation passed', {
            service: 'uipath',
            queueName,
            validation: {
                hasItemData: !!payload.itemData,
                nameMatches: itemData.Name === queueName,
                hasSpecificContent: !!itemData.SpecificContent,
                specificContentKeys: itemData.SpecificContent ? Object.keys(itemData.SpecificContent) : []
            }
        });
    }

    /**
     * Submit item to UiPath queue
     * @param {string} queueName - Name of the queue (optional, uses default if not provided)
     * @param {Object} itemData - Queue item data
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Queue item submission result
     */
    async submitQueueItem(queueName = null, itemData = {}, options = {}) {
        if (!config.uipath.features.enabled) {
            this.logger.warn('UiPath integration is disabled - skipping queue submission', {
                service: 'uipath',
                queueName: queueName || this.defaultQueue
            });
            return {
                success: false,
                reason: 'UiPath integration disabled',
                queueName: queueName || this.defaultQueue
            };
        }

        // Define apiUrl outside try block so it's available in catch block
        const targetQueue = queueName || this.defaultQueue;
        const apiUrl = `${config.uipath.orchestratorUrl}${UIPATH_API_ENDPOINTS.ADD_QUEUE_ITEM}`;
        
        try {
            if (!targetQueue) {
                throw validationError('Queue name is required (not provided and no default configured)');
            }

            // Create queue item payload
            const queueItemPayload = this.createQueueItemPayload(targetQueue, itemData);
            
            // Validate the API payload structure
            this.validateApiPayload(queueItemPayload, targetQueue);
            
            // Validate the queue item data
            this.validateQueueItem(queueItemPayload.itemData);

            this.logger.info('Submitting item to UiPath queue', {
                service: 'uipath',
                queueName: targetQueue,
                priority: queueItemPayload.itemData.Priority,
                reference: queueItemPayload.itemData.Reference,
                hasSpecificContent: !!queueItemPayload.itemData.SpecificContent,
                specificContentKeys: queueItemPayload.itemData.SpecificContent ? 
                    Object.keys(queueItemPayload.itemData.SpecificContent) : []
            });

            // Get authenticated HTTP client
            const httpClient = await this.auth.getAuthenticatedClient();
            
            // Setup retry logic
            this.setupRetryLogic(httpClient);

            const startTime = Date.now();
            
            // Log the exact payload being sent for debugging
            this.logger.info('Sending UiPath API request', {
                service: 'uipath',
                url: apiUrl,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-UIPATH-OrganizationUnitId': config.uipath.organizationUnitId,
                    'Authorization': '[REDACTED]'
                },
                payloadStructure: {
                    hasItemData: !!queueItemPayload.itemData,
                    itemDataKeys: queueItemPayload.itemData ? Object.keys(queueItemPayload.itemData) : [],
                    queueName: queueItemPayload.itemData?.Name,
                    priority: queueItemPayload.itemData?.Priority,
                    hasSpecificContent: !!queueItemPayload.itemData?.SpecificContent,
                    specificContentKeys: queueItemPayload.itemData?.SpecificContent ? 
                        Object.keys(queueItemPayload.itemData.SpecificContent).slice(0, 10) : [],
                    specificContentSample: queueItemPayload.itemData?.SpecificContent ? 
                        JSON.stringify(queueItemPayload.itemData.SpecificContent).substring(0, 200) : null
                }
            });
            
            // Log the actual JSON payload for critical debugging
            this.logger.warn('DEBUG: Full UiPath payload', {
                service: 'uipath',
                payload: JSON.stringify(queueItemPayload)
            });

            // Submit queue item - UiPath expects itemData wrapper
            const response = await httpClient.post(
                apiUrl,
                queueItemPayload,  // Send the full payload with itemData wrapper
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-UIPATH-OrganizationUnitId': config.uipath.organizationUnitId
                    },
                    timeout: config.uipath.api.timeout
                }
            );

            const duration = Date.now() - startTime;

            // Validate response
            if (!response.data || !response.data.Id) {
                throw new AppError(
                    'Invalid response from UiPath queue submission',
                    500,
                    { response: response.data }
                );
            }

            const result = {
                success: true,
                queueItemId: response.data.Id,
                queueName: targetQueue,
                status: response.data.Status,
                creationTime: response.data.CreationTime,
                priority: response.data.Priority,
                reference: response.data.Reference,
                duration
            };

            this.logger.info('Successfully submitted item to UiPath queue', {
                service: 'uipath',
                ...result
            });

            return result;

        } catch (error) {
            const errorDetails = {
                service: 'uipath',
                queueName: queueName || this.defaultQueue,
                error: error.message,
                status: error.response?.status,
                responseData: error.response?.data,
                requestUrl: error.config?.url,
                requestMethod: error.config?.method
            };

            this.logger.error('Failed to submit item to UiPath queue', errorDetails);

            // Re-throw validation errors as-is
            if (error instanceof AppError && error.statusCode < 500) {
                throw error;
            }

            // Handle specific UiPath errors with enhanced diagnostics
            if (error.response?.status === 400) {
                const responseMessage = error.response.data?.message || 
                                      error.response.data?.error?.message || 
                                      'Invalid request';
                
                // Check for the specific "queueItemParameters must not be null" error
                if (responseMessage.includes('queueItemParameters must not be null')) {
                    throw validationError(
                        'UiPath API rejected payload: queueItemParameters must not be null. ' +
                        'This usually indicates a mismatch between the queue name in the URL and payload, ' +
                        'or invalid SpecificContent structure.',
                        {
                            originalError: error.response.data,
                            diagnostics: {
                                queueName: queueName || this.defaultQueue,
                                payloadQueueName: itemData.Name || 'MISSING',
                                apiEndpoint: apiUrl,
                                suggestion: 'Verify queue name matches exactly between URL and payload.itemData.Name'
                            }
                        }
                    );
                } else {
                    throw validationError(
                        `UiPath API validation error: ${responseMessage}`,
                        { 
                            originalError: error.response.data,
                            statusCode: 400
                        }
                    );
                }
            } else if (error.response?.status === 401) {
                throw new AppError(
                    'UiPath authentication failed - check credentials and token validity',
                    401
                );
            } else if (error.response?.status === 403) {
                throw new AppError(
                    'UiPath authorization failed - check permissions for queue operations',
                    403
                );
            } else if (error.response?.status === 404) {
                throw new AppError(
                    `UiPath queue '${queueName || this.defaultQueue}' not found - verify queue exists and organization unit ID is correct`,
                    404
                );
            } else if (error.response?.status >= 500) {
                throw new AppError(
                    'UiPath Orchestrator server error - retry may succeed',
                    error.response.status,
                    { originalError: error.response.data }
                );
            }

            // Network or other errors
            if (error.code === 'ECONNREFUSED') {
                throw new AppError(
                    'Cannot connect to UiPath Orchestrator - check URL and network connectivity',
                    503
                );
            } else if (error.code === 'ETIMEDOUT') {
                throw new AppError(
                    'UiPath API request timed out - check network connectivity or increase timeout',
                    408
                );
            }

            throw new AppError(
                'Failed to submit queue item to UiPath',
                500,
                { originalError: error.message }
            );
        }
    }

    /**
     * Get queue items with optional filtering
     * @param {string} queueName - Name of the queue
     * @param {Object} filters - OData filters
     * @returns {Promise<Array>} Array of queue items
     */
    async getQueueItems(queueName = null, filters = {}) {
        if (!config.uipath.features.enabled) {
            throw new AppError('UiPath integration is disabled', 503);
        }

        try {
            const targetQueue = queueName || this.defaultQueue;
            
            if (!targetQueue) {
                throw validationError('Queue name is required');
            }

            // Build OData query parameters
            const queryParams = new URLSearchParams();
            
            // Filter by queue name
            let filter = `QueueDefinition/Name eq '${targetQueue}'`;
            
            // Add additional filters
            if (filters.status) {
                filter += ` and Status eq '${filters.status}'`;
            }
            
            if (filters.reference) {
                filter += ` and Reference eq '${filters.reference}'`;
            }
            
            if (filters.fromDate) {
                filter += ` and CreationTime ge ${filters.fromDate}`;
            }
            
            if (filters.toDate) {
                filter += ` and CreationTime le ${filters.toDate}`;
            }
            
            queryParams.append('$filter', filter);
            
            // Add ordering
            queryParams.append('$orderby', 'CreationTime desc');
            
            // Add top/limit
            if (filters.top) {
                queryParams.append('$top', filters.top);
            }

            this.logger.info('Retrieving UiPath queue items', {
                service: 'uipath',
                queueName: targetQueue,
                filter,
                top: filters.top
            });

            // Get authenticated HTTP client
            const httpClient = await this.auth.getAuthenticatedClient();

            const response = await httpClient.get(
                `${config.uipath.orchestratorUrl}/odata/QueueItems?${queryParams.toString()}`
            );

            const items = response.data?.value || [];

            this.logger.info('Retrieved UiPath queue items', {
                service: 'uipath',
                queueName: targetQueue,
                itemCount: items.length
            });

            return items;

        } catch (error) {
            this.logger.error('Failed to retrieve UiPath queue items', {
                service: 'uipath',
                queueName: queueName || this.defaultQueue,
                error: error.message,
                status: error.response?.status
            });

            throw new AppError(
                'Failed to retrieve queue items from UiPath',
                500,
                { originalError: error.message }
            );
        }
    }

    /**
     * Get specific queue item by ID
     * @param {string} queueItemId - Queue item ID
     * @returns {Promise<Object>} Queue item details
     */
    async getQueueItem(queueItemId) {
        if (!config.uipath.features.enabled) {
            throw new AppError('UiPath integration is disabled', 503);
        }

        if (!queueItemId) {
            throw validationError('Queue item ID is required');
        }

        try {
            this.logger.info('Retrieving UiPath queue item', {
                service: 'uipath',
                queueItemId
            });

            // Get authenticated HTTP client
            const httpClient = await this.auth.getAuthenticatedClient();

            const response = await httpClient.get(
                `${config.uipath.orchestratorUrl}/odata/QueueItems(${queueItemId})`
            );

            this.logger.info('Retrieved UiPath queue item', {
                service: 'uipath',
                queueItemId,
                status: response.data?.Status
            });

            return response.data;

        } catch (error) {
            this.logger.error('Failed to retrieve UiPath queue item', {
                service: 'uipath',
                queueItemId,
                error: error.message,
                status: error.response?.status
            });

            if (error.response?.status === 404) {
                throw new AppError(`Queue item ${queueItemId} not found`, 404);
            }

            throw new AppError(
                'Failed to retrieve queue item from UiPath',
                500,
                { originalError: error.message }
            );
        }
    }

    /**
     * Create a COSTCO-specific queue item
     * @param {Object} costcoData - COSTCO-specific data
     * @returns {Promise<Object>} Queue submission result
     */
    async submitCostcoItem(costcoData) {
        const requiredFields = ['Ship_x0020_To_x0020_Email', 'Ship_x0020_Date', 'Style', 'PO_x005f_no'];
        const missingFields = requiredFields.filter(field => !costcoData[field]);
        
        if (missingFields.length > 0) {
            throw validationError(
                `Missing required COSTCO fields: ${missingFields.join(', ')}`,
                { missingFields }
            );
        }

        const itemData = {
            priority: Priority.HIGH,
            reference: `COSTCO_${costcoData.PO_x005f_no}_${Date.now()}`,
            specificContent: {
                ...costcoData,
                ProcessType: 'COSTCO_INLINE_ROUTING',
                TriggerSource: 'SharePoint_Webhook',
                ProcessedAt: new Date().toISOString()
            }
        };

        return await this.submitQueueItem('COSTCO-INLINE-Routing', itemData);
    }
}

/**
 * Create UiPath queue client
 * @param {Object} context - Azure Functions context
 * @returns {UiPathQueueClient} Queue client instance
 */
function createUiPathQueueClient(context = null) {
    return new UiPathQueueClient(context);
}

module.exports = {
    UiPathQueueClient,
    createUiPathQueueClient,
    Priority,
    QueueItemStatus
};