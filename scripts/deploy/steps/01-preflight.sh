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

    # Stripe key must be live mode in production — test key = no real payments
    _check_stripe_key_mode

    # All configured price IDs must exist and be active in Stripe
    _check_stripe_price_ids

    # Webhook endpoint must subscribe to all required event types
    _check_stripe_webhook_events

    # Stripe products check (informational only)
    check_stripe_products
}

# Block deployment if a test key is being used outside of test/dev environment
_check_stripe_key_mode() {
    local key="${STRIPE_SECRET_KEY:-}"
    local env="${ENV:-production}"

    if [[ -z "$key" ]]; then
        log_error "STRIPE_SECRET_KEY is not set"
        exit 1
    fi

    if [[ "$env" != "test" && "$key" == sk_test_* ]]; then
        log_error "╔══════════════════════════════════════════════════════════════╗"
        log_error "║  TEST STRIPE KEY IN PRODUCTION — DEPLOYMENT BLOCKED          ║"
        log_error "║                                                              ║"
        log_error "║  STRIPE_SECRET_KEY starts with sk_test_ but ENV=$env         ║"
        log_error "║  Real payments will silently fail.                           ║"
        log_error "║                                                              ║"
        log_error "║  Set the live key (sk_live_...) in GCloud and redeploy.      ║"
        log_error "╚══════════════════════════════════════════════════════════════╝"
        exit 1
    fi

    if [[ "$key" == sk_live_* ]]; then
        log_success "Stripe key is live mode"
    else
        log_success "Stripe key mode OK (test environment)"
    fi
}

