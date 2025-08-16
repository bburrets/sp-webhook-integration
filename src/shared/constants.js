/**
 * Shared Constants Module
 * Central location for all constants used across the SharePoint Webhooks application
 * 
 * This module exports constants for:
 * - SharePoint field encodings
 * - UiPath API endpoints and configuration
 * - Status values and priority levels
 * - HTTP status codes and error messages
 * - Magic strings and configuration values
 * 
 * Version: 1.0.0
 * Created: 2025-08-16
 */

// ============================================================================
// SHAREPOINT FIELD ENCODINGS
// ============================================================================

/**
 * SharePoint field name encodings for special characters
 * SharePoint internally encodes special characters in field names
 */
export const SHAREPOINT_ENCODINGS = {
    SPACE: '_x0020_',
    UNDERSCORE: '_x005f_',
    HYPHEN: '_x002d_',
    AMPERSAND: '_x0026_',
    APOSTROPHE: '_x0027_',
    LEFT_PAREN: '_x0028_',
    RIGHT_PAREN: '_x0029_',
    COLON: '_x003A_'
};

/**
 * Common SharePoint field mappings with their encoded equivalents
 */
export const SHAREPOINT_FIELD_MAPPINGS = {
    'Ship To Email': 'Ship_x0020_To_x0020_Email',
    'Ship Date': 'Ship_x0020_Date',
    'Ship-To': 'Ship_x002d_To',
    'PO_no': 'PO_x005f_no',
    'PO_No': 'PO_x005f_No',
    'Generated Routing Form URL': 'Generated_x0020_Routing_x0020_Form_x0020_URL'
};

/**
 * HTML entity decodings for URLs and content
 */
export const HTML_ENTITY_DECODINGS = {
    '&#58;': ':',          // Colon
    '&#x3A;': ':',         // Hex colon
    '%3A': ':',            // URL-encoded colon
    '&amp;': '&',          // Ampersand
    '&#38;': '&',          // HTML entity ampersand
    '&lt;': '<',           // Less than
    '&gt;': '>',           // Greater than
    '&quot;': '"',         // Quote
    '&#39;': "'",          // Apostrophe
    '%7B': '{',            // Left brace
    '%7D': '}'             // Right brace
};

// ============================================================================
// UIPATH CONSTANTS
// ============================================================================

/**
 * UiPath queue item priority levels
 */
export const UIPATH_PRIORITY = {
    LOW: 'Low',
    NORMAL: 'Normal',
    HIGH: 'High'
};

/**
 * UiPath queue item status values
 */
export const UIPATH_QUEUE_STATUS = {
    NEW: 'New',
    IN_PROGRESS: 'InProgress',
    SUCCESSFUL: 'Successful',
    FAILED: 'Failed',
    ABANDONED: 'Abandoned',
    RETRIED: 'Retried',
    DELETED: 'Deleted'
};

/**
 * UiPath API endpoints (relative to orchestrator URL)
 */
export const UIPATH_API_ENDPOINTS = {
    ADD_QUEUE_ITEM: '/odata/Queues/UiPathODataSvc.AddQueueItem',
    QUEUE_ITEMS: '/odata/QueueItems',
    GET_QUEUE_ITEM: '/odata/QueueItems({id})',
    LIST_QUEUES: '/odata/Queues'
};

/**
 * UiPath process types for different templates
 */
export const UIPATH_PROCESS_TYPES = {
    COSTCO_INLINE_ROUTING: 'COSTCO_INLINE_ROUTING',
    GENERIC_PROCESSING: 'GENERIC_PROCESSING'
};

/**
 * UiPath queue names for different processes
 */
export const UIPATH_QUEUE_NAMES = {
    COSTCO_INLINE_ROUTING: 'COSTCO-INLINE-Routing',
    TEST_API: 'TEST_API'
};

// ============================================================================
// STATUS VALUES
// ============================================================================

/**
 * COSTCO routing status values
 */
export const COSTCO_STATUS_VALUES = {
    DRAFT: 'Draft',
    IN_PROGRESS: 'In Progress',
    READY_FOR_REVIEW: 'Ready for Review',
    SEND_GENERATED_FORM: 'Send Generated Form',
    PROCESSING: 'Processing',
    COMPLETED: 'Completed'
};

/**
 * Webhook processing status values
 */
export const WEBHOOK_STATUS = {
    ACTIVE: 'Active',
    DELETED: 'Deleted',
    EXPIRED: 'Expired',
    PENDING: 'Pending',
    ERROR: 'Error'
};

// ============================================================================
// HTTP AND NETWORKING CONSTANTS
// ============================================================================

/**
 * HTTP status codes commonly used in the application
 */
export const HTTP_STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    REQUEST_TIMEOUT: 408,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
};

/**
 * HTTP headers used in webhook processing
 */
