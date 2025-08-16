/**
 * Utility to diagnose and fix HTML content in payload causing UiPath API rejection
 * 
 * ISSUE ANALYSIS:
 * Based on the logs showing "queueItemParameters must not be null" error,
 * the problem likely stems from:
 * 1. HTML content in GeneratedRoutingFormURL field
 * 2. Special characters (@, &) in field names or values  
 * 3. Potentially malformed JSON due to HTML encoding
 */

const { createCostcoProcessor } = require('../../src/templates/costco-inline-routing');
const { createUiPathQueueClient } = require('../../src/shared/uipath-queue-client');

/**
 * HTML/Text cleaning utilities
 */
class PayloadCleaner {
    /**
     * Extract clean URL from HTML content
     * @param {string} htmlContent - HTML content like "<div>...</div>"
     * @returns {string} Clean URL or text
     */
    static extractCleanUrl(htmlContent) {
        if (!htmlContent || typeof htmlContent !== 'string') {
            return htmlContent;
        }

        // Check if it contains HTML
        if (htmlContent.includes('<') && htmlContent.includes('>')) {
            // Extract href from anchor tag
            const hrefMatch = htmlContent.match(/href=["']([^"']+)["']/);
            if (hrefMatch) {
                return hrefMatch[1];
            }

            // Extract text content from HTML tags
            const textMatch = htmlContent.replace(/<[^>]*>/g, '');
            if (textMatch.trim()) {
                return textMatch.trim();
            }
        }

        return htmlContent;
    }

