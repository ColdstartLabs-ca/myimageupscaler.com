#!/bin/bash
#
# Read-only production schema readiness check.
#
# Fetches the DB credentials from GCloud Secret Manager (same source as
# db-backup.sh and the deploy pipeline), then runs the TypeScript harness.
#
# Usage:
#   yarn verify:prod:schema
#   yarn verify:prod:schema --json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Matches scripts/db-backup.sh and deploy/steps/00-fetch-secrets.sh
GCLOUD_PROJECT="myimageupscaler-auth"
GCLOUD_SECRET_API="myimageupscaler-api-prod"
GCLOUD_ACCOUNT="myimageupscaler@myimageupscaler-auth.iam.gserviceaccount.com"

cd "$PROJECT_ROOT"

# Public config (project URL) comes from the local env files.
set -a
[[ -f .env.client ]] && source .env.client
[[ -f .env.api ]] && source .env.api
set +a

if ! command -v gcloud &>/dev/null; then
    echo "gcloud CLI not installed. Install from: https://cloud.google.com/sdk/docs/install" >&2
    exit 1
fi

if ! gcloud auth print-identity-token --account="$GCLOUD_ACCOUNT" &>/dev/null 2>&1; then
    echo "Not authenticated with gcloud as $GCLOUD_ACCOUNT. Run: gcloud auth login" >&2
    exit 1
fi

secret_content=$(gcloud secrets versions access latest \
    --secret="$GCLOUD_SECRET_API" \
    --project="$GCLOUD_PROJECT" \
    --account="$GCLOUD_ACCOUNT" 2>/dev/null) || {
    echo "Failed to fetch secret '$GCLOUD_SECRET_API'. Check gcloud access." >&2
    exit 1
}

SUPABASE_DB_PASSWORD=$(echo "$secret_content" | grep '^SUPABASE_DB_PASSWORD=' | cut -d= -f2-)
SUPABASE_DB_REGION=$(echo "$secret_content" | grep '^SUPABASE_DB_REGION=' | cut -d= -f2-)
unset secret_content

if [[ -z "${SUPABASE_DB_PASSWORD:-}" || -z "${SUPABASE_DB_REGION:-}" ]]; then
    echo "SUPABASE_DB_PASSWORD / SUPABASE_DB_REGION missing from '$GCLOUD_SECRET_API'" >&2
    exit 1
fi

export SUPABASE_DB_PASSWORD SUPABASE_DB_REGION

npx tsx scripts/deploy/verify-prod-migration-state.ts "$@"
