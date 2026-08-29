#!/bin/bash

step_verify() {
    log_step 6 "Verifying"

    local url="https://$DOMAIN_NAME"

    log_info "Waiting for propagation..."
    sleep 5

    _verify_cron_schedules

    for i in {1..5}; do
        status=$(curl -s -o /dev/null -w "%{http_code}" "$url/api/health" 2>/dev/null || echo "000")
        if [[ "$status" == "200" ]]; then
            log_success "Health check passed"
            _verify_html_cache "$url"
            _verify_provider_health_cron "$url"
            _verify_webhook_secret "$url"
            _verify_recovery_lifecycle_dry_run "$url"
            _verify_email_delivery_readiness
            _check_subscription_reconciliation
            _run_smoke_tests "$url"
            return 0
        fi
        log_info "Attempt $i/5: HTTP $status"
        sleep 3
    done

    log_warn "Health check didn't return 200 (may still be propagating)"
}

_verify_html_cache() {
    local url="$1"

    log_info "Verifying deployed anonymous HTML cache..."
    cd "$PROJECT_ROOT"
    if yarn seo:cache:gate -- --base-url="$url"; then
        log_success "Anonymous HTML cache verified"
        return 0
    fi
    log_error "Deployed anonymous HTML cache verification failed"
}

_verify_email_delivery_readiness() {
    log_info "Verifying no-send email delivery readiness..."
    cd "$PROJECT_ROOT"
    if yarn email:delivery:readiness:prod; then
        log_success "Email delivery readiness verified"
        return 0
    fi
    log_error "Email delivery readiness failed"
}

_verify_cron_schedules() {
    log_info "Verifying deployed cron schedules..."

    cd "$PROJECT_ROOT"
    for i in {1..5}; do
        if yarn cron:check --remote; then
            log_success "Cron schedules active"
            return 0
        fi
        log_info "Cron schedule check attempt $i/5 failed; retrying..."
        sleep 3
    done

    log_error "Deployed cron schedules do not match workers/cron/wrangler.toml"
}

_verify_provider_health_cron() {
    local url="$1"
    local cron_secret="${CRON_SECRET:-}"

    if [[ -z "$cron_secret" ]]; then
        log_error "CRON_SECRET is required for provider health verification"
    fi

    log_info "Verifying provider health cron..."

    local response_file
    response_file=$(mktemp)
    local response_code
    response_code=$(curl -s -o "$response_file" -w "%{http_code}" \
        -X POST "$url/api/cron/provider-health" \
        -H "x-cron-secret: $cron_secret" \
        2>/dev/null || echo "000")

    if [[ "$response_code" != "200" ]]; then
        rm -f "$response_file"
        log_error "Provider health verification returned HTTP $response_code"
    fi

    if ! jq -e '.success == true' "$response_file" >/dev/null 2>&1; then
        rm -f "$response_file"
        log_error "Provider health cron verification failed"
    fi

    rm -f "$response_file"
    log_success "Provider health cron verified"
}

_verify_recovery_lifecycle_dry_run() {
    local url="$1"
    local cron_secret="${CRON_SECRET:-}"

    if [[ -z "$cron_secret" ]]; then
        log_warn "CRON_SECRET is not set — skipping recovery lifecycle dry-run verification"
        return 0
    fi

    log_info "Verifying recovery lifecycle dry-run..."

    local response_file
    response_file=$(mktemp)
    local response_code
    response_code=$(curl -s -o "$response_file" -w "%{http_code}" \
        --max-time 60 \
        -X POST "$url/api/cron/email-lifecycle?dryRun=true&batchSize=25&scanLimit=25" \
        -H "x-cron-secret: $cron_secret" \
        2>/dev/null || echo "000")

    if [[ "$response_code" != "200" ]]; then
        local error_preview
        error_preview=$(python3 - "$response_file" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        body = fh.read().strip()
except OSError:
    body = ""

if not body:
    raise SystemExit(0)

try:
    data = json.loads(body)
    message = data.get("error") or data.get("message") or body
except Exception:
    message = body

print(str(message).replace("\n", " ")[:500])
PY
)
        if [[ -n "$error_preview" ]]; then
            rm -f "$response_file"
            log_error "Recovery lifecycle dry-run failed with HTTP $response_code: $error_preview"
        fi
        rm -f "$response_file"
        log_error "Recovery lifecycle dry-run failed with HTTP $response_code"
    fi

    if python3 - "$response_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)

required_audiences = {
    "checkout_abandoner",
    "upgrade_click_no_purchase",
    "credit_wall_dismissed",
    "high_usage_free_user",
}
recovery = data.get("recoveryEligibility")
by_audience = recovery.get("byAudience") if isinstance(recovery, dict) else None

if data.get("success") is not True or data.get("dryRun") is not True:
    raise SystemExit("dry-run response did not report success=true and dryRun=true")
if not isinstance(data.get("duePending"), int):
    raise SystemExit("dry-run response is missing duePending")
if not isinstance(data.get("durationMs"), int):
    raise SystemExit("dry-run response is missing durationMs")
if not isinstance(by_audience, dict):
    raise SystemExit("dry-run response is missing recoveryEligibility.byAudience")
missing = sorted(required_audiences - set(by_audience))
if missing:
    raise SystemExit(f"dry-run response is missing recovery audiences: {', '.join(missing)}")
for audience, counts in by_audience.items():
    if audience not in required_audiences:
        continue
    if not isinstance(counts, dict):
        raise SystemExit(f"{audience} counts are not an object")
    for key in ("scanned", "eligible", "queued", "skippedPurchased", "skippedPriority", "skippedMissingEmail"):
        if not isinstance(counts.get(key), int):
            raise SystemExit(f"{audience}.{key} is missing or not an integer")
PY
    then
        rm -f "$response_file"
        log_success "Recovery lifecycle dry-run verified"
    else
        rm -f "$response_file"
        log_error "Recovery lifecycle dry-run returned an invalid response shape"
    fi
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