export const HTTP_HEADERS = {
    CONTENT_TYPE: 'Content-Type',
    AUTHORIZATION: 'Authorization',
    ACCEPT: 'application/json',
    CONTENT_TYPE_JSON: 'application/json',
    CONTENT_TYPE_TEXT: 'text/plain',
    CACHE_CONTROL: 'Cache-Control',
    NO_CACHE: 'no-cache',
    WEBHOOK_PROXY_HEADER: 'X-SharePoint-Webhook-Proxy',
    SUBSCRIPTION_ID_HEADER: 'X-Original-Subscription-Id',
    UIPATH_ORG_HEADER: 'X-UIPATH-OrganizationUnitId'
};

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

/**
 * Regular expression patterns for validation
 */
export const VALIDATION_PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    DATE_MDY: /^\d{1,2}\/\d{1,2}\/\d{4}$/,  // M/D/YYYY format
    PO_NUMBER: /^[A-Z0-9\-_,\s]+$/i,        // Alphanumeric with hyphens, underscores, commas, spaces
    UIPATH_QUEUE_NAME: /^[A-Za-z0-9\-_]+$/  // Queue names: alphanumeric with hyphens and underscores
};

// ============================================================================
// COSTCO TEMPLATE CONSTANTS
// ============================================================================

/**
 * COSTCO template configuration constants
 */
export const COSTCO_CONFIG_CONSTANTS = {
    LIST_NAME: 'COSTCO-INLINE-Trafficking-Routing',
    SITE_PATH: 'fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:',
    QUEUE_NAME: 'COSTCO-INLINE-Routing',
    PROCESS_TYPE: 'COSTCO_INLINE_ROUTING'
};

/**
 * COSTCO required fields for validation
 */
export const COSTCO_REQUIRED_FIELDS = [
    'ShiptoEmail',
    'ShipDate',
    'Style',
    'PO_No'
];

/**
 * COSTCO field mappings from SharePoint internal names to UiPath field names
 */
export const COSTCO_FIELD_MAPPINGS = {
    'ShiptoEmail': 'ShipToEmail',
    'ShipDate': 'ShipDate',
    'Style': 'Style',
    'PO_No': 'PONumber',
    'GeneratedRoutingFormURL': 'GeneratedRoutingFormURL',
    'Status': 'Status',
    'Ship_x002d_To': 'ShipTo',
    'Pack': 'Pack',
    'Title': 'Title',
    'ID': 'SharePointItemId',
    'Modified': 'LastModified',
    'Created': 'Created',
    'Author': 'CreatedBy',
    'Editor': 'ModifiedBy'
};

// ============================================================================
// WEBHOOK PROCESSING CONSTANTS
// ============================================================================

/**
 * Webhook change types supported by Microsoft Graph
 */
export const WEBHOOK_CHANGE_TYPES = {
    CREATED: 'created',
    UPDATED: 'updated',
    DELETED: 'deleted'
};

/**
 * Client state patterns for routing notifications
 */
export const CLIENT_STATE_PATTERNS = {
    FORWARD_PREFIX: 'forward:',
    UIPATH_PROCESSOR: 'processor:uipath',
    UIPATH_ENABLED: 'uipath:enabled',
    UIPATH_QUEUE: 'uipath:',
    COSTCO_ROUTING: 'costco:routing',
    COSTCO_PROCESSOR: 'processor:costco'
};

/**
 * Default timeout values (in milliseconds)
 */
export const TIMEOUT_VALUES = {
    DEFAULT_TIMEOUT: 30000,           // 30 seconds
    NOTIFICATION_TIMEOUT: 10000,      // 10 seconds
    UIPATH_API_TIMEOUT: 60000,       // 60 seconds
    LOOP_PREVENTION_WINDOW: 5000     // 5 seconds
};

/**
 * Retry configuration values
 */
export const RETRY_CONFIG = {
    DEFAULT_RETRY_ATTEMPTS: 3,
    DEFAULT_RETRY_DELAY: 1000,       // 1 second
    BACKOFF_MULTIPLIER: 2
};

// ============================================================================
// ERROR MESSAGES
// ============================================================================

/**
 * Standard error messages used throughout the application
 */
export const ERROR_MESSAGES = {
    INVALID_JSON: 'Invalid JSON in request body',
    METHOD_NOT_ALLOWED: 'Method not allowed',
    MISSING_VALIDATION_TOKEN: 'Missing validation token',
    UIPATH_DISABLED: 'UiPath integration is disabled',
    QUEUE_NAME_REQUIRED: 'Queue name is required',
    QUEUE_ITEM_REQUIRED: 'Queue item is required',
    INVALID_PRIORITY: 'Invalid priority value',
    CIRCULAR_REFERENCE: 'SpecificContent contains circular references or invalid data',
    SHAREPOINT_ITEM_NOT_FOUND: 'SharePoint item not found',
    AUTHENTICATION_FAILED: 'Authentication failed',
    AUTHORIZATION_FAILED: 'Authorization failed - check permissions'
};

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
    NOTIFICATION_PROCESSED: 'Notifications processed successfully',
    UIPATH_DISPATCH_COMPLETED: 'UiPath dispatch completed',
    FORWARDING_SUCCESSFUL: 'Successfully forwarded notification',
    QUEUE_SUBMISSION_SUCCESS: 'Successfully submitted item to UiPath queue'
};

// ============================================================================
// LOGGING CONSTANTS
// ============================================================================

/**
 * Log levels and categories
 */
