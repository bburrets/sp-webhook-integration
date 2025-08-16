/**
 * SharePoint Document Handler
 * Handles extraction and processing of SharePoint documents for UiPath automation
 * Supports both hyperlink fields and actual attachments
 */

const axios = require('axios');
const { createLogger } = require('./logger');
const { AppError, validationError } = require('./error-handler');
const config = require('./config');

/**
 * Document handling strategies
 */
const DOCUMENT_STRATEGY = {
    URL_REFERENCE: 'url_reference',           // Just pass the URL to UiPath
    DOWNLOAD_URL: 'download_url',             // Get direct download URL
    BASE64_CONTENT: 'base64_content',         // Download and encode as base64
    BLOB_STORAGE: 'blob_storage',             // Store in Azure Blob and provide URL
    SHAREPOINT_HYPERLINK: 'sharepoint_hyperlink' // Optimized for SharePoint hyperlink fields
};

/**
 * UiPath queue size limits (conservative estimates)
 */
const UIPATH_LIMITS = {
    MAX_QUEUE_ITEM_SIZE: 5 * 1024 * 1024,    // 5MB total
    MAX_SPECIFIC_CONTENT_SIZE: 4 * 1024 * 1024, // 4MB for SpecificContent
    MAX_BASE64_FILE_SIZE: 3 * 1024 * 1024     // 3MB for base64 encoded files
};

/**
 * SharePoint Document Handler
 */
class SharePointDocumentHandler {
    constructor(context = null) {
        this.logger = createLogger(context);
        this.context = context;
    }

    /**
     * Extract document information from SharePoint hyperlink HTML
     * @param {string} htmlContent - HTML content from hyperlink field
     * @returns {Object} Document information
     */
    extractDocumentFromHTML(htmlContent) {
        if (!htmlContent || typeof htmlContent !== 'string') {
            return null;
        }

        // Check if it's HTML content
        if (!htmlContent.includes('<') || !htmlContent.includes('>')) {
            // Might be a direct URL
            const url = htmlContent;
            const fileName = this.extractFileNameFromUrl(url);
            
            // Try to extract document ID even from direct URLs
            const docIdMatch = url.match(/sourcedoc=(?:%7B|{)([^}%]+)(?:%7D|})/);
            const documentId = docIdMatch ? docIdMatch[1] : null;
            
            return {
                url: url,
                fileName: fileName,
                documentId: documentId,
                type: 'direct_url',
                cleanUrl: this.createCleanSharePointUrl(url, documentId, fileName)
            };
        }

        // Extract href attribute - handle both encoded and unencoded URLs
        const hrefMatch = htmlContent.match(/href=["']([^"']+)["']/);
        if (!hrefMatch) {
            this.logger.warn('No href found in HTML content', {
                service: 'sharepoint',
                htmlContent: htmlContent.substring(0, 200)
            });
            return null;
        }

        let url = hrefMatch[1];
        
