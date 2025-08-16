/**
 * Test Document Processing for COSTCO SharePoint Integration
 * Demonstrates how Excel attachments are handled for UiPath automation
 */

// Load environment variables if dotenv is available
try {
    require('dotenv').config();
} catch (e) {
    // dotenv not available, continue without it
}
const { createDocumentHandler, DOCUMENT_STRATEGY } = require('../shared/sharepoint-document-handler');
const { createCostcoProcessor } = require('../templates/costco-inline-routing');
const { createLogger } = require('../shared/logger');

// Mock SharePoint list item with HTML document field
const mockCostcoItem = {
    ID: '123',
    fields: {
        Status: 'Send Generated Form',
        ShiptoEmail: 'test@costco.com',
        ShipDate: '12/20/2024',
        Style: 'ABC123',
        PO_No: 'PO-2024-001',
        GeneratedRoutingFormURL: `<div class="ExternalClassBB5440FD6A384D6783890C0CD9B44C5D">
            <a href="/sites/COSTCO-INLINE-Trafficking-Routing/_layouts/15/Doc.aspx?sourcedoc=%7BFABF99BB-403E-439F-8F9E-F10BB2247BB5%7D&amp;file=COSTCO%20FORM_267.xlsx&amp;action=default&amp;mobileredirect=true">
                COSTCO FORM_267.xlsx
            </a>
        </div>`,
        Title: 'Test COSTCO Routing Form'
    }
};

async function testDocumentExtraction() {
    console.log('🔍 Testing Document URL Extraction from HTML\n');
    
    const documentHandler = createDocumentHandler();
    const htmlContent = mockCostcoItem.fields.GeneratedRoutingFormURL;
    
    console.log('📄 Original HTML Content:');
    console.log(htmlContent);
    console.log('\n');
    
    // Extract document information
    const docInfo = documentHandler.extractDocumentFromHTML(htmlContent);
    
    if (docInfo) {
        console.log('✅ Document Information Extracted:');
        console.log(`  🔗 URL: ${docInfo.url}`);
        console.log(`  📁 File Name: ${docInfo.fileName}`);
        console.log(`  🆔 Document ID: ${docInfo.documentId || 'Not found'}`);
        console.log(`  📌 Type: ${docInfo.type}`);
        console.log(`  🏢 SharePoint Doc: ${docInfo.isSharePointDoc}`);
    } else {
        console.log('❌ Failed to extract document information');
    }
}

async function testDocumentStrategies() {
    console.log('\n📋 Testing Document Processing Strategies\n');
    
    const documentHandler = createDocumentHandler();
    const htmlContent = mockCostcoItem.fields.GeneratedRoutingFormURL;
    
    const strategies = [
        DOCUMENT_STRATEGY.URL_REFERENCE,
        DOCUMENT_STRATEGY.DOWNLOAD_URL
        // Note: BASE64_CONTENT and BLOB_STORAGE require authentication
    ];
    
    for (const strategy of strategies) {
        console.log(`\n🔄 Testing Strategy: ${strategy.toUpperCase()}`);
        console.log('─'.repeat(50));
        
        try {
            const result = await documentHandler.processDocumentForUiPath(
                htmlContent,
                null, // No access token for this test
                { strategy }
            );
            
            console.log('✅ Processing Result:');
            console.log(`  📁 File Name: ${result.fileName}`);
            console.log(`  📋 Strategy: ${result.strategy}`);
            console.log(`  📥 Requires Download: ${result.requiresDownload}`);
            console.log(`  📝 Instructions: ${result.instructions}`);
            
            if (result.documentUrl) {
                console.log(`  🔗 Document URL: ${result.documentUrl}`);
            }
            
            if (result.downloadUrl) {
                console.log(`  ⬇️ Download URL: ${result.downloadUrl}`);
            }
            
            if (result.content) {
                console.log(`  📦 Content Size: ${result.size} bytes`);
                console.log(`  🏷️ Content Type: ${result.contentType}`);
            }
            
        } catch (error) {
            console.log(`❌ Strategy failed: ${error.message}`);
        }
    }
}

