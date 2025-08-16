const { app } = require('@azure/functions');
const axios = require('axios');

// Test access to COSTCO list
app.http('test-list-access', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('Testing COSTCO list access');
        
        try {
            // Get access token
            const clientId = process.env.AZURE_CLIENT_ID;
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            const tenantId = process.env.AZURE_TENANT_ID;
            
            const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
            const tokenParams = new URLSearchParams();
            tokenParams.append('client_id', clientId);
            tokenParams.append('client_secret', clientSecret);
            tokenParams.append('scope', 'https://graph.microsoft.com/.default');
            tokenParams.append('grant_type', 'client_credentials');
            
            const tokenResponse = await axios.post(tokenUrl, tokenParams);
            const accessToken = tokenResponse.data.access_token;
            
            const results = {
                timestamp: new Date().toISOString(),
                tests: []
            };
            
            // Test 1: Can we access the site?
            try {
                const siteUrl = 'fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:';
                const siteResponse = await axios.get(
                    `https://graph.microsoft.com/v1.0/sites/${siteUrl}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Accept': 'application/json'
                        }
                    }
                );
                
                results.tests.push({
                    test: 'Site Access',
                    success: true,
                    siteId: siteResponse.data.id,
                    siteName: siteResponse.data.displayName
                });
            } catch (error) {
                results.tests.push({
                    test: 'Site Access',
                    success: false,
                    error: error.response?.data || error.message
                });
            }
            
            // Test 2: Can we access the list?
            try {
                const listUrl = `https://graph.microsoft.com/v1.0/sites/fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:/lists/8646a067-a234-42f1-a625-d392ab8d1830`;
                const listResponse = await axios.get(listUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                
                results.tests.push({
                    test: 'List Access',
                    success: true,
                    listName: listResponse.data.displayName,
                    listTemplate: listResponse.data.list?.template,
                    createdBy: listResponse.data.createdBy?.user?.displayName
                });
            } catch (error) {
                results.tests.push({
                    test: 'List Access',
                    success: false,
                    error: error.response?.data || error.message
                });
            }
            
            // Test 3: Can we read items?
            try {
                const itemsUrl = `https://graph.microsoft.com/v1.0/sites/fambrandsllc.sharepoint.com:/sites/DWI/COSTCO-INLINE-Trafficking-Routing:/lists/8646a067-a234-42f1-a625-d392ab8d1830/items?$top=1`;
                const itemsResponse = await axios.get(itemsUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                
                results.tests.push({
                    test: 'Read Items',
                    success: true,
                    itemCount: itemsResponse.data.value?.length || 0
                });
            } catch (error) {
                results.tests.push({
                    test: 'Read Items',
                    success: false,
                    error: error.response?.data || error.message
                });
            }
            
            // Summary
            results.summary = {
                canAccessSite: results.tests[0]?.success || false,
                canAccessList: results.tests[1]?.success || false,
                canReadItems: results.tests[2]?.success || false,
                webhookSupport: 'Graph API returned "resource not supported" - this list may not support webhooks'
            };
            
            return {
                body: JSON.stringify(results, null, 2),
                headers: { 'Content-Type': 'application/json' }
            };
            
        } catch (error) {
            context.error('Test failed:', error);
            return {
                status: 500,
                body: JSON.stringify({
                    error: 'Test failed',
                    message: error.message
                })
            };
        }
    }
});