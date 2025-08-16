/**
 * Test webhook validation to ensure it works with Microsoft Graph
 */

const axios = require('axios');

async function testWebhookValidation() {
    console.log('🔍 Testing Webhook Validation');
    console.log('=============================\n');
    
    const webhookUrl = 'https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-handler';
    const validationToken = 'test-validation-' + Date.now();
    
    console.log('1. Testing basic validation (query parameter)...');
    try {
        const response = await axios.post(
            `${webhookUrl}?validationToken=${encodeURIComponent(validationToken)}`,
            '',
            {
                headers: {
                    'Content-Type': 'text/plain'
                },
                timeout: 5000
            }
        );
        
        if (response.data === validationToken) {
            console.log('   ✅ Validation successful!');
            console.log('   Response:', response.data);
            console.log('   Status:', response.status);
            console.log('   Content-Type:', response.headers['content-type']);
        } else {
            console.log('   ❌ Validation failed - wrong response');
            console.log('   Expected:', validationToken);
            console.log('   Received:', response.data);
        }
    } catch (error) {
        console.log('   ❌ Validation request failed');
        console.log('   Error:', error.message);
    }
    
    console.log('\n2. Testing validation with POST body (Graph format)...');
    try {
        const response = await axios.post(
            webhookUrl,
            {
                validationToken: validationToken
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                params: {
                    validationToken: validationToken
                },
                timeout: 5000
            }
        );
        
        console.log('   Response:', response.data);
        console.log('   Status:', response.status);
        
    } catch (error) {
        console.log('   Response status:', error.response?.status);
        console.log('   Response data:', error.response?.data);
    }
    
    console.log('\n3. Testing webhook handler availability...');
    try {
        const response = await axios.get(webhookUrl, {
            timeout: 5000
        });
        console.log('   GET Status:', response.status);
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('   ❌ Webhook handler not found at URL');
        } else {
            console.log('   Status:', error.response?.status || 'No response');
        }
    }
    
    console.log('\n4. Checking function app status...');
    try {
        const healthResponse = await axios.get(
            'https://webhook-functions-sharepoint-002.azurewebsites.net/api/health',
            { timeout: 5000 }
        );
        console.log('   Health check:', healthResponse.status, healthResponse.data);
    } catch (error) {
        console.log('   Health check failed:', error.response?.status || error.message);
    }
}

testWebhookValidation().catch(console.error);