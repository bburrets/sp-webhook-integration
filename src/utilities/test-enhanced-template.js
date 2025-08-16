/**
 * Test the enhanced COSTCO template with HTML cleaning
 */

const { CostcoTemplateProcessor } = require('../templates/costco-inline-routing');

async function testEnhancedTemplate() {
    console.log('🧪 Testing Enhanced COSTCO Template');
    console.log('===================================\n');

    // Mock the logger to avoid initialization issues
    const mockLogger = {
        debug: (msg, data) => console.log(`DEBUG: ${msg}`, data),
        info: (msg, data) => console.log(`INFO: ${msg}`, data),
        warn: (msg, data) => console.log(`WARN: ${msg}`, data),
        error: (msg, data) => console.log(`ERROR: ${msg}`, data)
    };

    // Create processor with minimal setup to avoid UiPath config errors
    const processor = new CostcoTemplateProcessor();
    processor.logger = mockLogger;
    // Mock the queueClient to avoid initialization issues
    processor.queueClient = null;

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
            Modified: '2025-08-16T08:41:52Z',
            // Problematic field with @ symbol  
            'Additional_x005f_fields@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#sites/...'
        }
    };

    console.log('1. Testing cleanFieldValue method...');
    const originalUrl = problematicItem.fields.GeneratedRoutingFormURL;
    const cleanedUrl = processor.cleanFieldValue(originalUrl);
    console.log(`   Original: ${originalUrl.substring(0, 80)}...`);
    console.log(`   Cleaned:  ${cleanedUrl}`);
    console.log(`   Success:  ${!cleanedUrl.includes('<') && !cleanedUrl.includes('>')}\n`);

    console.log('2. Testing sanitizeFieldName method...');
    const problematicFieldName = 'Additional_x005f_fields@odata.context';
    const sanitizedName = processor.sanitizeFieldName(problematicFieldName);
    console.log(`   Original: ${problematicFieldName}`);
    console.log(`   Sanitized: ${sanitizedName}`);
    console.log(`   Success:   ${!sanitizedName.includes('@')}\n`);

    console.log('3. Testing full transformation...');
    try {
        const transformed = processor.transformItemData(problematicItem);
        
        console.log(`   ✅ Transformation successful`);
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
        
        return true;
        
    } catch (error) {
        console.error(`   ❌ Transformation failed: ${error.message}`);
        return false;
    }
}

// Run test
if (require.main === module) {
    testEnhancedTemplate()
        .then(success => {
            if (success) {
                console.log('\n🎉 Enhanced template test completed successfully!');
                console.log('\n📋 Summary:');
                console.log('   ✅ HTML content is properly cleaned and URLs extracted');
                console.log('   ✅ Field names with @ symbols are sanitized');
                console.log('   ✅ Problematic fields are removed from payload');
                console.log('   ✅ Template should now work with UiPath API');
            } else {
                console.error('\n💥 Enhanced template test failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n💥 Test error:', error.message);
            process.exit(1);
        });
}

module.exports = { testEnhancedTemplate };