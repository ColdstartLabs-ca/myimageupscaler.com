#!/bin/bash

# Start dev server with test environment variables
# This script is used by Playwright to ensure tests run with correct env vars

set -e

# Load test environment variables (filter out comments and empty lines)
export $(grep -v '^#' .env.test | grep -v '^$' | xargs)

# Use ports from environment or defaults
TEST_PORT=${TEST_PORT:-3100}
TEST_WRANGLER_PORT=${TEST_WRANGLER_PORT:-8800}

# Clean up any stale lock files that might prevent server startup
# This fixes flaky tests caused by leftover locks from crashed/killed dev servers
if [ -f ".next/dev/lock" ]; then
  echo "Removing stale Next.js lock file..."
  rm -f .next/dev/lock
fi

# Check if port is already in use and kill the process if needed
# This prevents "port already in use" errors when restarting tests
if lsof -i :$TEST_PORT -t > /dev/null 2>&1; then
  echo "Port $TEST_PORT is in use, killing existing process..."
  lsof -i :$TEST_PORT -t | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "Starting test server on port $TEST_PORT"

# Run the dev server
npx next dev --port $TEST_PORT
