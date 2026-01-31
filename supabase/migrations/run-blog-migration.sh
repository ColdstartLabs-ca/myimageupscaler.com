#!/bin/bash
# Script to apply the blog_posts table migration
# This will output the SQL that needs to be run in Supabase SQL Editor

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Get project ref from .env.api
source "$PROJECT_ROOT/.env.api"
PROJECT_REF="${SUPABASE_URL##*/}"

echo "============================================================================"
echo "Blog Posts Migration"
echo "============================================================================"
echo ""
echo "The blog_posts table is missing from your Supabase database."
echo "This is causing the blog page to fail with error PGRST205."
echo ""
echo "To fix this, you need to run the migration SQL:"
echo ""
echo "1. Open: https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
echo "2. Copy and paste the SQL below:"
echo ""
echo "============================================================================"
cat "$SCRIPT_DIR/20260129_create_blog_posts.sql"
echo "============================================================================"
echo ""
echo "After running the SQL, you should:"
echo "1. Verify the table exists in Database > Tables"
echo "2. Run: yarn tsx scripts/migrate-blog-to-supabase.ts"
echo "   to populate the table with existing blog posts"
echo ""
