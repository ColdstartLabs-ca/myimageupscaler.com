#!/bin/bash

step_preflight() {
    log_step 1 "Preflight checks"

    # Required Cloudflare env vars
    for var in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID DOMAIN_NAME; do
        [[ -z "${!var:-}" ]] && log_error "Missing $var in .env.api"
    done
    log_success "Cloudflare credentials"

    # Required Stripe env vars
    for var in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do
        [[ -z "${!var:-}" ]] && log_error "Missing $var in .env.api"
    done
    log_success "Stripe credentials"

    # Wrangler auth
    if ! npx wrangler whoami &>/dev/null; then
        log_info "Running wrangler login..."
        npx wrangler login
    fi
    log_success "Wrangler authenticated"

    # Stripe products check (informational only)
    check_stripe_products
}

check_stripe_products() {
    log_info "Checking Stripe products..."

    # Expected products (by metadata tier/pack_key)
    local expected=("starter" "hobby" "pro" "business" "small" "medium" "large")
    local missing=()

    # Query Stripe for active products
    local products=$(curl -s -u "$STRIPE_SECRET_KEY:" \
        "https://api.stripe.com/v1/products?active=true&limit=100" 2>/dev/null)

    if [[ -z "$products" ]] || echo "$products" | grep -q '"error"'; then
        log_warn "Could not verify Stripe products (API error)"
        return 0
    fi

    # Check each expected product
    for key in "${expected[@]}"; do
        if ! echo "$products" | grep -q "\"tier\":\"$key\"\|\"pack_key\":\"$key\""; then
            missing+=("$key")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_warn "Stripe products out of sync: ${missing[*]}"
        log_info "Run 'yarn stripe:setup' to fix"
    else
        log_success "Stripe products configured"
    fi
}
