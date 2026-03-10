#!/bin/bash

# ============================================================================
# Step 1: Check and install dependencies
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PROJECT_ROOT="$(get_project_root)"

check_dependencies() {
    log_step "Checking dependencies..."

    # Check Node.js
    if ! command_exists node; then
        log_error "Node.js is not installed. Please install Node.js 18+"
        echo "  Download: https://nodejs.org/"
        return 1
    fi

    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$node_version" -lt 18 ]]; then
        log_error "Node.js 18+ required. Found: $(node -v)"
        return 1
    fi
    log_success "Node.js $(node -v)"

    # Check Yarn
    if ! command_exists yarn; then
        log_warning "Yarn not found. Installing..."
        npm install -g yarn
    fi
    log_success "Yarn $(yarn -v)"

    # Install node_modules if needed
    if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
        log_info "Installing dependencies..."
        cd "$PROJECT_ROOT" && yarn install
    fi
    log_success "Dependencies installed"

    # Install Playwright browsers if missing
    local playwright_cache="$HOME/.cache/ms-playwright"
    if [[ ! -d "$playwright_cache" ]] || [[ -z "$(ls -A "$playwright_cache" 2>/dev/null)" ]]; then
        log_info "Installing Playwright browsers..."
        cd "$PROJECT_ROOT" && yarn playwright install chromium
    else
        log_success "Playwright browsers installed"
    fi

    # Check optional tools
    if command_exists supabase; then
        log_success "Supabase CLI $(supabase --version 2>/dev/null || echo 'installed')"
    else
        log_warning "Supabase CLI not installed (optional)"
        echo "  Install: brew install supabase/tap/supabase"
    fi

    if command_exists stripe; then
        log_success "Stripe CLI installed"
    else
        log_warning "Stripe CLI not installed (optional for webhooks)"
        echo "  Install: brew install stripe/stripe-cli/stripe"
    fi

    return 0
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
fi
