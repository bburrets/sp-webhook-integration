/**
 * Apply HTML content fix to the existing Costco template
 * This updates the transformItemData method to clean HTML content and problematic field names
 */

const fs = require('fs');
const path = require('path');

async function applyHtmlFix() {
    console.log('🔧 Applying HTML Content Fix to COSTCO Template');
    console.log('===============================================\n');

    const templatePath = path.join(__dirname, '../templates/costco-inline-routing.js');
    
    // Read the current template
    console.log('1. Reading current template...');
    let templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Create the enhanced transform method with HTML cleaning
    const enhancedTransformMethod = `    /**
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
                    return hrefMatch[1];
                }

                // Extract text content from HTML tags
                const textMatch = value.replace(/<[^>]*>/g, '');
                if (textMatch.trim()) {
                    return textMatch.trim();
                }
            }
            
            // Remove problematic characters that might break JSON
            return value
                .replace(/[\\u0000-\\u001F\\u007F-\\u009F]/g, '') // Control characters
                .replace(/\\\\\\\\/g, '\\\\\\\\\\\\\\\\')                       // Escape backslashes
                .replace(/"/g, '\\\\\\\\"')                         // Escape quotes
                .trim();
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
            .replace(/\\\\./g, '_dot_')         // Dots
            .replace(/\\\\$/g, '_dollar_')      // Dollar signs
            .replace(/\\\\s+/g, '_')            // Multiple spaces to single underscore
            .replace(/[^\\\\w_]/g, '_')         // Any other special chars to underscore
            .replace(/_+/g, '_')             // Multiple underscores to single
            .replace(/^_|_$/g, '');          // Remove leading/trailing underscores
    }

    /**
     * Transform SharePoint item to UiPath queue format with HTML cleaning
     * @param {Object} item - SharePoint list item
     * @returns {Object} Transformed data for UiPath queue
     */
    transformItemData(item) {
        const transformed = {
            // Process metadata
            ProcessType: COSTCO_CONFIG.queueConfig.processType,
            QueueName: COSTCO_CONFIG.queueConfig.queueName,
            TriggerSource: 'SharePoint_Webhook',
            ProcessedAt: new Date().toISOString(),
            
            // SharePoint context - handle Graph API structure
            SharePointSiteUrl: 'https://fambrandsllc.sharepoint.com/sites/DWI/COSTCO-INLINE-Trafficking-Routing',
            SharePointListName: COSTCO_CONFIG.listIdentifiers.name,
            SharePointItemId: item.id || item.ID || item.fields?.id,
            SharePointItemUrl: item.webUrl || item.__metadata?.uri || null,
            
            // Core business data - handle both Graph API (item.fields) and direct field access
            // Graph API uses encoded field names, so check multiple variations
            ShipToEmail: item.fields?.Ship_x002d_toEmail || item.fields?.ShiptoEmail || item['Ship_x002d_toEmail'] || item['ShiptoEmail'] || item['Ship_x0020_To_x0020_Email'],
            ShipDate: item.fields?.ShipDate || item['ShipDate'] || item['Ship_x0020_Date'],
            Style: item.fields?.Style || item['Style'],
            PONumber: item.fields?.PO_x005f_No || item.fields?.PO_No || item['PO_x005f_No'] || item['PO_No'] || item['PO_x005f_no'],
            GeneratedRoutingFormURL: item.fields?.GeneratedRoutingFormURL || item['GeneratedRoutingFormURL'] || item['Generated_x0020_Routing_x0020_Form_x0020_URL'],
            Status: item.fields?.Status || item['Status'],
            
            // Additional context - handle Graph API structure
            Title: item.fields?.Title || item['Title'] || '',
            CreatedDate: item.createdDateTime || item.fields?.Created || item['Created'],
            ModifiedDate: item.lastModifiedDateTime || item.fields?.Modified || item['Modified'],
            CreatedBy: item.createdBy?.user?.displayName || item.fields?.Author?.Title || item['Author'],
            ModifiedBy: item.lastModifiedBy?.user?.displayName || item.fields?.Editor?.Title || item['Editor']
        };

        // Apply HTML cleaning to all string fields
        for (const [key, value] of Object.entries(transformed)) {
            if (typeof value === 'string') {
                transformed[key] = this.cleanFieldValue(value);
            }
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

        // Add any additional simple fields (non-objects) present in the item
        // Skip complex objects and apply field name sanitization
        for (const [spField, value] of Object.entries(item)) {
            if (!COSTCO_CONFIG.fieldMappings[spField] && 
                !spField.startsWith('__') && 
                !spField.startsWith('@') &&
                value !== null && 
                value !== undefined &&
                typeof value !== 'object') {  // Only include simple values
                
                // Sanitize field name and clean value
                const cleanFieldName = this.sanitizeFieldName('Additional_' + spField);
                const cleanValue = this.cleanFieldValue(value);
                
                // Only add if field name is valid and doesn't contain 'undefined'
                if (cleanFieldName && !cleanFieldName.includes('undefined') && cleanFieldName !== 'undefined') {
                    transformed[cleanFieldName] = cleanValue;
                }
            }
        }

        // Final cleanup - remove any problematic fields that might have slipped through
        const problematicFields = Object.keys(transformed).filter(key => 
            key.includes('@') || 
            key.includes('undefined') || 
            key.includes('$') ||
            key.length === 0 ||
            transformed[key] === undefined
        );

        if (problematicFields.length > 0) {
            this.logger.warn('Removing problematic fields from payload', {
                template: 'costco',
                itemId: item.ID,
                problematicFields: problematicFields
            });
            problematicFields.forEach(field => delete transformed[field]);
        }

        this.logger.debug('Transformed COSTCO item data with HTML cleaning', {
            template: 'costco',
            itemId: item.ID,
            transformedFields: Object.keys(transformed),
            fieldCount: Object.keys(transformed).length,
            htmlCleaningApplied: true
        });

        return transformed;
    }`;

    // Replace the existing transformItemData method
    console.log('2. Applying HTML cleaning enhancements...');
    
    // Find the start and end of the existing transformItemData method
    const methodStart = templateContent.indexOf('transformItemData(item) {');
    const methodEnd = templateContent.indexOf('\n    }', methodStart) + 6; // Include closing brace
    
    if (methodStart === -1) {
        console.error('❌ Could not find transformItemData method in template');
        return false;
    }
    
    // Replace the method
    const beforeMethod = templateContent.substring(0, methodStart - 4); // Remove the leading spaces
    const afterMethod = templateContent.substring(methodEnd);
    
    const updatedContent = beforeMethod + enhancedTransformMethod + afterMethod;
    
    // Create backup
    const backupPath = templatePath + '.backup.' + Date.now();
    console.log(`3. Creating backup at: ${backupPath}`);
    fs.writeFileSync(backupPath, templateContent);
    
    // Write updated content
    console.log('4. Writing enhanced template...');
    fs.writeFileSync(templatePath, updatedContent);
    
    console.log('✅ HTML cleaning fix applied successfully!');
    console.log('\\n📋 Changes made:');
    console.log('   - Added cleanFieldValue() method to remove HTML tags and extract URLs');
    console.log('   - Added sanitizeFieldName() method to handle @ symbols and special chars');
    console.log('   - Enhanced transformItemData() to apply cleaning to all fields');
    console.log('   - Added final cleanup to remove any problematic fields');
    console.log('   - Added logging for transparency');
    
    console.log('\\n⚠️  Please test the webhook with a problematic SharePoint item to verify the fix');
    
    return true;
}

// Run the fix
if (require.main === module) {
    applyHtmlFix()
        .then(success => {
            if (success) {
                console.log('\\n🎉 Fix applied successfully!');
            } else {
                console.error('\\n💥 Fix failed to apply');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\\n💥 Error applying fix:', error.message);
            process.exit(1);
        });
}

module.exports = { applyHtmlFix };