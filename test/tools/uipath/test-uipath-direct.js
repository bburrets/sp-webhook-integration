/**
 * Direct test of UiPath authentication to debug issues
 */

const axios = require('axios');

async function testDirectAuth() {
    console.log('Testing UiPath Authentication Directly...\n');
    
    // Your credentials
    const clientId = 'cb772a87-0f11-4764-bf71-ff2467f2a75a';
    const clientSecret = 'V4x70aA$6A)9ijAz6n?QO@CV9#MkR5j9q$EeRUW@PPPV6(HDe@8PN*Ps2$kydb)M';
    
    // Try different authentication endpoints and methods
    const tests = [
        {
            name: 'Cloud Identity Server (no scope)',
            url: 'https://cloud.uipath.com/identity_/connect/token',
            data: {
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            }
        },
        {
            name: 'Account-specific Identity (no scope)',
            url: 'https://cloud.uipath.com/fambrdpwrgnn/identity_/connect/token',
            data: {
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            }
        },
        {
            name: 'With OR.Queues scope',
            url: 'https://cloud.uipath.com/identity_/connect/token',
            data: {
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
                scope: 'OR.Queues'
            }
        },
        {
            name: 'With OR.Queues OR.Execution scope',
            url: 'https://cloud.uipath.com/identity_/connect/token',
            data: {
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
                scope: 'OR.Queues OR.Execution'
            }
        }
    ];
    
    for (const test of tests) {
        console.log(`\nTesting: ${test.name}`);
        console.log(`URL: ${test.url}`);
        console.log(`Data:`, test.data);
        
        try {
            const response = await axios.post(
                test.url,
                new URLSearchParams(test.data).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: 10000
                }
            );
            
            console.log('✅ SUCCESS!');
            console.log('Token received:', response.data.access_token?.substring(0, 50) + '...');
            console.log('Token type:', response.data.token_type);
            console.log('Expires in:', response.data.expires_in, 'seconds');
            
            // If successful, try to use the token
            if (response.data.access_token) {
                await testTokenUsage(response.data.access_token);
            }
            
            break; // Stop on first success
            
        } catch (error) {
            console.log('❌ Failed:', error.response?.data || error.message);
        }
    }
}

async function testTokenUsage(token) {
    console.log('\nTesting token usage...');
    
    // Get values from environment or use defaults
    const orchestratorUrl = process.env.UIPATH_ORCHESTRATOR_URL || 'https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_';
    const tenantName = process.env.UIPATH_TENANT_NAME || 'FAMBrands_RPAOPS_PROD';
    const orgUnitId = process.env.UIPATH_ORGANIZATION_UNIT_ID || '376892';
    
    console.log('Using configuration:');
    console.log('  Tenant:', tenantName);
    console.log('  Org Unit ID:', orgUnitId);
    
    try {
        // Try to get queues
        const response = await axios.get(
            `${orchestratorUrl}/odata/QueueDefinitions`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-UIPATH-TenantName': tenantName,
                    'X-UIPATH-OrganizationUnitId': orgUnitId
                }
            }
        );
        
        console.log('✅ Token works! Found', response.data.value?.length || 0, 'queues');
        
        if (response.data.value && response.data.value.length > 0) {
            console.log('Queue names:');
            response.data.value.forEach(q => console.log('  -', q.Name));
        }
        
    } catch (error) {
        console.log('❌ Token usage failed:', error.response?.status, error.response?.statusText);
        if (error.response?.data) {
            console.log('Error details:', error.response.data);
        }
    }
}

// Run the test
testDirectAuth().catch(console.error);