export const LOG_LEVELS = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
};

/**
 * Service names for logging context
 */
export const SERVICE_NAMES = {
    WEBHOOK_HANDLER: 'webhook-handler',
    UIPATH_DISPATCHER: 'uipath-dispatcher',
    UIPATH_QUEUE_CLIENT: 'uipath',
    COSTCO_TEMPLATE: 'costco',
    ENHANCED_FORWARDER: 'enhanced-forwarder'
};

// ============================================================================
// GRAPH API CONSTANTS
// ============================================================================

/**
 * Microsoft Graph API configuration
 */
export const GRAPH_API_CONFIG = {
    BASE_URL: 'https://graph.microsoft.com/v1.0',
    SCOPES: ['https://graph.microsoft.com/.default'],
    AUTHORITY: 'https://login.microsoftonline.com/common'
};

// ============================================================================
// DOCUMENT PROCESSING CONSTANTS
// ============================================================================

/**
 * Document processing strategies
 */
export const DOCUMENT_STRATEGIES = {
    DIRECT_DOWNLOAD: 'direct_download',
    BASE64_CONTENT: 'base64_content',
    SHAREPOINT_URL: 'sharepoint_url',
    FALLBACK: 'fallback',
    BASIC_CLEANUP: 'basic_cleanup'
};

/**
 * File extensions supported for document processing
 */
export const SUPPORTED_FILE_EXTENSIONS = {
    EXCEL: ['.xlsx', '.xls'],
    WORD: ['.docx', '.doc'],
    PDF: ['.pdf'],
    IMAGE: ['.png', '.jpg', '.jpeg', '.gif'],
    TEXT: ['.txt', '.csv']
};

// ============================================================================
// SANITIZATION CONSTANTS
// ============================================================================

/**
 * Field name sanitization mappings
 */
export const FIELD_SANITIZATION = {
    '@': '_at_',
    '.': '_dot_',
    '$': '_dollar_'
};

/**
 * Control characters regex for cleaning field values
 */
export const CONTROL_CHARACTERS_REGEX = /[\u0000-\u001F\u007F-\u009F]/g;

// ============================================================================
// ENVIRONMENT VARIABLE NAMES
// ============================================================================

/**
 * Environment variable names used in the application
 */
export const ENV_VARS = {
    // Azure Functions
    FUNCTIONS_WORKER_RUNTIME: 'FUNCTIONS_WORKER_RUNTIME',
    AZURE_WEB_JOBS_STORAGE: 'AzureWebJobsStorage',
    WEBSITE_HOSTNAME: 'WEBSITE_HOSTNAME',
    AZURE_FUNCTIONS_ENVIRONMENT: 'AZURE_FUNCTIONS_ENVIRONMENT',
    
    // SharePoint Configuration
    SHAREPOINT_SITE_URL: 'SHAREPOINT_SITE_URL',
    WEBHOOK_LIST_ID: 'WEBHOOK_LIST_ID',
    
    // UiPath Configuration
    UIPATH_ORCHESTRATOR_URL: 'UIPATH_ORCHESTRATOR_URL',
    UIPATH_TENANT_NAME: 'UIPATH_TENANT_NAME',
    UIPATH_CLIENT_ID: 'UIPATH_CLIENT_ID',
    UIPATH_CLIENT_SECRET: 'UIPATH_CLIENT_SECRET',
    UIPATH_ORGANIZATION_UNIT_ID: 'UIPATH_ORGANIZATION_UNIT_ID',
    UIPATH_DEFAULT_QUEUE: 'UIPATH_DEFAULT_QUEUE',
    UIPATH_ENABLED: 'UIPATH_ENABLED',
    UIPATH_AUTO_RETRY: 'UIPATH_AUTO_RETRY',
    UIPATH_LOGGING: 'UIPATH_LOGGING'
};

// ============================================================================
// EXPORTS
// ============================================================================

// Default export for convenience
export default {
    SHAREPOINT_ENCODINGS,
    SHAREPOINT_FIELD_MAPPINGS,
    HTML_ENTITY_DECODINGS,
    UIPATH_PRIORITY,
    UIPATH_QUEUE_STATUS,
    UIPATH_API_ENDPOINTS,
    UIPATH_PROCESS_TYPES,
    UIPATH_QUEUE_NAMES,
    COSTCO_STATUS_VALUES,
    WEBHOOK_STATUS,
    HTTP_STATUS,
    HTTP_HEADERS,
    VALIDATION_PATTERNS,
    COSTCO_CONFIG_CONSTANTS,
    COSTCO_REQUIRED_FIELDS,
    COSTCO_FIELD_MAPPINGS,
    WEBHOOK_CHANGE_TYPES,
    CLIENT_STATE_PATTERNS,
    TIMEOUT_VALUES,
    RETRY_CONFIG,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    LOG_LEVELS,
    SERVICE_NAMES,
    GRAPH_API_CONFIG,
    DOCUMENT_STRATEGIES,
    SUPPORTED_FILE_EXTENSIONS,
    FIELD_SANITIZATION,
    CONTROL_CHARACTERS_REGEX,
    ENV_VARS
};