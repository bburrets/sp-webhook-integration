#!/bin/bash

# Load environment variables from local.settings.json and Azure config
export AZURE_CLIENT_ID="b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f"
export AZURE_CLIENT_SECRET="${AZURE_CLIENT_SECRET:-<YOUR_AZURE_CLIENT_SECRET>}"
export AZURE_TENANT_ID="f6e7449b-d39b-4300-822f-79267def3ab3"
export SHAREPOINT_SITE_URL="https://fambrandsllc.sharepoint.com/sites/sphookmanagement"
export WEBHOOK_LIST_ID="82a105da-8206-4bd0-851b-d3f2260043f4"
export UIPATH_ORCHESTRATOR_URL="https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS/orchestrator_"
export UIPATH_TENANT_NAME="FAMBrands_RPAOPS"
export UIPATH_CLIENT_ID="cb772a87-0f11-4764-bf71-ff2467f2a75a"
export UIPATH_CLIENT_SECRET='V4x70aA$6A)9ijAz6n?QO@CV9#MkR5j9q$EeRUW@PPPV6(HDe@8PN*Ps2$kydb)M'
export UIPATH_ORGANIZATION_UNIT_ID="277500"
export UIPATH_DEFAULT_QUEUE="test_webhook"
export UIPATH_ENABLED="true"

# Run the validation script
node validate-system.js
