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
            _run_smoke_tests "$url"
            return 0
        fi
        log_info "Attempt $i/5: HTTP $status"
        sleep 3
    done

    log_warn "Health check didn't return 200 (may still be propagating)"
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
