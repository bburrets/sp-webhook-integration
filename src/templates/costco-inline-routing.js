/**
 * COSTCO Inline Routing Template
 * Handles field mappings and processing logic for COSTCO SharePoint list items
 * Version: 3.1.0 - Fixed URL encoding issue (&#58; to :) in document URLs
 * Last Updated: 2025-08-16
 */

const { createLogger } = require('../shared/logger');
const { createUiPathQueueClient } = require('../shared/uipath-queue-client');
const { validationError, AppError } = require('../shared/error-handler');
const { createDocumentHandler, DOCUMENT_STRATEGY } = require('../shared/sharepoint-document-handler');

/**
 * COSTCO field mappings and configuration
 */
const COSTCO_CONFIG = {
    // SharePoint list identification
    listIdentifiers: {
        name: 'COSTCO-INLINE-Trafficking-Routing',
        id: null, // Will be determined dynamically
        sitePath: 'fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:'
    },

    // Field mappings: SharePoint internal name -> UiPath queue field name
    fieldMappings: {
        // Required fields for processing (using actual SharePoint field names)
        'ShiptoEmail': 'ShipToEmail',
        'ShipDate': 'ShipDate',
        'Style': 'Style',
        'PO_No': 'PONumber',
        'GeneratedRoutingFormURL': 'GeneratedRoutingFormURL',
        'Status': 'Status',
        'Ship_x002d_To': 'ShipTo',
        'Pack': 'Pack',
        
        // Additional context fields
        'Title': 'Title',
        'ID': 'SharePointItemId',
        'Modified': 'LastModified',
        'Created': 'Created',
        'Author': 'CreatedBy',
        'Editor': 'ModifiedBy'
    },

    // Trigger conditions
    triggers: {
        statusField: 'Status',
        triggerValue: 'Send Generated Form',
        previousValues: ['Draft', 'In Progress', 'Ready for Review']
    },

    // UiPath queue configuration
    queueConfig: {
        queueName: 'COSTCO-INLINE-Routing',
        priority: 'High',
        processType: 'COSTCO_INLINE_ROUTING'
    },

    // Validation rules
    validationRules: {
        requiredFields: [
            'ShiptoEmail',
            'ShipDate', 
            'Style',
            'PO_No'
        ],
        emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        dateFormat: /^\d{1,2}\/\d{1,2}\/\d{4}/, // M/D/YYYY format as seen in SharePoint
        poNumberPattern: /^[A-Z0-9\-_,\s]+$/i // Allow commas and spaces for multiple POs
    }
};

/**
 * COSTCO Template Processor
 */
class CostcoTemplateProcessor {
    constructor(context = null) {
        this.logger = createLogger(context);
        this.queueClient = createUiPathQueueClient(context);
        this.documentHandler = createDocumentHandler(context);
        this.context = context;
    }

    /**
     * Check if item should be processed based on trigger conditions
     * @param {Object} item - SharePoint list item
     * @param {Object} previousItem - Previous version of the item (if available)
     * @returns {boolean} True if item should be processed
     */
    shouldProcessItem(item, previousItem = null) {
        const currentStatus = item[COSTCO_CONFIG.triggers.statusField];
        
        // Check if status is the trigger value
        if (currentStatus !== COSTCO_CONFIG.triggers.triggerValue) {
            this.logger.debug('Item status does not match trigger value', {
                template: 'costco',
                currentStatus,
                requiredStatus: COSTCO_CONFIG.triggers.triggerValue,
                itemId: item.ID
            });
            return false;
        }

        // If we have previous item data, check if status actually changed
        if (previousItem) {
            const previousStatus = previousItem[COSTCO_CONFIG.triggers.statusField];
            
            if (previousStatus === currentStatus) {
                this.logger.debug('Status has not changed - skipping processing', {
                    template: 'costco',
                    status: currentStatus,
                    itemId: item.ID
                });
                return false;
            }

            // Verify previous status was valid
            if (!COSTCO_CONFIG.triggers.previousValues.includes(previousStatus)) {
                this.logger.warn('Status change from unexpected previous value', {
                    template: 'costco',
                    previousStatus,
                    currentStatus,
                    expectedPreviousValues: COSTCO_CONFIG.triggers.previousValues,
                    itemId: item.ID
                });
            }
        }

        this.logger.info('Item meets processing criteria', {
            template: 'costco',
            status: currentStatus,
            itemId: item.ID
        });

        return true;
    }

