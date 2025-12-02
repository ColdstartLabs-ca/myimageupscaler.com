#!/bin/bash

# ============================================================================
# PixelPerfect Setup Orchestrator
# ============================================================================
# This script orchestrates the complete development setup by running
# modular setup scripts in sequence.
#
# Usage:
#   yarn setup              # Full interactive setup
#   yarn setup --skip-env   # Skip environment prompts (use existing .env.client/.env.api)
#   yarn setup --help       # Show help
#
# Individual modules can also be run directly:
#   ./scripts/setup/01-dependencies.sh
#   ./scripts/setup/02-environment.sh
#   ./scripts/setup/03-supabase-validate.sh
#   ./scripts/setup/04-supabase-auth.sh
#   ./scripts/setup/05-migrations.sh
#   ./scripts/setup/06-types.sh
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_DIR="$SCRIPT_DIR/setup"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source common utilities
source "$SETUP_DIR/common.sh"

# Flags
SKIP_ENV=false
SKIP_SUPABASE=false
SKIP_MIGRATIONS=false
SKIP_TYPES=false

# ============================================================================
# Help
# ============================================================================

show_help() {
    cat << EOF
${BOLD}PixelPerfect Setup Orchestrator${NC}

Usage: ./scripts/setup.sh [options]

Options:
  --skip-env          Skip environment file setup (use existing .env.client/.env.api)
  --skip-supabase     Skip Supabase auth configuration
  --skip-migrations   Skip database migrations
  --skip-types        Skip TypeScript type generation
  --help, -h          Show this help message

Examples:
  ./scripts/setup.sh                    # Full interactive setup
  ./scripts/setup.sh --skip-env         # Use existing .env.client/.env.api
  yarn setup                            # Via package.json script

What this script does:
  1. Checks dependencies (Node.js, Yarn, optional CLIs)
  2. Creates/configures .env.client and .env.api files
  3. Validates Supabase connectivity
  4. Guides Supabase Auth configuration
  5. Applies database migrations
  6. Generates TypeScript types

Individual modules:
  ./scripts/setup/01-dependencies.sh    Check system dependencies
  ./scripts/setup/02-environment.sh     Configure environment files
  ./scripts/setup/03-supabase-validate.sh   Validate Supabase connection
  ./scripts/setup/04-supabase-auth.sh   Configure auth settings
  ./scripts/setup/05-migrations.sh      Apply database migrations
  ./scripts/setup/06-types.sh           Generate TypeScript types

EOF
    exit 0
}

# ============================================================================
# Parse Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-env) SKIP_ENV=true; shift ;;
        --skip-supabase) SKIP_SUPABASE=true; shift ;;
        --skip-migrations) SKIP_MIGRATIONS=true; shift ;;
        --skip-types) SKIP_TYPES=true; shift ;;
        --help|-h) show_help ;;
        *) log_error "Unknown option: $1"; show_help ;;
    esac
done

# ============================================================================
# Banner
# ============================================================================

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}          ${BOLD}PixelPerfect Development Setup${NC}                   ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# Make all setup scripts executable
# ============================================================================

chmod +x "$SETUP_DIR"/*.sh 2>/dev/null || true

# ============================================================================
# Step 1: Dependencies
# ============================================================================

source "$SETUP_DIR/01-dependencies.sh"
check_dependencies || exit 1

# ============================================================================
# Step 2: Environment
# ============================================================================

source "$SETUP_DIR/02-environment.sh"

if [[ "$SKIP_ENV" == "true" ]]; then
    if [[ ! -f "$PROJECT_ROOT/.env.client" || ! -f "$PROJECT_ROOT/.env.api" ]]; then
        log_error "Cannot skip env setup - .env.client or .env.api missing"
        exit 1
    fi
    log_info "Using existing environment files"
else
    setup_environment true
    configure_supabase_credentials

    echo ""
    read -p "Configure Stripe keys now? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        configure_stripe_credentials
    fi
fi

# ============================================================================
# Step 3: Validate Supabase
# ============================================================================

source "$SETUP_DIR/03-supabase-validate.sh"
validate_supabase || exit 1

# ============================================================================
# Step 4: Supabase Auth Configuration
# ============================================================================

if [[ "$SKIP_SUPABASE" != "true" ]]; then
    source "$SETUP_DIR/04-supabase-auth.sh"
    configure_supabase_auth
fi

# ============================================================================
# Step 5: Migrations
# ============================================================================

if [[ "$SKIP_MIGRATIONS" != "true" ]]; then
    source "$SETUP_DIR/05-migrations.sh"
    apply_migrations auto
fi

# ============================================================================
# Step 6: TypeScript Types
# ============================================================================

if [[ "$SKIP_TYPES" != "true" ]]; then
    source "$SETUP_DIR/06-types.sh"
    generate_types
fi

# ============================================================================
# Summary
# ============================================================================

# Load env to get project ref for links
load_env "$PROJECT_ROOT"
PROJECT_REF="${SUPABASE_PROJECT_REF:-$(get_supabase_project_ref)}"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}                  ${GREEN}${BOLD}Setup Complete!${NC}                          ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BOLD}Next steps:${NC}"
echo ""
echo "  1. Start development server:"
echo -e "     ${CYAN}yarn dev${NC}"
echo ""
echo "  2. Open the app:"
echo -e "     ${CYAN}http://localhost:3000${NC}"
echo ""
echo "  3. Verify setup by signing up a test user"
echo ""

echo -e "${BOLD}Useful commands:${NC}"
echo ""
echo "  yarn dev          Start dev server with Stripe webhooks"
echo "  yarn verify       Run type checks, lint, and tests"
echo "  yarn test:e2e     Run end-to-end tests"
echo "  yarn setup:db     Re-run migrations only"
echo ""

echo -e "${BOLD}Dashboard links:${NC}"
echo ""
echo "  Supabase:  https://supabase.com/dashboard/project/$PROJECT_REF"
echo "  Stripe:    https://dashboard.stripe.com/test"
echo ""
