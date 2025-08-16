/**
 * Test SharePoint Hyperlink Processing for UiPath Integration
 * Tests the new document handling strategy for SharePoint hyperlink fields
 */

const { createDocumentHandler, DOCUMENT_STRATEGY } = require('../shared/sharepoint-document-handler');
const { createCostcoProcessor } = require('../templates/costco-inline-routing');
const { createUiPathQueueClient } = require('../shared/uipath-queue-client');
const { createLogger } = require('../shared/logger');

// Test HTML content that was causing the "queueItemParameters must not be null" error
const PROBLEMATIC_HTML = `<div class="ExternalClassBB5440FD6A384D6783890C0CD9B44C5D">
  <a href="/sites/COSTCO-INLINE-Trafficking-Routing/_layouts/15/Doc.aspx?sourcedoc=%7BFABF99BB-403E-439F-8F9E-F10BB2247BB5%7D&amp;file=COSTCO%20FORM_267.xlsx&amp;action=default&amp;mobileredirect=true">
    COSTCO FORM_267.xlsx
  </a>
</div>`;

// Additional test cases
const TEST_CASES = [
    {
        name: 'COSTCO Form with HTML Wrapper',
        html: PROBLEMATIC_HTML,
        expectedFileName: 'COSTCO FORM_267.xlsx',
        expectedDocumentId: 'FABF99BB-403E-439F-8F9E-F10BB2247BB5'
    },
    {
        name: 'Simple URL without HTML',
        html: '/sites/COSTCO-INLINE-Trafficking-Routing/_layouts/15/Doc.aspx?sourcedoc={GUID123}&file=TestFile.xlsx',
        expectedFileName: 'TestFile.xlsx',
        expectedDocumentId: 'GUID123'
    },
    {
        name: 'Complex HTML with multiple attributes',
        html: `<div class="ms-rtestate-field"><a href="/sites/test/_layouts/15/Doc.aspx?sourcedoc=%7B12345678-1234-1234-1234-123456789012%7D&amp;file=Report%20Document.xlsx&amp;action=default" target="_blank">Report Document.xlsx</a></div>`,
        expectedFileName: 'Report Document.xlsx',
        expectedDocumentId: '12345678-1234-1234-1234-123456789012'
    },
    {
        name: 'URL with encoded spaces and special characters',
        html: `<a href="/sites/test/_layouts/15/Doc.aspx?sourcedoc={ABCD1234}&amp;file=File%20with%20Spaces%20%26%20Special.xlsx">File with Spaces &amp; Special.xlsx</a>`,
        expectedFileName: 'File with Spaces & Special.xlsx',
        expectedDocumentId: 'ABCD1234'
    }
];

