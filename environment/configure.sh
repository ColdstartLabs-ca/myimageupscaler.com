#!/bin/bash

# ============================================================================
# Environment Configuration Script
# ============================================================================
# This is a lightweight script for quick environment setup.
# For full setup (including Supabase), use: yarn setup
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "PixelPerfect Environment Configuration"
echo "======================================"
echo ""

# Copy .env.client.example to .env.client if it doesn't exist
if [ ! -f .env.client ]; then
    if [ -f .env.client.example ]; then
        echo "Creating .env.client from .env.client.example..."
        cp .env.client.example .env.client
        echo "✓ Created .env.client"
    else
        echo "⚠ .env.client.example not found"
    fi
else
    echo "✓ .env.client already exists"
fi

# Copy .env.api.example to .env.api if it doesn't exist
if [ ! -f .env.api ]; then
    if [ -f .env.api.example ]; then
        echo "Creating .env.api from .env.api.example..."
        cp .env.api.example .env.api
        echo "✓ Created .env.api"
    else
        echo "⚠ .env.api.example not found"
    fi
else
    echo "✓ .env.api already exists"
fi

echo ""
echo "Environment files ready!"
echo ""
echo "Next steps:"
echo "  1. Edit .env.client with your Supabase public credentials"
echo "  2. Edit .env.api with your secret keys"
echo "  3. Run 'yarn setup' for full interactive setup"
echo ""
echo "Or run 'yarn setup' now for guided configuration."
echo ""
