#!/bin/bash

# ============================================================================
# Step 3: Validate Supabase connection
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PROJECT_ROOT="$(get_project_root)"

validate_supabase() {
    log_step "Validating Supabase connection..."

    # Load environment
    load_env "$PROJECT_ROOT"

    # Check URL is configured
    if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || "$NEXT_PUBLIC_SUPABASE_URL" == "https://your-project.supabase.co" ]]; then
        log_error "Supabase URL not configured in .env.client"
        log_info "Run: yarn setup (without --skip-env)"
        return 1
    fi

    # Check service key is configured
    if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" || "$SUPABASE_SERVICE_ROLE_KEY" == "XXX" ]]; then
        log_error "Supabase Service Role Key not configured in .env.api"
        return 1
    fi

    # Extract project ref
    local project_ref=$(get_supabase_project_ref)
    if [[ -z "$project_ref" ]]; then
        log_error "Could not extract project ref from Supabase URL"
        return 1
    fi

    # Test connection
    local response=$(test_supabase_connection)

    if [[ "$response" != "200" ]]; then
        log_error "Failed to connect to Supabase (HTTP $response)"
        echo ""
        echo "Please verify:"
        echo "  - NEXT_PUBLIC_SUPABASE_URL is correct"
        echo "  - SUPABASE_SERVICE_ROLE_KEY is valid (not anon key)"
        echo "  - Network connectivity"
        return 1
    fi

    log_success "Connected to Supabase: $project_ref"

    # Export for other scripts
    export SUPABASE_PROJECT_REF="$project_ref"

    return 0
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    validate_supabase
fi