# Verify every STRIPE_PRICE_* env var resolves to an active price in Stripe
_check_stripe_price_ids() {
    local key="${STRIPE_SECRET_KEY:-}"
    local failed=()

    # Collect all configured price IDs (from both env files, loaded into env)
    declare -A price_vars
    # Check all NEXT_PUBLIC_STRIPE_PRICE_* and STRIPE_PRICE_* variables
    while IFS='=' read -r name value; do
        if [[ "$name" == *STRIPE_PRICE* && -n "$value" && "$value" == price_* ]]; then
            price_vars["$name"]="$value"
        fi
    done < <(env)

    if [[ ${#price_vars[@]} -eq 0 ]]; then
        log_warn "No STRIPE_PRICE_* vars found — skipping price ID check"
        return 0
    fi

    log_info "Checking ${#price_vars[@]} Stripe price IDs..."

    for name in "${!price_vars[@]}"; do
        local price_id="${price_vars[$name]}"
        local result
        result=$(curl -s -H "Authorization: Bearer $key" \
            "https://api.stripe.com/v1/prices/$price_id" 2>/dev/null)

        if echo "$result" | grep -q '"error"'; then
            failed+=("$name=$price_id (not found in Stripe)")
        elif echo "$result" | grep -q '"active": false'; then
            failed+=("$name=$price_id (archived/inactive)")
        fi
    done

    if [[ ${#failed[@]} -gt 0 ]]; then
        log_error "╔══════════════════════════════════════════════════════════════╗"
        log_error "║  STRIPE PRICE ID MISMATCH — DEPLOYMENT BLOCKED               ║"
        log_error "║                                                              ║"
        log_error "║  The following configured price IDs don't exist in Stripe:   ║"
        for item in "${failed[@]}"; do
            log_error "║    • $item"
        done
        log_error "║                                                              ║"
        log_error "║  These cause silent checkout failures. Fix before deploying. ║"
        log_error "╚══════════════════════════════════════════════════════════════╝"
        exit 1
    fi

    log_success "All Stripe price IDs valid"
}

# Verify the Stripe webhook endpoint subscribes to all events the app handles
_check_stripe_webhook_events() {
    local key="${STRIPE_SECRET_KEY:-}"

    local endpoints
    endpoints=$(curl -s -H "Authorization: Bearer $key" \
        "https://api.stripe.com/v1/webhook_endpoints?limit=20" 2>/dev/null)

    if echo "$endpoints" | grep -q '"error"'; then
        log_warn "Could not verify webhook events (Stripe API error)"
        return 0
    fi

    # Find the endpoint for our domain
    local domain="${DOMAIN_NAME:-myimageupscaler.com}"
    local endpoint_events
    endpoint_events=$(echo "$endpoints" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for ep in data.get('data', []):
    if '$domain' in ep.get('url', ''):
        print(' '.join(ep.get('enabled_events', [])))
        break
" 2>/dev/null || true)

    if [[ -z "$endpoint_events" ]]; then
        log_warn "No webhook endpoint found for $domain — skipping event check"
        return 0
    fi

    local required_events=(
        "checkout.session.completed"
        "customer.subscription.created"
        "customer.subscription.updated"
        "customer.subscription.deleted"
        "invoice.payment_succeeded"
        "invoice.payment_failed"
    )

    local missing=()
    for event in "${required_events[@]}"; do
        if ! echo "$endpoint_events" | grep -qw "$event"; then
            missing+=("$event")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "╔══════════════════════════════════════════════════════════════╗"
        log_error "║  MISSING WEBHOOK EVENT SUBSCRIPTIONS — DEPLOYMENT BLOCKED    ║"
        log_error "║                                                              ║"
        log_error "║  The following events are not subscribed on the endpoint:    ║"
        for ev in "${missing[@]}"; do
            log_error "║    • $ev"
        done
        log_error "║                                                              ║"
        log_error "║  Fix in Stripe Dashboard → Developers → Webhooks.            ║"
        log_error "╚══════════════════════════════════════════════════════════════╝"
        exit 1
    fi

    log_success "Webhook event subscriptions complete"
}

check_stripe_products() {
    log_info "Checking Stripe products..."

    # Query Stripe for active products
    local products
    products=$(curl -s -H "Authorization: Bearer $STRIPE_SECRET_KEY" \
        "https://api.stripe.com/v1/products?active=true&limit=100" 2>/dev/null)

    if [[ -z "$products" ]] || echo "$products" | grep -q '"error"'; then
        log_warn "Could not verify Stripe products (API error)"
        return 0
    fi

    local missing=""

    # Check subscription products (by metadata tier OR by name)
    # Starter
    if ! echo "$products" | grep -qE '"tier":\s*"starter"' && \
       ! echo "$products" | grep -qi '"name":\s*"Starter'; then
        missing="$missing starter"
    fi
    # Hobby
    if ! echo "$products" | grep -qE '"tier":\s*"hobby"' && \
       ! echo "$products" | grep -qi '"name":\s*"Hobby'; then
        missing="$missing hobby"
    fi
    # Pro/Professional
    if ! echo "$products" | grep -qE '"tier":\s*"pro"' && \
       ! echo "$products" | grep -qi '"name":\s*"Pro' && \
       ! echo "$products" | grep -qi '"name":\s*"Professional'; then
        missing="$missing pro"
    fi
    # Business
    if ! echo "$products" | grep -qE '"tier":\s*"business"' && \
       ! echo "$products" | grep -qi '"name":\s*"Business'; then
        missing="$missing business"
    fi

    # Check credit pack products (by metadata pack_key OR by name)
    # Small / Starter Credits Pack
    if ! echo "$products" | grep -qE '"pack_key":\s*"small"' && \
       ! echo "$products" | grep -qi '"name":\s*"Small Credit' && \
       ! echo "$products" | grep -qi '"name":\s*"Starter Credits'; then
        missing="$missing small"
    fi
    # Medium / Pro Credits Pack
    if ! echo "$products" | grep -qE '"pack_key":\s*"medium"' && \
       ! echo "$products" | grep -qi '"name":\s*"Medium Credit' && \
       ! echo "$products" | grep -qi '"name":\s*"Pro Credits'; then
        missing="$missing medium"
    fi
    # Large / Enterprise Credits Pack
    if ! echo "$products" | grep -qE '"pack_key":\s*"large"' && \
       ! echo "$products" | grep -qi '"name":\s*"Large Credit' && \
       ! echo "$products" | grep -qi '"name":\s*"Enterprise Credits'; then
        missing="$missing large"
    fi

    if [[ -n "$missing" ]]; then
        log_warn "Stripe products may be missing:$missing"
        log_info "Run 'yarn stripe:setup' to fix or verify manually in Stripe Dashboard"
    else
        log_success "Stripe products configured"
    fi
}
