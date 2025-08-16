/**
 * Diagnose the exact payload being created by the webhook handler
 */

const axios = require('axios');

async function diagnoseWebhookPayload() {
    console.log('🔍 Diagnosing Webhook Payload Generation');
    console.log('=========================================\n');
    
    // Simulate the exact SharePoint item structure from logs
    const sharePointItem = {
        id: '4',
        fields: {
            ShiptoEmail: 'd175apt2@costco.com',
            ShipDate: '5/13/2025',
            PO_No: '1750505419, 1750505420',
            Style: 'BR007268',
            Status: 'Send Generated Form',
            GeneratedRoutingFormURL: '<div>COSTCO FORM_175.xlsx</div>',
            Created: '2025-08-15T16:13:24Z',
            Modified: '2025-08-16T08:41:52Z',
            ContentType: 'Item',
            AuthorLookupId: '13',
            EditorLookupId: '7',
            _UIVersionString: '4.0',
            Attachments: false
        },
        createdDateTime: '2025-08-15T16:13:24Z',
        lastModifiedDateTime: '2025-08-16T08:41:52Z'
    };
    
    // Load the actual template processor
    const { CostcoTemplateProcessor } = require('../../../src/templates/costco-inline-routing');
    
    // Create a mock logger to avoid initialization issues
    const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {}
    };
    
    // Create processor with mock context
    const processor = {
        logger: mockLogger,
        transformItemData: CostcoTemplateProcessor.prototype.transformItemData
    };
    
    console.log('1. Testing transformItemData...');
    const transformed = processor.transformItemData(sharePointItem);
    console.log('Transformed data keys:', Object.keys(transformed));
    console.log('Sample values:');
    console.log('  - PONumber:', transformed.PONumber);
    console.log('  - ShipToEmail:', transformed.ShipToEmail);
    console.log('  - Status:', transformed.Status);
    console.log();
    
    // Manually create payload structure as queue client would
    console.log('2. Creating payload structure...');
    
    // Flatten any nested objects
    const flattenObject = (obj, prefix = '') => {
        const flattened = {};
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}_${key}` : key;
            if (value === null || value === undefined) {
                flattened[newKey] = '';
            } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                Object.assign(flattened, flattenObject(value, newKey));
            } else if (Array.isArray(value)) {
                flattened[newKey] = value.join(',');
            } else if (value instanceof Date) {
                flattened[newKey] = value.toISOString();
            } else {
                flattened[newKey] = String(value);
            }
        }
        return flattened;
    };
    
    const flattened = flattenObject(transformed);
    
    const payload = {
        itemData: {
            Name: 'TEST_API',
            Priority: 'High',
            SpecificContent: flattened,
            Reference: `TEST_${Date.now()}`
        }
    };
    console.log('Payload structure:');
    console.log('  - Has itemData:', !!payload.itemData);
    console.log('  - Queue Name:', payload.itemData?.Name);
    console.log('  - Priority:', payload.itemData?.Priority);
    console.log('  - SpecificContent keys:', Object.keys(payload.itemData?.SpecificContent || {}).length);
    console.log();
    
    // Check for problematic values
    console.log('3. Checking for problematic values...');
    const specificContent = payload.itemData?.SpecificContent || {};
    let issues = [];
    
    for (const [key, value] of Object.entries(specificContent)) {
        if (value === undefined) {
            issues.push(`${key}: undefined value`);
        }
        if (value === null) {
            issues.push(`${key}: null value`);
        }
        if (typeof value === 'object') {
            issues.push(`${key}: object value (${JSON.stringify(value).substring(0, 50)})`);
        }
        if (key.includes('undefined')) {
            issues.push(`${key}: key contains 'undefined'`);
        }
    }
    
    if (issues.length > 0) {
        console.log('⚠️ Found issues:');
        issues.forEach(issue => console.log(`  - ${issue}`));
    } else {
        console.log('✅ No obvious issues found');
    }
    console.log();
    
    // Test actual submission
    console.log('4. Testing actual UiPath submission...');
    
    // Authenticate
    const authResponse = await axios.post(
        'https://cloud.uipath.com/identity_/connect/token',
        new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: 'cb772a87-0f11-4764-bf71-ff2467f2a75a',
            client_secret: 'V4x70aA$6A)9ijAz6n?QO@CV9#MkR5j9q$EeRUW@PPPV6(HDe@8PN*Ps2$kydb)M',
            scope: 'OR.Queues.Write'
        })
    );
    
    const token = authResponse.data.access_token;
    
    // Try to submit
    try {
        const response = await axios.post(
            'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem',
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-UIPATH-OrganizationUnitId': '376892'
                }
            }
        );
        
        console.log('✅ SUCCESS! Queue item created:', response.data.Id);
        
    } catch (error) {
        console.log('❌ FAILED:', error.response?.data?.message || error.message);
        console.log('\n5. Debugging the payload...');
        console.log('Full payload being sent:');
        console.log(JSON.stringify(payload, null, 2));
    }
}

diagnoseWebhookPayload().catch(console.error);