async function runTests() {
    const logger = createLogger();
    const documentHandler = createDocumentHandler();
    const costcoProcessor = createCostcoProcessor();
    const queueClient = createUiPathQueueClient();
    
    console.log('🔍 Testing SharePoint Hyperlink Processing for UiPath Integration');
    console.log('=' * 80);
    
    let passedTests = 0;
    let totalTests = 0;
    
    // Test 1: Document Extraction
    console.log('\n📋 Test 1: Document Information Extraction');
    console.log('-' * 50);
    
    for (const testCase of TEST_CASES) {
        totalTests++;
        console.log(`\nTesting: ${testCase.name}`);
        
        try {
            const docInfo = documentHandler.extractDocumentFromHTML(testCase.html);
            
            if (docInfo) {
                console.log(`✅ Extracted document info:`);
                console.log(`   - File Name: ${docInfo.fileName}`);
                console.log(`   - Document ID: ${docInfo.documentId}`);
                console.log(`   - Original URL: ${docInfo.url}`);
                console.log(`   - Clean URL: ${docInfo.cleanUrl}`);
                
                // Validate expectations
                if (docInfo.fileName === testCase.expectedFileName && 
                    docInfo.documentId === testCase.expectedDocumentId) {
                    console.log(`✅ Validation passed`);
                    passedTests++;
                } else {
                    console.log(`❌ Validation failed:`);
                    console.log(`   Expected file: ${testCase.expectedFileName}, got: ${docInfo.fileName}`);
                    console.log(`   Expected ID: ${testCase.expectedDocumentId}, got: ${docInfo.documentId}`);
                }
            } else {
                console.log(`❌ Failed to extract document info`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    
    // Test 2: UiPath Document Reference Creation
    console.log('\n📋 Test 2: UiPath Document Reference Creation');
    console.log('-' * 50);
    
    totalTests++;
    try {
        const uipathRef = await documentHandler.createUiPathDocumentReference(PROBLEMATIC_HTML);
        
        console.log(`✅ UiPath reference created:`);
        console.log(`   - Has Document: ${uipathRef.hasDocument}`);
        console.log(`   - Strategy: ${uipathRef.strategy}`);
        console.log(`   - UiPath Compatible: ${uipathRef.uipathCompatible}`);
        console.log(`   - File Name: ${uipathRef.fileName}`);
        console.log(`   - Document URL: ${uipathRef.documentUrl}`);
        console.log(`   - Clean URL: ${uipathRef.cleanUrl}`);
        console.log(`   - Instructions: ${uipathRef.instructions}`);
        
        if (uipathRef.hasDocument && uipathRef.uipathCompatible) {
            console.log(`✅ UiPath reference validation passed`);
            passedTests++;
        } else {
            console.log(`❌ UiPath reference validation failed`);
        }
    } catch (error) {
        console.log(`❌ Error creating UiPath reference: ${error.message}`);
    }
    
    // Test 3: COSTCO Template Integration
    console.log('\n📋 Test 3: COSTCO Template Document Processing');
    console.log('-' * 50);
    
    totalTests++;
    try {
        // Create a mock COSTCO item with the problematic HTML
        const mockCostcoItem = {
            ID: 'TEST_ITEM_1',
            Status: 'Send Generated Form',
            fields: {
                ShiptoEmail: 'test@costco.com',
                ShipDate: '12/25/2024',
                Style: 'TEST_STYLE',
                PO_No: 'TEST_PO_123',
                GeneratedRoutingFormURL: PROBLEMATIC_HTML
            }
        };
        
        const documentInfo = await costcoProcessor.processDocumentAttachment(mockCostcoItem);
        
        console.log(`✅ COSTCO document processing completed:`);
        console.log(`   - Has Document: ${documentInfo.hasDocument}`);
        console.log(`   - Strategy: ${documentInfo.strategy}`);
        console.log(`   - File Name: ${documentInfo.fileName}`);
        console.log(`   - UiPath Compatible: ${documentInfo.uipathCompatible}`);
        
        if (documentInfo.hasDocument) {
            console.log(`✅ COSTCO template processing passed`);
            passedTests++;
        } else {
            console.log(`❌ COSTCO template processing failed: ${documentInfo.reason || documentInfo.error}`);
        }
    } catch (error) {
        console.log(`❌ Error in COSTCO template processing: ${error.message}`);
    }
    
    // Test 4: Queue Payload Validation
    console.log('\n📋 Test 4: UiPath Queue Payload Validation');
    console.log('-' * 50);
    
    totalTests++;
    try {
        const mockCostcoItem = {
            ID: 'TEST_ITEM_2',
            Status: 'Send Generated Form',
            fields: {
                ShiptoEmail: 'test@costco.com',
                ShipDate: '12/25/2024',
                Style: 'TEST_STYLE',
                PO_No: 'TEST_PO_456',
                GeneratedRoutingFormURL: PROBLEMATIC_HTML
            }
        };
        
        // Process document attachment
        const documentInfo = await costcoProcessor.processDocumentAttachment(mockCostcoItem);
        
        // Transform data for UiPath
        const transformedData = costcoProcessor.transformItemData(mockCostcoItem, documentInfo);
        
        // Create queue payload
        const queuePayload = queueClient.createQueueItemPayload('TEST_QUEUE', {
            priority: 'High',
            reference: `TEST_${Date.now()}`,
            specificContent: transformedData
        });
        
        // Validate payload structure
        queueClient.validateApiPayload(queuePayload, 'TEST_QUEUE');
        
        console.log(`✅ Queue payload validation passed:`);
        console.log(`   - Queue Name: ${queuePayload.itemData.Name}`);
        console.log(`   - Priority: ${queuePayload.itemData.Priority}`);
        console.log(`   - Specific Content Keys: ${Object.keys(queuePayload.itemData.SpecificContent).length}`);
        console.log(`   - Document Info: ${queuePayload.itemData.SpecificContent.Document ? 'Present' : 'Missing'}`);
        
        if (queuePayload.itemData.SpecificContent.Document) {
            const doc = queuePayload.itemData.SpecificContent.Document;
            console.log(`   - Document Strategy: ${doc.Strategy}`);
            console.log(`   - Document URL: ${doc.DocumentUrl ? 'Present' : 'Missing'}`);
            console.log(`   - Clean URL: ${doc.CleanUrl ? 'Present' : 'Missing'}`);
        }
        
        passedTests++;
    } catch (error) {
        console.log(`❌ Error in queue payload validation: ${error.message}`);
        console.log(`   This would cause the "queueItemParameters must not be null" error`);
    }
    
    // Test 5: HTML Entity Decoding
    console.log('\n📋 Test 5: HTML Entity Decoding');
    console.log('-' * 50);
    
    totalTests++;
    try {
        const htmlWithEntities = `<a href="/test?param1=value1&amp;param2=value%20with%20spaces&amp;param3=&quot;quoted&quot;">Test Link</a>`;
        const docInfo = documentHandler.extractDocumentFromHTML(htmlWithEntities);
        
        if (docInfo && docInfo.url.includes('&') && !docInfo.url.includes('&amp;')) {
            console.log(`✅ HTML entity decoding passed:`);
            console.log(`   - Original: ${htmlWithEntities}`);
            console.log(`   - Decoded URL: ${docInfo.url}`);
            passedTests++;
        } else {
            console.log(`❌ HTML entity decoding failed`);
            console.log(`   - URL: ${docInfo?.url}`);
        }
    } catch (error) {
        console.log(`❌ Error in HTML entity decoding: ${error.message}`);
    }
    
    // Test Results Summary
    console.log('\n📊 Test Results Summary');
    console.log('=' * 80);
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 All tests passed! SharePoint hyperlink processing is working correctly.');
        console.log('\n✅ The "queueItemParameters must not be null" error should be resolved.');
        console.log('\n🚀 UiPath automations can now process SharePoint documents using:');
        console.log('   - Document.DocumentUrl (primary URL for UiPath access)');
        console.log('   - Document.CleanUrl (cleaned SharePoint URL)');
        console.log('   - Document.DirectDownloadUrl (if Graph API access is available)');
        console.log('   - Document.OriginalUrl (fallback to original hyperlink)');
    } else {
        console.log('\n❌ Some tests failed. Please review the implementation.');
    }
    
    return {
        totalTests,
        passedTests,
        successRate: (passedTests / totalTests) * 100
    };
}

// Usage example for real SharePoint integration
function showUsageExample() {
    console.log('\n📋 Usage Example for SharePoint Webhook Integration');
    console.log('=' * 80);
    
    const exampleCode = `
// In your SharePoint webhook handler:

const { createDocumentHandler } = require('../shared/sharepoint-document-handler');
const { createCostcoProcessor } = require('../templates/costco-inline-routing');

async function processSharePointItem(sharePointItem, accessToken) {
    const costcoProcessor = createCostcoProcessor();
    
    // Process the hyperlink field (this will handle the HTML content)
    const documentInfo = await costcoProcessor.processDocumentAttachment(
        sharePointItem, 
        accessToken
    );
    
    // Transform for UiPath with document information
    const transformedData = costcoProcessor.transformItemData(sharePointItem, documentInfo);
    
    // Submit to UiPath queue - no more "queueItemParameters must not be null" error
    const result = await costcoProcessor.processItem(sharePointItem);
    
    return result;
}

// The UiPath automation can now access the document using:
// - Document.DocumentUrl (recommended for UiPath HTTP Request activities)
// - Document.DirectDownloadUrl (if available, for immediate download)
// - Document.CleanUrl (cleaned SharePoint URL for browser automation)
`;
    
    console.log(exampleCode);
}

// Run the tests if this file is executed directly
if (require.main === module) {
    runTests()
        .then((results) => {
            showUsageExample();
            process.exit(results.successRate === 100 ? 0 : 1);
        })
        .catch((error) => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = {
    runTests,
    TEST_CASES,
    PROBLEMATIC_HTML
};