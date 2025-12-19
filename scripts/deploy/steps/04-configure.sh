#!/bin/bash

step_configure() {
    log_step 4 "Configuring SSL"

    # Routes are configured via wrangler.json automatically on deploy
    log_info "Routes configured via wrangler.json"

    # SSL settings (idempotent) - requires Zone Settings permissions
    local ssl_result=$(cf_api PATCH "/zones/$CLOUDFLARE_ZONE_ID/settings/ssl" '{"value":"strict"}')
    if echo "$ssl_result" | grep -q '"success":true'; then
        cf_api PATCH "/zones/$CLOUDFLARE_ZONE_ID/settings/always_use_https" '{"value":"on"}' >/dev/null
        cf_api PATCH "/zones/$CLOUDFLARE_ZONE_ID/settings/min_tls_version" '{"value":"1.2"}' >/dev/null
        log_success "SSL configured"
    else
        log_warn "SSL config skipped (token may lack Zone Settings permission)"
    fi
}
