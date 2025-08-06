#!/bin/bash

echo "Creating backup branch..."
git branch backup-before-clean

echo "Removing sensitive files from history..."

# Remove files that shouldn't exist
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch CLIENT_SECRET_FIX.md scripts/fix-client-secret.sh scripts/test-sync.sh' \
  --prune-empty --tag-name-filter cat -- --all

# Clean up CURRENT_STATE.md to remove function keys
echo "Cleaning CURRENT_STATE.md..."
git filter-branch --force --tree-filter '
  if [ -f "CURRENT_STATE.md" ]; then
    sed -i "" "s/yg46Yo3hgkODuN7oA5PTd4N-Wbu7Oj5YsNVz7uUM0EJJAzFuBKVhEA==/REDACTED_FUNCTION_KEY/g" CURRENT_STATE.md
  fi
' --tag-name-filter cat -- --all

echo "Cleaning up..."
rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "Done! Your history is now clean."
echo "To push, use: git push --force-with-lease origin feature/webhook-proxy-forwarding"