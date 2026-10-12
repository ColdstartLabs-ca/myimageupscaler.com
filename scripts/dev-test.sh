#!/bin/bash

# Start dev server with test environment variables
# This script is used by Playwright to ensure tests run with correct env vars

set -e

# .env.test is never sourced here. tests/helpers/test-env-isolation.ts builds the same
# sanitized environment as playwright.config.ts (allowlisted keys only, mock-only
# Supabase, NODE_ENV=development) and fails closed before anything else runs.
ISOLATE="npx tsx tests/helpers/test-env-isolation.ts"
if ! $ISOLATE; then
  echo "Test server refused to start: unsafe test environment (see above)." >&2
  exit 1
fi

# Use ports from environment or defaults
TEST_PORT=${TEST_PORT:-3100}
TEST_WRANGLER_PORT=${TEST_WRANGLER_PORT:-8800}

# Clean up any stale lock files that might prevent server startup
# This fixes flaky tests caused by leftover locks from crashed/killed dev servers
# Note: Next.js always uses .next/ regardless of NEXT_TEST_DIR env var
if [ -f ".next/dev/lock" ]; then
  echo "Removing stale Next.js lock file..."
  rm -f ".next/dev/lock"
fi

# Clear Next.js cache for clean test environment.
# Next 16 dev keeps route manifests under .next/dev; stale manifests can make
# newly added app routes return "Cannot find module for page" during E2E runs.
echo "Clearing Next.js cache for clean test environment..."
rm -rf .next/cache .next/dev

# Check if port is already in use and kill the process if needed
# This prevents "port already in use" errors when restarting tests
if lsof -i :$TEST_PORT -t > /dev/null 2>&1; then
  echo "Port $TEST_PORT is in use, killing existing process..."
  lsof -i :$TEST_PORT -t | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "Starting test server on port $TEST_PORT"

# Match the production bundler and support linked worktree dependencies.
exec $ISOLATE npx next dev --webpack --port "$TEST_PORT"
