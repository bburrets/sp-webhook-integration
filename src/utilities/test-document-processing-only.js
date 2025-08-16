/**
 * Test SharePoint Hyperlink Document Processing (Standalone)
 * Tests the document handling without requiring UiPath configuration
 */

const { createDocumentHandler, DOCUMENT_STRATEGY } = require('../shared/sharepoint-document-handler');

// Test HTML content that was causing the "queueItemParameters must not be null" error
const PROBLEMATIC_HTML = `<div class="ExternalClassBB5440FD6A384D6783890C0CD9B44C5D">
  <a href="/sites/COSTCO-INLINE-Trafficking-Routing/_layouts/15/Doc.aspx?sourcedoc=%7BFABF99BB-403E-439F-8F9E-F10BB2247BB5%7D&amp;file=COSTCO%20FORM_267.xlsx&amp;action=default&amp;mobileredirect=true">
    COSTCO FORM_267.xlsx
  </a>
</div>`;

// Additional test cases
const TEST_CASES = [
    {
        name: 'COSTCO Form with HTML Wrapper (Original Problem)',
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
    const documentHandler = createDocumentHandler();
    
    console.log('🔍 Testing SharePoint Hyperlink Processing for UiPath Integration');
    console.log('='.repeat(80));
    
    let passedTests = 0;
    let totalTests = 0;
    
    // Test 1: Document Extraction
    console.log('\n📋 Test 1: Document Information Extraction');
    console.log('-'.repeat(50));
    
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
                console.log(`   - Site Name: ${docInfo.siteName}`);
                console.log(`   - Type: ${docInfo.type}`);
                
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
    console.log('-'.repeat(50));
    
    totalTests++;
    try {
        const uipathRef = await documentHandler.createUiPathDocumentReference(PROBLEMATIC_HTML);
        
        console.log(`✅ UiPath reference created:`);
        console.log(`   - Has Document: ${uipathRef.hasDocument}`);
        console.log(`   - Strategy: ${uipathRef.strategy}`);
        console.log(`   - UiPath Compatible: ${uipathRef.uipathCompatible}`);
        console.log(`   - File Name: ${uipathRef.fileName}`);
        console.log(`   - File Extension: ${uipathRef.fileExtension}`);
        console.log(`   - Document URL: ${uipathRef.documentUrl}`);
        console.log(`   - Clean URL: ${uipathRef.cleanUrl}`);
        console.log(`   - Original URL: ${uipathRef.originalUrl}`);
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
    
    // Test 3: HTML Entity Decoding
    console.log('\n📋 Test 3: HTML Entity Decoding');
    console.log('-'.repeat(50));
    
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
    
    // Test 4: Strategy Recommendation
    console.log('\n📋 Test 4: Document Strategy Recommendation');
    console.log('-'.repeat(50));
    
    totalTests++;
    try {
        const xlsxStrategy = documentHandler.recommendStrategy('test.xlsx', null, true);
        const pdfStrategy = documentHandler.recommendStrategy('test.pdf', null, true);
        const regularStrategy = documentHandler.recommendStrategy('test.xlsx', null, false);
        
        console.log(`✅ Strategy recommendations:`);
        console.log(`   - Excel with SharePoint hyperlink: ${xlsxStrategy}`);
        console.log(`   - PDF with SharePoint hyperlink: ${pdfStrategy}`);
        console.log(`   - Excel without SharePoint hyperlink: ${regularStrategy}`);
        
        if (xlsxStrategy === DOCUMENT_STRATEGY.SHAREPOINT_HYPERLINK && 
            pdfStrategy === DOCUMENT_STRATEGY.SHAREPOINT_HYPERLINK &&
            regularStrategy !== DOCUMENT_STRATEGY.SHAREPOINT_HYPERLINK) {
            console.log(`✅ Strategy recommendation validation passed`);
            passedTests++;
        } else {
            console.log(`❌ Strategy recommendation validation failed`);
        }
    } catch (error) {
        console.log(`❌ Error in strategy recommendation: ${error.message}`);
    }
    
    // Test 5: Clean URL Generation
    console.log('\n📋 Test 5: Clean URL Generation');
    console.log('-'.repeat(50));
    
    totalTests++;
    try {
        const originalUrl = '/sites/test/_layouts/15/Doc.aspx?sourcedoc=%7BTEST123%7D&amp;file=Test%20File.xlsx&amp;action=default';
        const cleanUrl = documentHandler.createCleanSharePointUrl(originalUrl, 'TEST123', 'Test File.xlsx');
        
        console.log(`✅ Clean URL generation:`);
        console.log(`   - Original: ${originalUrl}`);
        console.log(`   - Clean: ${cleanUrl}`);
        
        if (cleanUrl && cleanUrl.includes('TEST123') && cleanUrl.includes('Test%20File.xlsx')) {
            console.log(`✅ Clean URL validation passed`);
            passedTests++;
        } else {
            console.log(`❌ Clean URL validation failed`);
        }
    } catch (error) {
        console.log(`❌ Error in clean URL generation: ${error.message}`);
    }
    
    // Test 6: Error Handling
    console.log('\n📋 Test 6: Error Handling');
    console.log('-'.repeat(50));
    
    totalTests++;
    try {
        // Test with invalid HTML
        const invalidHtml = '<div>No href here</div>';
        const result = documentHandler.extractDocumentFromHTML(invalidHtml);
        
        if (result === null) {
            console.log(`✅ Error handling passed: correctly returned null for invalid HTML`);
            passedTests++;
        } else {
            console.log(`❌ Error handling failed: should return null for invalid HTML`);
        }
        
        // Test with empty/null input
        const nullResult = documentHandler.extractDocumentFromHTML(null);
        const emptyResult = documentHandler.extractDocumentFromHTML('');
        
        if (nullResult === null && emptyResult === null) {
            console.log(`✅ Null/empty input handling passed`);
        } else {
            console.log(`❌ Null/empty input handling failed`);
        }
    } catch (error) {
        console.log(`❌ Error in error handling test: ${error.message}`);
    }
    
    // Test Results Summary
    console.log('\n📊 Test Results Summary');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 All tests passed! SharePoint hyperlink processing is working correctly.');
        console.log('\n✅ The "queueItemParameters must not be null" error should be resolved.');
        console.log('\n🚀 Key improvements implemented:');
        console.log('   ✓ HTML entity decoding (&amp; → &)');
        console.log('   ✓ Clean URL extraction from href attributes');
        console.log('   ✓ Document ID parsing for Graph API access');
        console.log('   ✓ Multiple URL formats for UiPath flexibility');
        console.log('   ✓ Robust error handling and fallback strategies');
        console.log('   ✓ UiPath-compatible data structure');
    } else {
        console.log('\n❌ Some tests failed. Please review the implementation.');
    }
    
    // Show example of what UiPath will receive
    console.log('\n📋 Example UiPath Queue Payload Structure');
    console.log('-'.repeat(50));
    
    const examplePayload = {
        Document: {
            HasDocument: true,
            Strategy: "sharepoint_hyperlink",
            FileName: "COSTCO FORM_267.xlsx",
            FileExtension: "xlsx",
            UiPathCompatible: true,
            DocumentUrl: "/sites/COSTCO-INLINE-Trafficking-Routing/_layouts/15/Doc.aspx?sourcedoc={FABF99BB-403E-439F-8F9E-F10BB2247BB5}&file=COSTCO FORM_267.xlsx&action=default",
            CleanUrl: "/sites/COSTCO-INLINE-Trafficking-Routing/_layouts/15/Doc.aspx?sourcedoc={FABF99BB-403E-439F-8F9E-F10BB2247BB5}&file=COSTCO%20FORM_267.xlsx&action=default&mobileredirect=true",
            OriginalUrl: "Original HTML content extracted URL",
            Instructions: "Multiple URL formats provided for UiPath flexibility",
            RequiresDownload: true,
            ProcessedAt: new Date().toISOString()
        }
    };
    
    console.log(JSON.stringify(examplePayload, null, 2));
    
    return {
        totalTests,
        passedTests,
        successRate: (passedTests / totalTests) * 100
    };
}

// Run the tests if this file is executed directly
if (require.main === module) {
    runTests()
        .then((results) => {
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