async function testCostcoProcessorWithDocument() {
    console.log('\n🏭 Testing COSTCO Processor with Document Handling\n');
    
    const processor = createCostcoProcessor();
    
    try {
        // Process the document attachment first
        console.log('📎 Processing Document Attachment...');
        const documentInfo = await processor.processDocumentAttachment(mockCostcoItem);
        
        console.log('✅ Document Processing Result:');
        console.log(`  📁 Has Document: ${documentInfo.hasDocument}`);
        if (documentInfo.hasDocument) {
            console.log(`  📋 Strategy: ${documentInfo.strategy}`);
            console.log(`  📁 File Name: ${documentInfo.fileName}`);
            console.log(`  📝 Instructions: ${documentInfo.instructions}`);
        } else {
            console.log(`  ❌ Reason: ${documentInfo.reason}`);
        }
        
        // Transform data with document information
        console.log('\n🔄 Transforming Data for UiPath...');
        const transformedData = processor.transformItemData(mockCostcoItem, documentInfo);
        
        console.log('✅ Transformed Data Structure:');
        console.log(`  🏢 Process Type: ${transformedData.ProcessType}`);
        console.log(`  📧 Ship To Email: ${transformedData.ShipToEmail}`);
        console.log(`  📅 Ship Date: ${transformedData.ShipDate}`);
        console.log(`  🏷️ Style: ${transformedData.Style}`);
        console.log(`  📝 PO Number: ${transformedData.PONumber}`);
        console.log(`  📋 Status: ${transformedData.Status}`);
        
        // Document information
        console.log('\n📄 Document Information in Payload:');
        if (transformedData.Document) {
            console.log(`  📁 Has Document: ${transformedData.Document.HasDocument}`);
            if (transformedData.Document.HasDocument) {
                console.log(`  📋 Strategy: ${transformedData.Document.Strategy}`);
                console.log(`  📁 File Name: ${transformedData.Document.FileName}`);
                console.log(`  📥 Requires Download: ${transformedData.Document.RequiresDownload}`);
                console.log(`  📝 Instructions: ${transformedData.Document.Instructions}`);
                
                if (transformedData.Document.DocumentUrl) {
                    console.log(`  🔗 Document URL: ${transformedData.Document.DocumentUrl.substring(0, 80)}...`);
                }
            } else {
                console.log(`  ❌ Reason: ${transformedData.Document.Reason}`);
            }
        }
        
        // Show total field count
        console.log(`\n📊 Total Fields in Payload: ${Object.keys(transformedData).length}`);
        
        // Estimate payload size (rough approximation)
        const payloadJson = JSON.stringify(transformedData);
        const payloadSize = Buffer.byteLength(payloadJson, 'utf8');
        console.log(`📦 Estimated Payload Size: ${payloadSize} bytes (${(payloadSize / 1024).toFixed(2)} KB)`);
        
        if (payloadSize > 1024 * 1024) { // 1MB
            console.log('⚠️  Warning: Payload size is large - consider using download URL strategy');
        }
        
    } catch (error) {
        console.log(`❌ Processing failed: ${error.message}`);
        console.log(`🔍 Stack trace: ${error.stack}`);
    }
}

async function testRecommendedStrategy() {
    console.log('\n🎯 Testing Strategy Recommendations\n');
    
    const documentHandler = createDocumentHandler();
    
    const testFiles = [
        { name: 'COSTCO_FORM_267.xlsx', size: 1024 * 100 },      // 100KB Excel
        { name: 'large_report.xlsx', size: 1024 * 1024 * 5 },    // 5MB Excel
        { name: 'document.pdf', size: 1024 * 500 },              // 500KB PDF
        { name: 'image.png', size: 1024 * 1024 * 10 }            // 10MB Image
    ];
    
    testFiles.forEach(file => {
        const strategy = documentHandler.recommendStrategy(file.name, file.size);
        console.log(`📁 ${file.name} (${(file.size / 1024).toFixed(1)}KB): ${strategy}`);
    });
}

async function main() {
    console.log('🚀 SharePoint Document Processing Test Suite');
    console.log('='.repeat(60));
    console.log('This demonstrates how the COSTCO integration handles Excel attachments');
    console.log('and prepares them for UiPath automation processing.\n');
    
    try {
        await testDocumentExtraction();
        await testDocumentStrategies();
        await testRecommendedStrategy();
        await testCostcoProcessorWithDocument();
        
        console.log('\n✅ All tests completed successfully!');
        console.log('\n📋 Summary of Document Handling Approaches:');
        console.log('1. 🔗 URL_REFERENCE: Pass SharePoint URL to UiPath (simplest)');
        console.log('2. ⬇️ DOWNLOAD_URL: Get direct download URL via Graph API (recommended for Excel)');
        console.log('3. 📦 BASE64_CONTENT: Embed file content in queue (small files only)');
        console.log('4. ☁️ BLOB_STORAGE: Store in Azure Blob, provide URL (future enhancement)');
        
        console.log('\n🎯 Recommendation for COSTCO Excel Files:');
        console.log('Use DOWNLOAD_URL strategy - provides direct access to Excel file');
        console.log('content while keeping UiPath queue payloads lightweight.');
        
    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        process.exit(1);
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = {
    testDocumentExtraction,
    testDocumentStrategies,
    testCostcoProcessorWithDocument,
    testRecommendedStrategy
};