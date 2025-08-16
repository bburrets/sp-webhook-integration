/**
 * Test script to verify COSTCO field mapping logic
 * This helps verify which version of the code is running
 */

const { createCostcoProcessor } = require('../../../src/templates/costco-inline-routing');

// Mock context for testing
const mockContext = {
    log: {
        info: (msg, data) => console.log('INFO:', msg, data ? JSON.stringify(data, null, 2) : ''),
        debug: (msg, data) => console.log('DEBUG:', msg, data ? JSON.stringify(data, null, 2) : ''),
        warn: (msg, data) => console.log('WARN:', msg, data ? JSON.stringify(data, null, 2) : ''),
        error: (msg, data) => console.log('ERROR:', msg, data ? JSON.stringify(data, null, 2) : '')
    }
};

// Test data that matches your actual SharePoint item
const testItem = {
    ID: '999',
    Title: 'Test COSTCO Item',
    Status: 'Send Generated Form',
    PO_No: '5840505241',  // This is the field that should map to PONumber
    Style: 'TestStyle',
    ShiptoEmail: 'test@costco.com',
    ShipDate: '12/25/2024',
    Ship_x002d_To: 'Test Ship To Location',
    Pack: 'TestPack',
    Created: new Date().toISOString(),
    Modified: new Date().toISOString(),
    Author: { Title: 'Test User' },
    Editor: { Title: 'Test User' }
};

async function testCostcoMapping() {
    console.log('🧪 Testing COSTCO field mapping logic...\n');
    
    try {
        const processor = createCostcoProcessor(mockContext);
        
        console.log('📥 Input test item:');
        console.log(JSON.stringify(testItem, null, 2));
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Test the transformation logic
        console.log('🔄 Testing transformItemData method...');
        const transformedData = processor.transformItemData(testItem);
        
        console.log('📤 Transformed data:');
        console.log(JSON.stringify(transformedData, null, 2));
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Test the specific field mappings
        console.log('🔍 Field mapping verification:');
        console.log(`Raw PO_No field: "${testItem['PO_No']}"`);
        console.log(`Transformed PONumber: "${transformedData.PONumber}"`);
        console.log(`Expected reference pattern: COSTCO_${transformedData.PONumber}_${testItem.ID}_[timestamp]`);
        
        // Generate the reference as the actual code would
        const actualReference = `COSTCO_${transformedData.PONumber}_${testItem.ID}_${Date.now()}`;
        console.log(`Actual reference: ${actualReference}`);
        
        // Check for the specific issue
        if (transformedData.PONumber === undefined || transformedData.PONumber === null) {
            console.log('❌ ISSUE FOUND: PONumber is undefined - this indicates the OLD code is running');
            console.log('   The field mapping from PO_No to PONumber is not working');
        } else if (transformedData.PONumber === testItem['PO_No']) {
            console.log('✅ SUCCESS: PONumber correctly mapped from PO_No field');
            console.log('   This indicates the NEW code is running');
        } else {
            console.log('⚠️  UNEXPECTED: PONumber has a different value than expected');
            console.log(`   Expected: ${testItem['PO_No']}`);
            console.log(`   Actual: ${transformedData.PONumber}`);
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Test the shouldProcessItem logic
        console.log('🎯 Testing shouldProcessItem logic...');
        const shouldProcess = processor.shouldProcessItem(testItem);
        console.log(`Should process item: ${shouldProcess}`);
        
        if (shouldProcess) {
            console.log('✅ Item meets processing criteria');
        } else {
            console.log('❌ Item does not meet processing criteria');
        }
        
        console.log('\n🏁 Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    testCostcoMapping();
}

module.exports = { testCostcoMapping };