const axios = require('axios');

async function getSiteInfo() {
    const siteUrl = 'fambrandsllc.sharepoint.com:/sites/sphookmanagement:';
    
    // This is the format needed for Graph API
    console.log('Site path for Graph API:', siteUrl);
    console.log('List ID:', '30516097-c58c-478c-b87f-76c8f6ce2b56');
    
    // The webhook resource shows the pattern:
    // sites/fambrandsllc.sharepoint.com:/sites/sphookmanagement:/lists/30516097-c58c-478c-b87f-76c8f6ce2b56
}

getSiteInfo();