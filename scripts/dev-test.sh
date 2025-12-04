#!/bin/bash

# Start dev server with test environment variables
# This script is used by Playwright to ensure tests run with correct env vars
#
# Uses random ports to avoid conflicts when running multiple test instances:
# - Next.js: random port between 3100-3999
# - Wrangler: random port between 8800-8999

# Load test environment variables (filter out comments and empty lines)
export $(grep -v '^#' .env.test | grep -v '^$' | xargs)

# Generate random ports if not provided (allows Playwright to pass them in)
TEST_PORT=${TEST_PORT:-$((3100 + RANDOM % 900))}
TEST_WRANGLER_PORT=${TEST_WRANGLER_PORT:-$((8800 + RANDOM % 200))}

echo "Starting test server on ports: Next.js=$TEST_PORT, Wrangler=$TEST_WRANGLER_PORT"

# Run the dev server on test-specific ports
yarn concurrently "next dev --port $TEST_PORT" "wrangler pages dev --proxy $TEST_PORT --port $TEST_WRANGLER_PORT"