    /**
     * Sanitize field names to avoid UiPath issues
     * @param {string} fieldName - Original field name
     * @returns {string} Sanitized field name
     */
    static sanitizeFieldName(fieldName) {
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
     * Sanitize field values to avoid JSON parsing issues
     * @param {*} value - Field value
     * @returns {*} Sanitized value
     */
    static sanitizeFieldValue(value) {
        if (value === null || value === undefined) {
            return '';
        }

        if (typeof value === 'string') {
            // Clean HTML content
            let cleaned = this.extractCleanUrl(value);
            
            // Remove problematic characters that might break JSON
            cleaned = cleaned
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
                .replace(/\\/g, '\\\\')                       // Escape backslashes
                .replace(/"/g, '\\"')                         // Escape quotes
                .trim();
            
            return cleaned;
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
     * Clean entire payload for UiPath submission
     * @param {Object} payload - Original payload
     * @returns {Object} Cleaned payload
     */
    static cleanPayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return payload;
        }

        const cleaned = {};

        for (const [key, value] of Object.entries(payload)) {
            const cleanKey = this.sanitizeFieldName(key);
            const cleanValue = this.sanitizeFieldValue(value);
            
            // Skip undefined or empty keys
            if (cleanKey && cleanKey !== 'undefined') {
                cleaned[cleanKey] = cleanValue;
            }
        }

        return cleaned;
    }
}

/**
 * Enhanced Costco processor with HTML cleaning
 */
class EnhancedCostcoProcessor {
    constructor(context = null) {
        this.baseProcessor = createCostcoProcessor(context);
        this.queueClient = createUiPathQueueClient(context);
    }

    /**
     * Transform item data with HTML content cleaning
     * @param {Object} item - SharePoint item
     * @returns {Object} Cleaned and transformed data
     */
    transformItemData(item) {
        // Get base transformation
        const baseData = this.baseProcessor.transformItemData(item);
        
        // Apply cleaning to all fields
        const cleanedData = PayloadCleaner.cleanPayload(baseData);
        
        // Special handling for known problematic fields
        if (cleanedData.GeneratedRoutingFormURL) {
            const originalUrl = cleanedData.GeneratedRoutingFormURL;
            cleanedData.GeneratedRoutingFormURL = PayloadCleaner.extractCleanUrl(originalUrl);
            
            // Log the transformation for debugging
            if (originalUrl !== cleanedData.GeneratedRoutingFormURL) {
                console.log('🧹 Cleaned GeneratedRoutingFormURL:');
                console.log(`   Original: ${originalUrl.substring(0, 100)}...`);
                console.log(`   Cleaned:  ${cleanedData.GeneratedRoutingFormURL}`);
            }
        }

        // Remove any fields with problematic names
        const problematicFields = Object.keys(cleanedData).filter(key => 
            key.includes('@') || 
            key.includes('undefined') || 
            key.includes('$') ||
            key.length === 0
        );

        if (problematicFields.length > 0) {
            console.log(`🚨 Removing problematic fields: ${problematicFields.join(', ')}`);
            problematicFields.forEach(field => delete cleanedData[field]);
        }

        return cleanedData;
    }

    /**
     * Process item with enhanced error handling and cleaning
     * @param {Object} item - SharePoint item
     * @param {Object} previousItem - Previous item state
     * @param {string} queueNameOverride - Queue name override
     * @returns {Promise<Object>} Processing result
     */
    async processItem(item, previousItem = null, queueNameOverride = null) {
        try {
            // Check processing criteria
            if (!this.baseProcessor.shouldProcessItem(item, previousItem)) {
                return {
                    processed: false,
                    reason: 'Item does not meet processing criteria',
                    itemId: item.ID
                };
            }

            // Validate required fields
            this.baseProcessor.validateRequiredFields(item);

            // Transform with cleaning
            const transformedData = this.transformItemData(item);
            
            console.log('🔍 Final payload analysis:');
            console.log(`   Field count: ${Object.keys(transformedData).length}`);
            console.log(`   Sample fields: ${Object.keys(transformedData).slice(0, 5).join(', ')}`);
            
            // Check for any remaining issues
            const issues = [];
            for (const [key, value] of Object.entries(transformedData)) {
                if (value === undefined) issues.push(`${key}=undefined`);
                if (key.includes('@')) issues.push(`${key} contains @`);
                if (typeof value === 'object') issues.push(`${key} is object`);
            }
            
            if (issues.length > 0) {
                console.log(`⚠️  Remaining issues: ${issues.join(', ')}`);
            } else {
                console.log('✅ No obvious payload issues detected');
            }

            // Submit to queue with enhanced error handling
            const queueName = queueNameOverride || 'COSTCO-INLINE-Routing';
            const cleanPONumber = transformedData.PONumber ? 
                transformedData.PONumber.replace(/[,\s]/g, '_') : 'NOPO';
            const itemId = item.id || item.ID || item.fields?.id || 'NOID';
            
            console.log(`📤 Submitting to queue: ${queueName}`);
            console.log(`📝 Reference: COSTCO_${cleanPONumber}_${itemId}_${Date.now()}`);
            
            const queueResult = await this.queueClient.submitQueueItem(
                queueName,
                {
                    priority: 'High',
                    reference: `COSTCO_${cleanPONumber}_${itemId}_${Date.now()}`,
                    specificContent: transformedData
                }
            );

            return {
                processed: true,
                queueSubmission: queueResult,
                itemId: item.ID,
                poNumber: transformedData.PONumber,
                template: 'costco-enhanced',
                cleaningApplied: true
            };

        } catch (error) {
            console.error('💥 Enhanced processing failed:', error.message);
            
            // Additional diagnostics for UiPath API errors
            if (error.message.includes('queueItemParameters must not be null')) {
                console.log('\n🔧 DIAGNOSTIC: queueItemParameters error detected');
                console.log('   This usually indicates:');
                console.log('   1. Queue name mismatch between URL and payload');
                console.log('   2. Invalid SpecificContent structure');
                console.log('   3. HTML or special characters in field values');
                console.log('   4. Undefined values in payload');
                
                // Log the actual transformed data for debugging
                console.log('\n📋 Transformed data being sent:');
                const transformedData = this.transformItemData(item);
                console.log(JSON.stringify(transformedData, null, 2));
            }

            return {
                processed: false,
                error: error.message,
                itemId: item?.ID,
                template: 'costco-enhanced',
                diagnosticsAvailable: true
            };
        }
    }
}

/**
 * Test function to verify the fix
 */
async function testHtmlPayloadFix() {
    console.log('🧪 Testing HTML Payload Fix');
    console.log('===========================\n');

    // Simulate problematic SharePoint item with HTML content
    const problematicItem = {
        id: '4',
        fields: {
            ShiptoEmail: 'd584apt@costco.com',
            ShipDate: '1/23/2025',
            PO_No: '5840505241',
            Style: 'BR007268',
            Status: 'Send Generated Form',
            // This is the problematic HTML field from logs
            GeneratedRoutingFormURL: '<div class="ExternalClassBB5440FD6A384D6783890C0CD9B44C5D"><a href="/sites/COSTCO-INLINE-Trafficking-Routing/_layouts/15/Doc.aspx?sourcedoc=%7BFABF99BB-403E-439F-8F9E-F10BB2247BB5%7D&amp;file=COSTCO%20FORM_267.xlsx&amp;action=default&amp;mobileredirect=true">COSTCO FORM_267.xlsx</a></div>',
            Created: '2025-08-15T16:13:24Z',
            Modified: '2025-08-16T08:41:52Z',
            // Problematic field with @ symbol  
            'Additional_x005f_fields@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#sites/...'
        }
    };

    console.log('1. Testing HTML cleaning:');
    const originalUrl = problematicItem.fields.GeneratedRoutingFormURL;
    const cleanedUrl = PayloadCleaner.extractCleanUrl(originalUrl);
    
    console.log(`   Original: ${originalUrl.substring(0, 80)}...`);
    console.log(`   Cleaned:  ${cleanedUrl}`);
    console.log(`   Success:  ${!cleanedUrl.includes('<') && !cleanedUrl.includes('>')}\n`);

    console.log('2. Testing field name sanitization:');
    const problematicFieldName = 'Additional_x005f_fields@odata.context';
    const cleanedFieldName = PayloadCleaner.sanitizeFieldName(problematicFieldName);
    
    console.log(`   Original: ${problematicFieldName}`);
    console.log(`   Cleaned:  ${cleanedFieldName}`);
    console.log(`   Success:  ${!cleanedFieldName.includes('@')}\n`);

    console.log('3. Testing enhanced processor:');
    try {
        // Create minimal mock processor for testing transformation only
        const mockProcessor = {
            transformItemData: function(item) {
                // Simulate basic transformation
                const baseData = {
                    ProcessType: 'COSTCO_INLINE_ROUTING',
                    ShipToEmail: item.fields?.ShiptoEmail,
                    ShipDate: item.fields?.ShipDate,
                    Style: item.fields?.Style,
                    PONumber: item.fields?.PO_No,
                    Status: item.fields?.Status,
                    GeneratedRoutingFormURL: item.fields?.GeneratedRoutingFormURL,
                    TriggerSource: 'SharePoint_Webhook',
                    ProcessedAt: new Date().toISOString()
                };
                
                // Add the problematic field
                if (item.fields['Additional_x005f_fields@odata.context']) {
                    baseData['Additional_x005f_fields@odata.context'] = item.fields['Additional_x005f_fields@odata.context'];
                }
                
                return baseData;
            }
        };
        
        // Apply our cleaning to the mock transformation
        const baseData = mockProcessor.transformItemData(problematicItem);
        const transformedData = PayloadCleaner.cleanPayload(baseData);
        
        console.log(`   ✅ Transformation successful`);
        console.log(`   📊 Field count: ${Object.keys(transformedData).length}`);
        console.log(`   🔗 Clean URL: ${transformedData.GeneratedRoutingFormURL?.substring(0, 50)}...`);
        
        // Check for remaining issues
        const hasHtml = Object.values(transformedData).some(v => 
            typeof v === 'string' && v.includes('<') && v.includes('>')
        );
        const hasAtSymbol = Object.keys(transformedData).some(k => k.includes('@'));
        const hasUndefined = Object.values(transformedData).some(v => v === undefined);
        
        console.log(`   🧹 HTML removed: ${!hasHtml}`);
        console.log(`   🧹 @ symbols removed: ${!hasAtSymbol}`);
        console.log(`   🧹 No undefined values: ${!hasUndefined}`);
        
        if (!hasHtml && !hasAtSymbol && !hasUndefined) {
            console.log('   🎉 Payload appears clean for UiPath submission!\n');
        } else {
            console.log('   ⚠️  Some issues may remain\n');
        }
        
    } catch (error) {
        console.error(`   ❌ Transformation failed: ${error.message}\n`);
    }

    console.log('🏁 Test completed - check results above');
}

// Export the enhanced processor and utilities
module.exports = {
    EnhancedCostcoProcessor,
    PayloadCleaner,
    testHtmlPayloadFix
};

// Run test if executed directly
if (require.main === module) {
    testHtmlPayloadFix().catch(console.error);
}