#!/bin/bash

# ============================================================================
# Environment Files Migration Script
# ============================================================================
# Migrates .env → .env.client and .env.prod → .env.api for local development
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "PixelPerfect Environment Files Migration"
echo "========================================="
echo ""

# Check if old files exist
HAS_OLD_ENV=false
HAS_OLD_PROD=false

if [ -f ".env" ]; then
    HAS_OLD_ENV=true
fi

if [ -f ".env.prod" ]; then
    HAS_OLD_PROD=true
fi

# If no old files exist, nothing to migrate
if [ "$HAS_OLD_ENV" = false ] && [ "$HAS_OLD_PROD" = false ]; then
    echo "✓ No old environment files found - nothing to migrate"
    echo ""
    echo "To set up environment files, run: yarn setup"
    exit 0
fi

echo "Found old environment files:"
[ "$HAS_OLD_ENV" = true ] && echo "  - .env"
[ "$HAS_OLD_PROD" = true ] && echo "  - .env.prod"
echo ""

# Check if new files already exist
if [ -f ".env.client" ] || [ -f ".env.api" ]; then
    echo "⚠️  New environment files already exist:"
    [ -f ".env.client" ] && echo "  - .env.client"
    [ -f ".env.api" ] && echo "  - .env.api"
    echo ""
    read -p "Do you want to overwrite them? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Migration cancelled. No files were changed."
        exit 0
    fi
fi

echo "Migrating environment files..."
echo ""

# Migrate .env → .env.client
if [ "$HAS_OLD_ENV" = true ]; then
    cp .env .env.client
    echo "✓ Migrated .env → .env.client"
fi

# Migrate .env.prod → .env.api
if [ "$HAS_OLD_PROD" = true ]; then
    cp .env.prod .env.api

    # Add ENV variable to .env.api if it doesn't exist
    if ! grep -q "^ENV=" .env.api; then
        # Add ENV at the top of the file after the header
        if grep -q "^#" .env.api; then
            # Find the first non-comment line
            sed -i '0,/^[^#]/{s/^[^#]/ENV=development\n\n&/}' .env.api
        else
            # No comments, add at the top
            sed -i '1i ENV=development\n' .env.api
        fi
        echo "✓ Added ENV variable to .env.api"
    fi

    echo "✓ Migrated .env.prod → .env.api"
fi

echo ""
echo "Migration complete!"
echo ""
echo "Old files have been kept as backup."
echo "You can safely delete them after verifying the migration:"
echo "  rm .env .env.prod"
echo ""
echo "New files:"
echo "  - .env.client (public variables)"
echo "  - .env.api (server secrets)"
echo ""
