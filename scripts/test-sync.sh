#!/bin/bash
echo "Testing webhook sync..."
curl -X POST "https://webhook-functions-sharepoint-002.azurewebsites.net/api/webhook-sync?code=yg46Yo3hgkODuN7oA5PTd4N-Wbu7Oj5YsNVz7uUM0EJJAzFuBKVhEA==" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"