        // Decode HTML entities in URL
        url = url.replace(/&amp;/g, '&')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&quot;/g, '"')
                 .replace(/&#39;/g, "'");
        
        // Extract file name from link text or URL
        const linkTextMatch = htmlContent.match(/>([^<]+)</);
        let fileName = linkTextMatch ? linkTextMatch[1].trim() : this.extractFileNameFromUrl(url);

        // Handle relative URLs (SharePoint URLs are often relative)
        if (url.startsWith('/')) {
            url = `https://${config.sharepoint.primarySite.domain}${url}`;
        }

        // Extract document ID if present (useful for Graph API calls)
        const docIdMatch = url.match(/sourcedoc=(?:%7B|{)([^}%]+)(?:%7D|})/);
        const documentId = docIdMatch ? docIdMatch[1] : null;

        // Extract file parameter for better file name
        const fileMatch = url.match(/file=([^&]+)/);
        if (fileMatch) {
            fileName = decodeURIComponent(fileMatch[1].replace(/\+/g, ' '));
        }

        // Extract site and library information for more robust handling
        const siteMatch = url.match(/\/sites\/([^\/]+)/);
        const siteName = siteMatch ? siteMatch[1] : null;

        return {
            url,
            fileName,
            documentId,
            siteName,
            type: 'sharepoint_hyperlink',
            isSharePointDoc: true,
            cleanUrl: this.createCleanSharePointUrl(url, documentId, fileName)
        };
    }

    /**
     * Extract file name from URL
     * @param {string} url - URL to extract file name from
     * @returns {string} File name
     */
    extractFileNameFromUrl(url) {
        if (!url) return 'unknown_file';
        
        // Try to extract from file parameter first
        const fileMatch = url.match(/file=([^&]+)/);
        if (fileMatch) {
            return decodeURIComponent(fileMatch[1].replace(/\+/g, ' '));
        }

        // Fall back to last path segment
        const parts = url.split('/');
        const lastPart = parts[parts.length - 1];
        
        // Remove query parameters
        const fileNamePart = lastPart.split('?')[0];
        
        return fileNamePart || 'unknown_file';
    }

    /**
     * Create a clean SharePoint URL suitable for UiPath processing
     * @param {string} originalUrl - Original SharePoint URL
     * @param {string} documentId - Document ID (if available)
     * @param {string} fileName - File name (if available)
     * @returns {string} Clean URL for UiPath consumption
     */
    createCleanSharePointUrl(originalUrl, documentId, fileName) {
        if (!originalUrl) return null;

        // For SharePoint document links, try to create a direct download URL
        // Format: /sites/site/_layouts/15/Doc.aspx?sourcedoc={id}&file=filename&action=default
        
        if (documentId && fileName) {
            // Extract site path from original URL
            const siteMatch = originalUrl.match(/(\/sites\/[^\/]+)/);
            const sitePath = siteMatch ? siteMatch[1] : '/sites/unknown';
            
            // Create a standardized SharePoint document URL
            const cleanFileName = encodeURIComponent(fileName);
            const cleanDocId = documentId.replace(/[{}]/g, ''); // Remove braces if present
            
            return `${sitePath}/_layouts/15/Doc.aspx?sourcedoc={${cleanDocId}}&file=${cleanFileName}&action=default&mobileredirect=true`;
        }

        // Fallback: clean up the original URL
        return originalUrl.replace(/&amp;/g, '&');
    }

    /**
     * Convert SharePoint document URL to direct download URL using Graph API
     * @param {string} accessToken - Graph API access token
     * @param {string} documentId - SharePoint document ID
     * @param {string} siteId - SharePoint site ID or path
     * @returns {Promise<string>} Direct download URL
     */
    async getDirectDownloadUrl(accessToken, documentId, siteId) {
        try {
            // First get the drive item using the document ID
            const driveItemUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${documentId}`;
            
            const response = await axios.get(driveItemUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                },
                timeout: config.api.timeout
            });

            const driveItem = response.data;
            
            // Return the direct download URL if available
            if (driveItem['@microsoft.graph.downloadUrl']) {
                this.logger.info('Retrieved direct download URL', {
                    service: 'sharepoint',
                    documentId,
                    fileName: driveItem.name,
                    size: driveItem.size
                });
                
                return driveItem['@microsoft.graph.downloadUrl'];
            }

            // Alternative: construct a direct URL using the web URL
            if (driveItem.webUrl) {
                // Convert web URL to direct download by adding &download=1
                const downloadUrl = `${driveItem.webUrl}&download=1`;
                this.logger.info('Created download URL from web URL', {
                    service: 'sharepoint',
                    documentId,
                    downloadUrl
                });
                return downloadUrl;
            }

            this.logger.warn('No download URL available for document', {
                service: 'sharepoint',
                documentId,
                driveItemId: driveItem.id,
                availableProperties: Object.keys(driveItem)
            });

            return null;

        } catch (error) {
            this.logger.error('Failed to get direct download URL', {
                service: 'sharepoint',
                documentId,
                siteId,
                error: error.message,
                status: error.response?.status
            });

            throw new AppError(
                'Failed to retrieve direct download URL from SharePoint',
                500,
                { documentId, originalError: error.message }
            );
        }
    }

    /**
     * Get SharePoint document download URL using Graph API
     * @param {string} accessToken - Graph API access token
     * @param {string} documentId - SharePoint document ID
     * @param {string} siteId - SharePoint site ID
     * @returns {Promise<string>} Direct download URL
     */
    async getDocumentDownloadUrl(accessToken, documentId, siteId) {
        try {
            // Use Graph API to get the download URL
            const driveItemUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${documentId}`;
            
            const response = await axios.get(driveItemUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                },
                timeout: config.api.timeout
            });

            const driveItem = response.data;
            
            if (driveItem['@microsoft.graph.downloadUrl']) {
                return driveItem['@microsoft.graph.downloadUrl'];
            }

            this.logger.warn('No download URL available for document', {
                service: 'sharepoint',
                documentId,
                driveItemId: driveItem.id
            });

            return null;

        } catch (error) {
            this.logger.error('Failed to get document download URL', {
                service: 'sharepoint',
                documentId,
                siteId,
                error: error.message
            });

            throw new AppError(
                'Failed to retrieve document download URL from SharePoint',
                500,
                { documentId, originalError: error.message }
            );
        }
    }

    /**
     * Download document content as base64
     * @param {string} downloadUrl - Direct download URL
     * @param {number} maxSize - Maximum file size in bytes
     * @returns {Promise<Object>} Document content and metadata
     */
    async downloadDocumentAsBase64(downloadUrl, maxSize = UIPATH_LIMITS.MAX_BASE64_FILE_SIZE) {
        try {
            const response = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: config.api.timeout,
                maxContentLength: maxSize
            });

            const buffer = Buffer.from(response.data);
            
            if (buffer.length > maxSize) {
                throw new AppError(
                    `Document size (${buffer.length} bytes) exceeds limit (${maxSize} bytes)`,
                    413
                );
            }

            const base64Content = buffer.toString('base64');
            const contentType = response.headers['content-type'] || 'application/octet-stream';

            return {
                content: base64Content,
                size: buffer.length,
                contentType,
                encoding: 'base64'
            };

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new AppError('Document download timeout', 408);
            }
            
            if (error.response?.status === 413) {
                throw new AppError('Document too large for download', 413);
            }

            this.logger.error('Failed to download document', {
                service: 'sharepoint',
                downloadUrl,
                error: error.message
            });

            throw new AppError(
                'Failed to download document content',
                500,
                { originalError: error.message }
            );
        }
    }

    /**
     * Process document for UiPath queue submission
     * @param {string} htmlContent - HTML content from SharePoint field
     * @param {string} accessToken - Graph API access token (optional)
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processed document information for UiPath
     */
    async processDocumentForUiPath(htmlContent, accessToken = null, options = {}) {
        const {
            strategy = DOCUMENT_STRATEGY.URL_REFERENCE,
            maxFileSize = UIPATH_LIMITS.MAX_BASE64_FILE_SIZE,
            siteId = null
        } = options;

        try {
            // Extract document information from HTML
            const docInfo = this.extractDocumentFromHTML(htmlContent);
            
            if (!docInfo) {
                this.logger.warn('No document information could be extracted', {
                    service: 'sharepoint',
                    htmlContent: htmlContent?.substring(0, 100)
                });
                
                return {
                    hasDocument: false,
                    strategy: 'none',
                    error: 'No document information found'
                };
            }

            this.logger.info('Processing document for UiPath', {
                service: 'sharepoint',
                fileName: docInfo.fileName,
                strategy,
                hasDocumentId: !!docInfo.documentId,
                hasAccessToken: !!accessToken
            });

            const result = {
                hasDocument: true,
                strategy,
                fileName: docInfo.fileName,
                originalUrl: docInfo.url,
                documentId: docInfo.documentId,
                fileExtension: this.getFileExtension(docInfo.fileName)
            };

            switch (strategy) {
                case DOCUMENT_STRATEGY.URL_REFERENCE:
                    // Just provide the URL for UiPath to handle
                    result.documentUrl = docInfo.url;
                    result.requiresDownload = true;
                    result.instructions = 'UiPath should navigate to this URL or use HTTP request to download';
                    break;

                case DOCUMENT_STRATEGY.DOWNLOAD_URL:
                    if (!accessToken || !docInfo.documentId || !siteId) {
                        throw validationError(
                            'Access token, document ID, and site ID required for download URL strategy'
                        );
                    }
                    
                    const downloadUrl = await this.getDocumentDownloadUrl(
                        accessToken, 
                        docInfo.documentId, 
                        siteId
                    );
                    
                    result.downloadUrl = downloadUrl;
                    result.requiresDownload = true;
                    result.instructions = 'UiPath can download directly from this URL';
                    break;

                case DOCUMENT_STRATEGY.BASE64_CONTENT:
                    if (!accessToken || !docInfo.documentId || !siteId) {
                        throw validationError(
                            'Access token, document ID, and site ID required for base64 strategy'
                        );
                    }

                    const downloadUrl2 = await this.getDocumentDownloadUrl(
                        accessToken, 
                        docInfo.documentId, 
                        siteId
                    );
                    
                    const documentContent = await this.downloadDocumentAsBase64(
                        downloadUrl2, 
                        maxFileSize
                    );
                    
                    result.content = documentContent.content;
                    result.size = documentContent.size;
                    result.contentType = documentContent.contentType;
                    result.encoding = documentContent.encoding;
                    result.requiresDownload = false;
                    result.instructions = 'Document content is embedded as base64';
                    break;

                case DOCUMENT_STRATEGY.BLOB_STORAGE:
                    // TODO: Implement Azure Blob Storage upload
                    throw new AppError('Blob storage strategy not yet implemented', 501);

                case DOCUMENT_STRATEGY.SHAREPOINT_HYPERLINK:
                    // Optimized strategy for SharePoint hyperlink fields
                    // Provides multiple URL options for maximum UiPath compatibility
                    result.documentUrl = docInfo.cleanUrl || docInfo.url;
                    result.originalUrl = docInfo.url;
                    result.cleanUrl = docInfo.cleanUrl;
                    result.requiresDownload = true;
                    result.uipathCompatible = true;
                    result.instructions = 'Multiple URL formats provided for UiPath flexibility';
                    
                    // Try to get direct download URL if possible
                    if (accessToken && docInfo.documentId && siteId) {
                        try {
                            const directDownloadUrl = await this.getDirectDownloadUrl(
                                accessToken,
                                docInfo.documentId,
                                siteId
                            );
                            if (directDownloadUrl) {
                                result.directDownloadUrl = directDownloadUrl;
                                result.instructions = 'Direct download URL available for immediate file access';
                            }
                        } catch (error) {
                            this.logger.warn('Could not get direct download URL, using SharePoint URLs', {
                                service: 'sharepoint',
                                error: error.message,
                                documentId: docInfo.documentId
                            });
                        }
                    }
                    break;

                default:
                    throw validationError(`Unknown document strategy: ${strategy}`);
            }

            this.logger.info('Successfully processed document for UiPath', {
                service: 'sharepoint',
                fileName: result.fileName,
                strategy: result.strategy,
                hasContent: !!result.content,
                size: result.size
            });

            return result;

        } catch (error) {
            this.logger.error('Failed to process document for UiPath', {
                service: 'sharepoint',
                strategy,
                error: error.message,
                htmlContent: htmlContent?.substring(0, 100)
            });

            throw error;
        }
    }

    /**
     * Get file extension from file name
     * @param {string} fileName - File name
     * @returns {string} File extension
     */
    getFileExtension(fileName) {
        if (!fileName) return '';
        
        const lastDot = fileName.lastIndexOf('.');
        return lastDot > 0 ? fileName.substring(lastDot + 1).toLowerCase() : '';
    }

    /**
     * Determine best strategy for document processing based on file type and size
     * @param {string} fileName - File name
     * @param {number} estimatedSize - Estimated file size (optional)
     * @param {boolean} isSharePointHyperlink - Whether this is from a SharePoint hyperlink field
     * @returns {string} Recommended strategy
     */
    recommendStrategy(fileName, estimatedSize = null, isSharePointHyperlink = false) {
        const extension = this.getFileExtension(fileName);
        
        // For SharePoint hyperlink fields, use the optimized strategy
        if (isSharePointHyperlink) {
            return DOCUMENT_STRATEGY.SHAREPOINT_HYPERLINK;
        }
        
        // For Excel files that UiPath needs to process, download URL is usually best
        if (['xlsx', 'xls', 'csv'].includes(extension)) {
            if (estimatedSize && estimatedSize > UIPATH_LIMITS.MAX_BASE64_FILE_SIZE) {
                return DOCUMENT_STRATEGY.DOWNLOAD_URL;
            }
            // For smaller Excel files, base64 can work but download URL is more reliable
            return DOCUMENT_STRATEGY.DOWNLOAD_URL;
        }

        // For large files, always use download URL
        if (estimatedSize && estimatedSize > UIPATH_LIMITS.MAX_BASE64_FILE_SIZE) {
            return DOCUMENT_STRATEGY.DOWNLOAD_URL;
        }

        // Default to URL reference for simplicity
        return DOCUMENT_STRATEGY.URL_REFERENCE;
    }

    /**
     * Create UiPath-friendly document reference from SharePoint hyperlink HTML
     * This is the main method for handling SharePoint hyperlink fields in UiPath queues
     * @param {string} htmlContent - HTML content from SharePoint hyperlink field
     * @param {string} accessToken - Graph API access token (optional)
     * @param {string} siteId - SharePoint site ID (optional)
     * @returns {Promise<Object>} UiPath-friendly document reference
     */
    async createUiPathDocumentReference(htmlContent, accessToken = null, siteId = null) {
        try {
            // Use the optimized SharePoint hyperlink strategy
            const result = await this.processDocumentForUiPath(
                htmlContent,
                accessToken,
                {
                    strategy: DOCUMENT_STRATEGY.SHAREPOINT_HYPERLINK,
                    siteId: siteId
                }
            );

            // Transform to UiPath-friendly format
            if (result.hasDocument) {
                return {
                    hasDocument: true,
                    fileName: result.fileName,
                    fileExtension: result.fileExtension,
                    documentUrl: result.documentUrl,
                    cleanUrl: result.cleanUrl,
                    originalUrl: result.originalUrl,
                    directDownloadUrl: result.directDownloadUrl,
                    instructions: result.instructions,
                    uipathCompatible: true,
                    strategy: 'sharepoint_hyperlink',
                    processedAt: new Date().toISOString()
                };
            } else {
                return {
                    hasDocument: false,
                    error: result.error || 'Could not process SharePoint hyperlink',
                    originalContent: htmlContent?.substring(0, 100)
                };
            }

        } catch (error) {
            this.logger.error('Failed to create UiPath document reference', {
                service: 'sharepoint',
                error: error.message,
                htmlContent: htmlContent?.substring(0, 100)
            });

            // Return fallback reference with cleaned URL
            const docInfo = this.extractDocumentFromHTML(htmlContent);
            if (docInfo) {
                return {
                    hasDocument: true,
                    fileName: docInfo.fileName,
                    documentUrl: docInfo.cleanUrl || docInfo.url,
                    originalUrl: docInfo.url,
                    fallback: true,
                    error: error.message,
                    instructions: 'Fallback URL provided - UiPath should handle document access directly'
                };
            }

            return {
                hasDocument: false,
                error: error.message,
                originalContent: htmlContent?.substring(0, 100)
            };
        }
    }
}

/**
 * Create SharePoint document handler
 * @param {Object} context - Azure Functions context
 * @returns {SharePointDocumentHandler} Document handler instance
 */
function createDocumentHandler(context = null) {
    return new SharePointDocumentHandler(context);
}

module.exports = {
    SharePointDocumentHandler,
    createDocumentHandler,
    DOCUMENT_STRATEGY,
    UIPATH_LIMITS
};