    /**
     * Decode HTML entities in URLs
     * @param {string} url - URL to decode
     * @returns {string} Decoded URL
     */
    decodeUrl(url) {
        if (!url || typeof url !== 'string') {
            return url;
        }
        
        return url
            .replace(/&#58;/g, ':')    // Decode HTML entity for colon
            .replace(/&#x3A;/gi, ':')  // Decode hex HTML entity for colon
            .replace(/%3A/gi, ':')     // Decode URL-encoded colon
            .replace(/&amp;/g, '&')    // Decode ampersand
            .replace(/&#38;/g, '&')    // Decode HTML entity for ampersand
            .replace(/&lt;/g, '<')     // Decode less than
            .replace(/&gt;/g, '>')     // Decode greater than
            .replace(/&quot;/g, '"')   // Decode quote
            .replace(/&#39;/g, "'");   // Decode apostrophe
    }

    /**
     * Clean HTML content and problematic field names for UiPath submission
     * @param {*} value - Field value to clean
     * @returns {*} Cleaned value
     */
    cleanFieldValue(value) {
        if (value === null || value === undefined) {
            return '';
        }

        if (typeof value === 'string') {
            // Extract clean URL from HTML content
            if (value.includes('<') && value.includes('>')) {
                // Extract href from anchor tag
                const hrefMatch = value.match(/href=["']([^"']+)["']/);
                if (hrefMatch) {
                    // Decode HTML entities and clean up the URL
                    let url = hrefMatch[1]
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'")
                        .replace(/&#58;/g, ':')  // Fix encoded colons
                        .replace(/&#x3A;/gi, ':') // Fix hex encoded colons
                        .replace(/%3A/gi, ':')     // Fix URL encoded colons
                        .replace(/%7B/g, '{')
                        .replace(/%7D/g, '}');
                    
                    // If it's a relative URL, make it absolute
                    if (url.startsWith('/sites/')) {
                        url = `https://fambrandsllc.sharepoint.com${url}`;
                    }
                    
                    return url;
                }

                // Extract text content from HTML tags
                const textMatch = value.replace(/<[^>]*>/g, '');
                if (textMatch.trim()) {
                    return textMatch.trim();
                }
            }
            
            // Remove problematic characters that might break JSON
            return value
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
                .trim();  // Don't double-escape quotes and backslashes
        }

        if (typeof value === 'object') {
            // Convert objects to string representation
            try {
                return JSON.stringify(value);
            } catch (error) {
                return String(value);
            }
        }

        return value;
    }

    /**
     * Sanitize field names to avoid UiPath issues
     * @param {string} fieldName - Original field name
     * @returns {string} Sanitized field name
     */
    sanitizeFieldName(fieldName) {
        if (!fieldName || typeof fieldName !== 'string') {
            return fieldName;
        }

        return fieldName
            .replace(/@/g, '_at_')           // @ symbols
            .replace(/\./g, '_dot_')         // Dots
            .replace(/\$/g, '_dollar_')      // Dollar signs
            .replace(/\s+/g, '_')            // Multiple spaces to single underscore
            .replace(/[^\w_]/g, '_')         // Any other special chars to underscore
            .replace(/_+/g, '_')             // Multiple underscores to single
            .replace(/^_|_$/g, '');          // Remove leading/trailing underscores
    }

    /**
     * Validate required fields are present and valid
     * @param {Object} item - SharePoint list item
     * @throws {AppError} If validation fails
     */
    validateRequiredFields(item) {
        const missingFields = [];
        const invalidFields = [];

        // Check required fields presence - handle multiple field name variations
        const fieldGetters = {
            'ShiptoEmail': (item) => item.fields?.Ship_x002d_toEmail || item.fields?.ShiptoEmail || item['Ship_x002d_toEmail'] || item['ShiptoEmail'] || item['Ship_x0020_To_x0020_Email'],
            'ShipDate': (item) => item.fields?.ShipDate || item['ShipDate'] || item['Ship_x0020_Date'],
            'Style': (item) => item.fields?.Style || item['Style'],
            'PO_No': (item) => item.fields?.PO_x005f_No || item.fields?.PO_No || item['PO_x005f_No'] || item['PO_No'] || item['PO_x005f_no']
        };

        // Check required fields presence
        for (const field of COSTCO_CONFIG.validationRules.requiredFields) {
            const value = fieldGetters[field] ? fieldGetters[field](item) : item[field];
            if (!value || value === null || value === '') {
                missingFields.push(field);
            }
        }

        if (missingFields.length > 0) {
            throw validationError(
                `Missing required COSTCO fields: ${missingFields.join(', ')}`,
                { missingFields, itemId: item.ID || item.id }
            );
        }

        // Validate email format
        const email = fieldGetters['ShiptoEmail'](item);
        if (email && !COSTCO_CONFIG.validationRules.emailPattern.test(email)) {
            invalidFields.push({
                field: 'ShiptoEmail',
                value: email,
                reason: 'Invalid email format'
            });
        }

        // Validate date format (if it's a string)
        const shipDate = fieldGetters['ShipDate'](item);
        if (shipDate && typeof shipDate === 'string' && 
            !COSTCO_CONFIG.validationRules.dateFormat.test(shipDate)) {
            invalidFields.push({
                field: 'ShipDate',
                value: shipDate,
                reason: 'Invalid date format (expected M/D/YYYY)'
            });
        }

        // Validate PO number format
        const poNumber = fieldGetters['PO_No'](item);
        if (poNumber && !COSTCO_CONFIG.validationRules.poNumberPattern.test(poNumber)) {
            invalidFields.push({
                field: 'PO_No',
                value: poNumber,
                reason: 'Invalid PO number format'
            });
        }

        if (invalidFields.length > 0) {
            throw validationError(
                'Invalid field values in COSTCO item',
                { invalidFields, itemId: item.ID || item.id }
            );
        }
    }

    /**
     * Process document attachment from GeneratedRoutingFormURL field
     * @param {Object} item - SharePoint list item
     * @param {string} accessToken - Graph API access token (optional)
     * @returns {Promise<Object>} Document information for UiPath
     */
    async processDocumentAttachment(item, accessToken = null) {
        // Get the GeneratedRoutingFormURL field value
        const routingFormUrl = item.fields?.GeneratedRoutingFormURL || 
                              item['GeneratedRoutingFormURL'] || 
                              item['Generated_x0020_Routing_x0020_Form_x0020_URL'];

        if (!routingFormUrl) {
            this.logger.info('No routing form URL found in item', {
                template: 'costco',
                itemId: item.ID || item.id,
                availableFields: Object.keys(item.fields || item)
            });
            
            return {
                hasDocument: false,
                reason: 'No GeneratedRoutingFormURL field found'
            };
        }

        try {
            this.logger.info('Processing document attachment for COSTCO item', {
                template: 'costco',
                itemId: item.ID || item.id,
                hasAccessToken: !!accessToken,
                routingFormUrlPreview: routingFormUrl.substring(0, 100),
                fieldType: 'SharePoint Hyperlink Field'
            });

            // Use the new SharePoint hyperlink optimized method
            const documentInfo = await this.documentHandler.createUiPathDocumentReference(
                routingFormUrl,
                accessToken,
                'fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:'
            );

            this.logger.info('Successfully processed document attachment', {
                template: 'costco',
                itemId: item.ID || item.id,
                fileName: documentInfo.fileName,
                strategy: documentInfo.strategy,
                hasDirectDownload: !!documentInfo.directDownloadUrl,
                uipathCompatible: documentInfo.uipathCompatible
            });

            return documentInfo;

        } catch (error) {
            this.logger.error('Failed to process document attachment', {
                template: 'costco',
                itemId: item.ID || item.id,
                error: error.message,
                routingFormUrlPreview: routingFormUrl.substring(0, 100)
            });

            // Enhanced fallback using the document handler's extract method
            try {
                const docInfo = this.documentHandler.extractDocumentFromHTML(routingFormUrl);
                if (docInfo) {
                    return {
                        hasDocument: true,
                        strategy: 'fallback',
                        fileName: docInfo.fileName || 'RoutingForm.xlsx',
                        originalUrl: docInfo.url,
                        documentUrl: docInfo.cleanUrl || docInfo.url,
                        cleanUrl: docInfo.cleanUrl,
                        requiresDownload: true,
                        error: error.message,
                        fallback: true,
                        instructions: 'Fallback processing - UiPath should use documentUrl for file access'
                    };
                }
            } catch (fallbackError) {
                this.logger.warn('Fallback processing also failed', {
                    template: 'costco',
                    itemId: item.ID || item.id,
                    fallbackError: fallbackError.message
                });
            }

            // Final fallback: just clean the field value
            return {
                hasDocument: true,
                strategy: 'basic_cleanup',
                fileName: 'RoutingForm.xlsx',
                originalUrl: routingFormUrl,
                documentUrl: this.cleanFieldValue(routingFormUrl),
                requiresDownload: true,
                error: error.message,
                instructions: 'Basic URL cleanup applied - UiPath should handle document access directly'
            };
        }
    }

    /**
     * Transform SharePoint item to UiPath queue format
     * @param {Object} item - SharePoint list item
     * @param {Object} documentInfo - Processed document information (optional)
     * @returns {Object} Transformed data for UiPath queue
     */
    transformItemData(item, documentInfo = null) {
        // MINIMAL PAYLOAD - Only essential fields for UiPath processing
        const transformed = {
            // Process metadata
            ProcessType: COSTCO_CONFIG.queueConfig.processType,
            QueueName: COSTCO_CONFIG.queueConfig.queueName,
            TriggerSource: 'SharePoint_Webhook',
            ProcessedAt: new Date().toISOString(),
            
            // SharePoint context - simplified
            SharePointItemId: String(item.id || item.ID || item.fields?.id || 'UNKNOWN'),
            
            // Core business data - minimal set without email or hyperlinks
            // ShipToEmail removed - was causing issues
            ShipDate: item.fields?.ShipDate || item['ShipDate'] || item['Ship_x0020_Date'] || '',
            Style: item.fields?.Style || item['Style'] || '',
            PONumber: String(item.fields?.PO_x005f_No || item.fields?.PO_No || item['PO_x005f_No'] || item['PO_No'] || item['PO_x005f_no'] || 'NOPO'),
            // GeneratedRoutingFormURL removed - hyperlink was causing issues
            Status: item.fields?.Status || item['Status'] || '',
            
            // Basic metadata only
            Title: item.fields?.Title || item['Title'] || '',
            ModifiedDate: item.lastModifiedDateTime || item.fields?.Modified || item['Modified'] || new Date().toISOString()
        };

        // Add document information if provided
        if (documentInfo && documentInfo.hasDocument) {
            transformed.Document = {
                HasDocument: documentInfo.hasDocument,
                Strategy: documentInfo.strategy,
                FileName: documentInfo.fileName,
                FileExtension: documentInfo.fileExtension,
                RequiresDownload: documentInfo.requiresDownload !== false,
                Instructions: documentInfo.instructions,
                UiPathCompatible: documentInfo.uipathCompatible || true,
                ProcessedAt: documentInfo.processedAt || new Date().toISOString()
            };

            // Add all available URLs for maximum UiPath flexibility
            // Decode any HTML entities in the URLs
            if (documentInfo.documentUrl) {
                transformed.Document.DocumentUrl = this.decodeUrl(documentInfo.documentUrl);
            }
            
            if (documentInfo.cleanUrl) {
                transformed.Document.CleanUrl = this.decodeUrl(documentInfo.cleanUrl);
            }
            
            if (documentInfo.originalUrl) {
                transformed.Document.OriginalUrl = this.decodeUrl(documentInfo.originalUrl);
            }

            // Add direct download URL if available (best for UiPath automation)
            if (documentInfo.directDownloadUrl) {
                transformed.Document.DirectDownloadUrl = this.decodeUrl(documentInfo.directDownloadUrl);
                transformed.Document.Instructions = 'Direct download URL available - use DirectDownloadUrl for immediate file access';
            }

            // Legacy support for older strategies
            if (documentInfo.downloadUrl) {
                transformed.Document.DownloadUrl = this.decodeUrl(documentInfo.downloadUrl);
            }

            // For base64 content (if strategy includes it)
            if (documentInfo.content && documentInfo.strategy === 'base64_content') {
                transformed.Document.Content = documentInfo.content;
                transformed.Document.ContentType = documentInfo.contentType;
                transformed.Document.Size = documentInfo.size;
                transformed.Document.Encoding = documentInfo.encoding;
            }

            // Add document metadata for UiPath processing
            if (documentInfo.documentId) {
                transformed.Document.DocumentId = documentInfo.documentId;
            }
            
            // Error information for diagnostics
            if (documentInfo.error) {
                transformed.Document.ProcessingError = documentInfo.error;
            }
            
            if (documentInfo.fallback) {
                transformed.Document.FallbackProcessing = true;
            }

            this.logger.info('Added enhanced document information to payload', {
                template: 'costco',
                itemId: item.ID || item.id,
                documentStrategy: documentInfo.strategy,
                fileName: documentInfo.fileName,
                hasDirectDownloadUrl: !!documentInfo.directDownloadUrl,
                hasCleanUrl: !!documentInfo.cleanUrl,
                uipathCompatible: documentInfo.uipathCompatible
            });
        } else {
            // No document available
            transformed.Document = {
                HasDocument: false,
                Reason: documentInfo?.reason || 'No document information provided'
            };
            
            this.logger.warn('No document information available for COSTCO item', {
                template: 'costco',
                itemId: item.ID || item.id,
                reason: documentInfo?.reason
            });
        }

        // Handle date formatting
        if (transformed.ShipDate) {
            try {
                // Ensure date is in ISO format
                const date = new Date(transformed.ShipDate);
                transformed.ShipDate = date.toISOString();
                transformed.ShipDateFormatted = date.toLocaleDateString('en-US');
            } catch (error) {
                this.logger.warn('Failed to parse ship date', {
                    template: 'costco',
                    shipDate: transformed.ShipDate,
                    itemId: item.ID,
                    error: error.message
                });
            }
        }

        // MINIMAL PAYLOAD - Skip HTML cleaning and additional fields to avoid issues
        // Don't add any additional fields that might have special characters

        this.logger.debug('Transformed COSTCO item data (minimal payload)', {
            template: 'costco',
            itemId: item.ID || item.id,
            transformedFields: Object.keys(transformed),
            fieldCount: Object.keys(transformed).length,
            minimalPayload: true
        });

        return transformed;
    }

    /**
     * Process COSTCO item and submit to UiPath queue
     * @param {Object} item - SharePoint list item
     * @param {Object} previousItem - Previous version of item (optional)
     * @param {string} queueNameOverride - Override the default queue name (optional)
     * @param {string} accessToken - Graph API access token for document processing (optional)
     * @returns {Promise<Object>} Processing result
     */
    async processItem(item, previousItem = null, queueNameOverride = null, accessToken = null) {
        try {
            // Check if item should be processed
            if (!this.shouldProcessItem(item, previousItem)) {
                return {
                    processed: false,
                    reason: 'Item does not meet processing criteria',
                    itemId: item.ID
                };
            }

            // Validate required fields
            this.validateRequiredFields(item);

            // Process document attachment
            const documentInfo = await this.processDocumentAttachment(item, accessToken);

            // Transform data with document information
            const transformedData = this.transformItemData(item, documentInfo);

            // Use override queue name if provided, otherwise use default
            const queueName = queueNameOverride || COSTCO_CONFIG.queueConfig.queueName;
            
            this.logger.info('Processing COSTCO item for UiPath queue', {
                template: 'costco',
                templateVersion: '3.1.0',
                itemId: item.ID || item.id,
                poNumber: transformedData.PONumber,
                shipToEmail: transformedData.ShipToEmail,
                status: transformedData.Status,
                targetQueue: queueName,
                debugInfo: {
                    rawPOField: item['PO_No'],
                    transformedPONumber: transformedData.PONumber,
                    referencePattern: `COSTCO_${transformedData.PONumber}_${item.ID}_${Date.now()}`
                }
            });
            
            // Submit to UiPath queue
            // Clean up PO number for reference - remove commas and spaces
            const cleanPONumber = transformedData.PONumber ? 
                transformedData.PONumber.replace(/[,\s]/g, '_') : 'NOPO';
            const itemId = item.id || item.ID || item.fields?.id || 'NOID';
            
            const queueResult = await this.queueClient.submitQueueItem(
                queueName,
                {
                    priority: COSTCO_CONFIG.queueConfig.priority,
                    reference: `COSTCO_${cleanPONumber}_${itemId}_${Date.now()}`,
                    specificContent: transformedData
                }
            );

            const result = {
                processed: true,
                queueSubmission: queueResult,
                itemId: item.ID,
                poNumber: transformedData.PONumber,
                template: 'costco'
            };

            this.logger.info('Successfully processed COSTCO item', result);

            return result;

        } catch (error) {
            this.logger.error('Failed to process COSTCO item', {
                template: 'costco',
                itemId: item?.ID,
                error: error.message,
                stack: error.stack
            });

            return {
                processed: false,
                error: error.message,
                itemId: item?.ID,
                template: 'costco'
            };
        }
    }

    /**
     * Get template configuration
     * @returns {Object} Template configuration
     */
    getConfig() {
        return COSTCO_CONFIG;
    }

    /**
     * Check if this template applies to a given SharePoint list
     * @param {string} listName - SharePoint list name
     * @param {string} sitePath - SharePoint site path
     * @returns {boolean} True if template applies
     */
    appliesToList(listName, sitePath = null) {
        const nameMatch = listName === COSTCO_CONFIG.listIdentifiers.name;
        const pathMatch = !sitePath || sitePath === COSTCO_CONFIG.listIdentifiers.sitePath;
        
        return nameMatch && pathMatch;
    }

    /**
     * Get field mappings for this template
     * @returns {Object} Field mappings
     */
    getFieldMappings() {
        return COSTCO_CONFIG.fieldMappings;
    }

    /**
     * Get validation rules for this template
     * @returns {Object} Validation rules
     */
    getValidationRules() {
        return COSTCO_CONFIG.validationRules;
    }
}

/**
 * Create COSTCO template processor
 * @param {Object} context - Azure Functions context
 * @returns {CostcoTemplateProcessor} Template processor instance
 */
function createCostcoProcessor(context = null) {
    return new CostcoTemplateProcessor(context);
}

/**
 * Helper function to quickly process a COSTCO item
 * @param {Object} item - SharePoint list item
 * @param {Object} previousItem - Previous version of item (optional)
 * @param {Object} context - Azure Functions context (optional)
 * @param {string} accessToken - Graph API access token for document processing (optional)
 * @returns {Promise<Object>} Processing result
 */
async function processCostcoItem(item, previousItem = null, context = null, accessToken = null) {
    const processor = createCostcoProcessor(context);
    return await processor.processItem(item, previousItem, null, accessToken);
}

module.exports = {
    CostcoTemplateProcessor,
    createCostcoProcessor,
    processCostcoItem,
    COSTCO_CONFIG
};