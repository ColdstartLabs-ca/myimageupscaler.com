#!/bin/bash

step_verify() {
    log_step 6 "Verifying"

    local url="https://$DOMAIN_NAME"

    log_info "Waiting for propagation..."
    sleep 5

    for i in {1..5}; do
        status=$(curl -s -o /dev/null -w "%{http_code}" "$url/api/health" 2>/dev/null || echo "000")
        if [[ "$status" == "200" ]]; then
            log_success "Health check passed"
            _verify_webhook_secret "$url"
            _check_subscription_reconciliation
            _run_smoke_tests "$url"
            return 0
        fi
        log_info "Attempt $i/5: HTTP $status"
        sleep 3
    done

    log_warn "Health check didn't return 200 (may still be propagating)"
}

# Verify STRIPE_WEBHOOK_SECRET on Cloudflare matches Stripe by sending a correctly-signed
# test event and checking for a non-400 response. A 400 means signature mismatch — deploy blocked.
_verify_webhook_secret() {
    local url="$1"
    local secret="${STRIPE_WEBHOOK_SECRET:-}"

    if [[ -z "$secret" ]]; then
        log_warn "STRIPE_WEBHOOK_SECRET not set in env — skipping webhook signature check"
        return 0
    fi

    log_info "Verifying webhook signature (STRIPE_WEBHOOK_SECRET matches Cloudflare)..."

    local timestamp
    timestamp=$(date +%s)
    local body='{"id":"evt_deploy_check","object":"event","type":"account.application.authorized","livemode":true,"created":'"$timestamp"',"data":{"object":{}},"pending_webhooks":0,"request":null,"api_version":"2025-12-15.clover"}'
    local signed_payload="${timestamp}.${body}"
    local signature
    signature=$(echo -n "$signed_payload" | openssl dgst -sha256 -hmac "$secret" | awk '{print $2}')
    local stripe_signature="t=${timestamp},v1=${signature}"

    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$url/api/webhooks/stripe" \
        -H "Content-Type: application/json" \
        -H "stripe-signature: $stripe_signature" \
        --data-raw "$body" 2>/dev/null || echo "000")

    if [[ "$response_code" == "400" ]]; then
        log_error "╔══════════════════════════════════════════════════════════════╗"
        log_error "║  WEBHOOK SECRET MISMATCH — DEPLOYMENT BLOCKED                ║"
        log_error "║                                                              ║"
        log_error "║  The STRIPE_WEBHOOK_SECRET on Cloudflare does not match the  ║"
        log_error "║  signing secret for the Stripe webhook endpoint.             ║"
        log_error "║                                                              ║"
        log_error "║  To fix:                                                     ║"
        log_error "║  1. Go to Stripe Dashboard → Developers → Webhooks           ║"
        log_error "║  2. Click the endpoint → Reveal signing secret              ║"
        log_error "║  3. Run: echo 'whsec_...' | npx wrangler secret put          ║"
        log_error "║              STRIPE_WEBHOOK_SECRET                          ║"
        log_error "║  4. Update GCloud: gcloud secrets versions add               ║"
        log_error "║              myimageupscaler-api-prod                        ║"
        log_error "╚══════════════════════════════════════════════════════════════╝"
        exit 1
    elif [[ "$response_code" == "200" || "$response_code" == "422" ]]; then
        log_success "Webhook signature verified — Cloudflare secret matches Stripe"
    else
        log_warn "Webhook check returned HTTP $response_code (non-blocking, may be transient)"
    fi
}

# Cross-check active Stripe subscriptions against Supabase profiles.
# Catches the class of bug where webhooks silently fail and paying users are stuck on free tier.
# Warns (non-blocking) so deploy isn't rolled back, but ops team is alerted immediately.
_check_subscription_reconciliation() {
    local stripe_key="${STRIPE_SECRET_KEY:-}"
    local supabase_url="${NEXT_PUBLIC_SUPABASE_URL:-}"
    local supabase_key="${SUPABASE_SERVICE_ROLE_KEY:-}"

    if [[ -z "$stripe_key" || -z "$supabase_url" || -z "$supabase_key" ]]; then
        log_warn "Missing credentials for subscription reconciliation — skipping"
        return 0
    fi

    log_info "Reconciling active Stripe subscriptions with Supabase..."

    # Get all active Stripe subscriptions (customer IDs)
    local stripe_subs
    stripe_subs=$(curl -s -H "Authorization: Bearer $stripe_key" \
        "https://api.stripe.com/v1/subscriptions?status=active&limit=100" 2>/dev/null)

    if echo "$stripe_subs" | grep -q '"error"'; then
        log_warn "Could not fetch Stripe subscriptions — skipping reconciliation"
        return 0
    fi

    # Extract customer IDs from active subscriptions
    local customer_ids
    customer_ids=$(echo "$stripe_subs" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data.get('data', []):
    print(s['customer'])
" 2>/dev/null || true)

    if [[ -z "$customer_ids" ]]; then
        log_success "No active subscriptions to reconcile"
        return 0
    fi

    local drift_count=0
    while IFS= read -r customer_id; do
        [[ -z "$customer_id" ]] && continue

        # Check Supabase profile for this customer
        local profile
        profile=$(curl -s \
            -H "apikey: $supabase_key" \
            -H "Authorization: Bearer $supabase_key" \
            "$supabase_url/rest/v1/profiles?stripe_customer_id=eq.$customer_id&select=id,subscription_status,subscription_tier" \
            2>/dev/null)

        # Check if profile has active subscription tier
        if ! echo "$profile" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if not data:
    print('NO_PROFILE')
    sys.exit(0)
p = data[0]
if p.get('subscription_status') != 'active' or not p.get('subscription_tier'):
    print('NOT_ACTIVATED: status=' + str(p.get('subscription_status')) + ' tier=' + str(p.get('subscription_tier')))
" 2>/dev/null | grep -q "^NOT_ACTIVATED\|^NO_PROFILE"; then
            : # OK
        else
            drift_count=$((drift_count + 1))
            log_warn "Subscription drift: Stripe customer $customer_id has active sub but profile is not activated"
        fi
    done <<< "$customer_ids"

    if [[ $drift_count -gt 0 ]]; then
        log_warn "╔══════════════════════════════════════════════════════════════╗"
        log_warn "║  SUBSCRIPTION DRIFT DETECTED ($drift_count user(s))                    ║"
        log_warn "║                                                              ║"
        log_warn "║  Active Stripe subscriptions have no matching activated      ║"
        log_warn "║  profile in Supabase. Webhooks may be failing.              ║"
        log_warn "║                                                              ║"
        log_warn "║  Check Stripe webhook delivery logs immediately.             ║"
        log_warn "║  Use: node scripts/fix-subscription.js <email> to repair.   ║"
        log_warn "╚══════════════════════════════════════════════════════════════╝"
        # Non-blocking: deployment succeeds but ops team is warned
    else
        log_success "Subscription reconciliation OK — all active subs are activated"
    fi
}

_run_smoke_tests() {
    local url="$1"

    if [[ "${SKIP_SMOKE:-false}" == "true" ]]; then
        log_info "Skipping smoke tests (--skip-smoke)"
        return 0
    fi

    log_info "Running checkout smoke tests..."
    sleep 3  # brief extra wait for Workers secret propagation

    if SMOKE_BASE_URL="$url" npx playwright test --config=playwright.smoke.config.ts 2>&1 | tail -5; then
        log_success "Smoke tests passed — checkout pipeline OK"
    else
        log_warn "Smoke tests failed — checkout pipeline may be broken, check manually"
    fi
}
