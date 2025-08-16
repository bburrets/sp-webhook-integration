/**
 * Test utility for COSTCO-specific processing
 * Tests the complete flow from SharePoint item to UiPath queue
 */

const { createCostcoProcessor } = require('../../../src/templates/costco-inline-routing');
const { createLogger } = require('../../../src/shared/logger');

async function testCostcoProcessing() {
    const mockContext = {
        log: console.log,
        log: { 
            error: console.error,
            warn: console.warn,
            info: console.log,
            verbose: console.log,
            metric: (name, value, properties) => {
                console.log(`METRIC: ${name} = ${value}`, properties);
            }
        }
    };

    const logger = createLogger(mockContext);

    console.log('\n🏭 Testing COSTCO Processing Logic');
    console.log('=====================================');

    const processor = createCostcoProcessor(mockContext);

    // Test 1: Status validation
    console.log('\n📋 Test 1: Status Validation');
    console.log('-----------------------------');
    
    const testCases = [
        {
            name: 'Valid - Send Generated Form',
            item: {
                fields: { Status: 'Send Generated Form' }
            },
            previousItem: {
                fields: { Status: 'In Progress' }
            },
            expectedResult: true
        },
        {
            name: 'Invalid - Wrong Status',
            item: {
                fields: { Status: 'In Progress' }
            },
            previousItem: {
                fields: { Status: 'Draft' }
            },
            expectedResult: false
        },
        {
            name: 'Invalid - Status unchanged',
            item: {
                fields: { Status: 'Send Generated Form' }
            },
            previousItem: {
                fields: { Status: 'Send Generated Form' }
            },
            expectedResult: false
        }
    ];

    testCases.forEach(testCase => {
        const result = processor.shouldProcess(testCase.item, testCase.previousItem);
        const status = result === testCase.expectedResult ? '✅' : '❌';
        console.log(`  ${status} ${testCase.name}: ${result}`);
    });

    // Test 2: Field validation
    console.log('\n📋 Test 2: Field Validation');
    console.log('-----------------------------');
    
    const validationTests = [
        {
            name: 'All fields valid',
            fields: {
                Status: 'Send Generated Form',
                Ship_x0020_To_x0020_Email: 'test@example.com',
                Ship_x0020_Date: '2024-12-25',
                Style: 'ABC-123',
                PO_x005f_no: 'PO-2024-001',
                Generated_x0020_Routing_x0020_Form_x0020_URL: 'https://sharepoint.com/doc.pdf'
            },
            shouldPass: true
        },
        {
            name: 'Missing email',
            fields: {
                Status: 'Send Generated Form',
                Ship_x0020_Date: '2024-12-25',
                Style: 'ABC-123',
                PO_x005f_no: 'PO-2024-001',
                Generated_x0020_Routing_x0020_Form_x0020_URL: 'https://sharepoint.com/doc.pdf'
            },
            shouldPass: false
        },
        {
            name: 'Invalid email format',
            fields: {
                Status: 'Send Generated Form',
                Ship_x0020_To_x0020_Email: 'not-an-email',
                Ship_x0020_Date: '2024-12-25',
                Style: 'ABC-123',
                PO_x005f_no: 'PO-2024-001',
                Generated_x0020_Routing_x0020_Form_x0020_URL: 'https://sharepoint.com/doc.pdf'
            },
            shouldPass: false
        },
        {
            name: 'Missing PO number',
            fields: {
                Status: 'Send Generated Form',
                Ship_x0020_To_x0020_Email: 'test@example.com',
                Ship_x0020_Date: '2024-12-25',
                Style: 'ABC-123',
                Generated_x0020_Routing_x0020_Form_x0020_URL: 'https://sharepoint.com/doc.pdf'
            },
            shouldPass: false
        }
    ];

    validationTests.forEach(test => {
        try {
            processor.validateFields(test.fields);
            const status = test.shouldPass ? '✅' : '❌';
            console.log(`  ${status} ${test.name}: Validation ${test.shouldPass ? 'passed' : 'unexpectedly passed'}`);
        } catch (error) {
            const status = !test.shouldPass ? '✅' : '❌';
            console.log(`  ${status} ${test.name}: ${error.message}`);
        }
    });

    // Test 3: Transformation
    console.log('\n📋 Test 3: Data Transformation');
    console.log('-----------------------------');
    
    const validItem = {
        fields: {
            Status: 'Send Generated Form',
            Ship_x0020_To_x0020_Email: 'costco@example.com',
            Ship_x0020_Date: '2024-12-25',
            Style: 'STYLE-789',
            PO_x005f_no: 'PO-2024-999',
            Generated_x0020_Routing_x0020_Form_x0020_URL: 'https://sharepoint.com/routing.pdf'
        },
        id: 'item-123',
        listId: 'list-456'
    };

    try {
        const transformed = processor.transformToQueueItem(validItem);
        
        console.log('  ✅ Transformation successful!');
        console.log('     Queue Item Name:', transformed.Name);
        console.log('     Priority:', transformed.Priority);
        console.log('     Email To:', transformed.SpecificContent.EmailConfig.To);
        console.log('     PO Number:', transformed.SpecificContent.ShipmentDetails.PONumber);
        console.log('     Document URL:', transformed.SpecificContent.Attachment.DocumentUrl);
        
    } catch (error) {
        console.log('  ❌ Transformation failed:', error.message);
    }

    // Test 4: Full processing (without actual queue submission)
    console.log('\n📋 Test 4: Full Processing Flow (Dry Run)');
    console.log('-----------------------------');
    
    const fullTestItem = {
        fields: validItem.fields,
        id: 'test-item-full',
        listId: 'test-list-full'
    };
    
    const previousTestItem = {
        fields: {
            ...validItem.fields,
            Status: 'In Progress'
        }
    };

    try {
        // Check if should process
        if (processor.shouldProcess(fullTestItem, previousTestItem)) {
            console.log('  ✅ Item should be processed');
            
            // Validate fields
            processor.validateFields(fullTestItem.fields);
            console.log('  ✅ Fields validated');
            
            // Transform
            const queueItem = processor.transformToQueueItem(fullTestItem);
            console.log('  ✅ Transformed to queue item');
            
            // Display final queue item structure
            console.log('\n📦 Final Queue Item Structure:');
            console.log(JSON.stringify(queueItem, null, 2));
            
            console.log('\n✅ Full processing test passed!');
        } else {
            console.log('  ⚠️  Item should not be processed');
        }
        
    } catch (error) {
        console.log('  ❌ Processing failed:', error.message);
    }

    // Test 5: List applicability
    console.log('\n📋 Test 5: List Applicability');
    console.log('-----------------------------');
    
    const listTests = [
        { 
            name: 'COSTCO US INLINE Routing Tracker PROD',
            path: '/sites/COSTCO-INLINE-Trafficking-Routing',
            shouldApply: true
        },
        {
            name: 'Random List',
            path: '/sites/Other-Site',
            shouldApply: false
        }
    ];

    listTests.forEach(test => {
        const applies = processor.appliesToList(test.name, test.path);
        const status = applies === test.shouldApply ? '✅' : '❌';
        console.log(`  ${status} ${test.name}: ${applies}`);
    });

    console.log('\n✅ All COSTCO processing tests complete!');
}

// Run if executed directly
if (require.main === module) {
    testCostcoProcessing().then(() => {
        console.log('\n✅ Test suite complete!');
    }).catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { testCostcoProcessing };