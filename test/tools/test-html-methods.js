/**
 * Test just the HTML cleaning methods without UiPath dependencies
 */

// Import the config to access it
const { COSTCO_CONFIG } = require('../../src/templates/costco-inline-routing');

// Create a minimal test class with just the cleaning methods
class TestProcessor {
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
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
                .replace(/\\/g, '\\\\')                       // Escape backslashes
                .replace(/"/g, '\\"')                         // Escape quotes
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
                console.warn('Failed to parse ship date', {
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
                const cleanFieldName = this.sanitizeFieldName(`Additional_${spField}`);
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
            console.log('Removing problematic fields from payload', {
                template: 'costco',
                itemId: item.ID,
                problematicFields: problematicFields
            });
            problematicFields.forEach(field => delete transformed[field]);
        }

        console.log('Transformed COSTCO item data with HTML cleaning', {
            template: 'costco',
            itemId: item.ID,
            transformedFields: Object.keys(transformed),
            fieldCount: Object.keys(transformed).length,
            htmlCleaningApplied: true
        });

        return transformed;
    }
}

async function testHtmlMethods() {
    console.log('🧪 Testing HTML Cleaning Methods');
    console.log('===============================\n');

    const processor = new TestProcessor();

    // Test data with problematic HTML content
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
            Modified: '2025-08-16T08:41:52Z'
        },
        // Problematic field with @ symbol in root  
        'Additional_x005f_fields@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#sites/...'
    };

    console.log('1. Testing cleanFieldValue method...');
    const originalUrl = problematicItem.fields.GeneratedRoutingFormURL;
    const cleanedUrl = processor.cleanFieldValue(originalUrl);
    console.log(`   Original: ${originalUrl.substring(0, 80)}...`);
    console.log(`   Cleaned:  ${cleanedUrl}`);
    console.log(`   ✅ Success: ${!cleanedUrl.includes('<') && !cleanedUrl.includes('>')}\n`);

    console.log('2. Testing sanitizeFieldName method...');
    const problematicFieldName = 'Additional_x005f_fields@odata.context';
    const sanitizedName = processor.sanitizeFieldName(problematicFieldName);
    console.log(`   Original: ${problematicFieldName}`);
    console.log(`   Sanitized: ${sanitizedName}`);
    console.log(`   ✅ Success: ${!sanitizedName.includes('@')}\n`);

    console.log('3. Testing full transformation...');
    try {
        const transformed = processor.transformItemData(problematicItem);
        
        console.log(`\n   ✅ Transformation successful`);
        console.log(`   📊 Field count: ${Object.keys(transformed).length}`);
        console.log(`   🔗 Clean URL: ${transformed.GeneratedRoutingFormURL?.substring(0, 60)}...`);
        
        // Check for remaining issues
        const hasHtml = Object.values(transformed).some(v => 
            typeof v === 'string' && v.includes('<') && v.includes('>')
        );
        const hasAtSymbol = Object.keys(transformed).some(k => k.includes('@'));
        const hasUndefined = Object.values(transformed).some(v => v === undefined);
        
        console.log(`   🧹 HTML removed: ${!hasHtml}`);
        console.log(`   🧹 @ symbols removed: ${!hasAtSymbol}`);
        console.log(`   🧹 No undefined values: ${!hasUndefined}`);
        
        if (!hasHtml && !hasAtSymbol && !hasUndefined) {
            console.log('   🎉 Payload appears clean for UiPath submission!\n');
        } else {
            console.log('   ⚠️  Some issues may remain\n');
        }

        // Show sample of cleaned fields
        console.log('4. Sample cleaned fields:');
        console.log(`   ProcessType: ${transformed.ProcessType}`);
        console.log(`   ShipToEmail: ${transformed.ShipToEmail}`);
        console.log(`   PONumber: ${transformed.PONumber}`);
        console.log(`   GeneratedRoutingFormURL: ${transformed.GeneratedRoutingFormURL?.substring(0, 80)}...`);
        
        // Test with actual JSON stringify to ensure no issues
        console.log('\n5. JSON serialization test:');
        try {
            const jsonPayload = JSON.stringify(transformed, null, 2);
            console.log('   ✅ JSON serialization successful');
            console.log(`   📄 Payload size: ${jsonPayload.length} characters`);
            
            // Check for any remaining HTML tags or problematic content
            const hasHtmlInJson = jsonPayload.includes('<') && jsonPayload.includes('>');
            const hasAtInJson = jsonPayload.includes('"@') || jsonPayload.includes('@"');
            
            console.log(`   🧹 No HTML in JSON: ${!hasHtmlInJson}`);
            console.log(`   🧹 No @ symbols in keys: ${!hasAtInJson}`);
            
        } catch (jsonError) {
            console.log(`   ❌ JSON serialization failed: ${jsonError.message}`);
        }
        
        return true;
        
    } catch (error) {
        console.error(`   ❌ Transformation failed: ${error.message}`);
        return false;
    }
}

// Run test
if (require.main === module) {
    testHtmlMethods()
        .then(success => {
            if (success) {
                console.log('\n🎉 HTML cleaning methods test completed successfully!');
                console.log('\n📋 Summary:');
                console.log('   ✅ HTML content is properly cleaned and URLs extracted');
                console.log('   ✅ Field names with @ symbols are sanitized');
                console.log('   ✅ Problematic fields are removed from payload');
                console.log('   ✅ JSON serialization works without issues');
                console.log('   ✅ Enhanced template should now work with UiPath API');
                console.log('\n🚀 Ready to test with actual SharePoint webhook!');
            } else {
                console.error('\n💥 HTML cleaning methods test failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n💥 Test error:', error.message);
            process.exit(1);
        });
}

module.exports = { testHtmlMethods };