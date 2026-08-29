#!/bin/bash

step_deploy() {
    log_step 3 "Deploying"

    cd "$PROJECT_ROOT"

    # The producer cannot reference a Tail Worker service until that service exists.
    if [[ -f "workers/upscale-refund-tail/wrangler.toml" ]]; then
        log_info "Deploying upscale refund tail worker..."
        npx wrangler deploy --config workers/upscale-refund-tail/wrangler.toml
        local refund_tail_worker_name
        refund_tail_worker_name=$(grep '^name' workers/upscale-refund-tail/wrangler.toml | head -1 | awk -F'"' '{print $2}')
        if [[ -z "${CRON_SECRET:-}" || -z "$refund_tail_worker_name" ]]; then
            log_error "CRON_SECRET and the refund Tail Worker name are required before producer deployment"
        fi
        echo "$CRON_SECRET" | npx wrangler secret put CRON_SECRET --name "$refund_tail_worker_name" 2>/dev/null
        log_success "Upscale refund tail worker deployed with recovery secret"
    fi

    # Incremental cache. `opennextjs-cloudflare deploy` would do this itself, but it
    # shells out to `wrangler r2 bulk put`, which throttles to 1100 objects per 5 minutes
    # and has its progress output swallowed. Our script uses R2's S3 API instead, which
    # has no such cap, and falls back to a visible wrangler bulk put without credentials.
    log_info "Populating incremental cache..."
    npx tsx scripts/deploy/populate-r2-cache.ts
    log_success "Incremental cache populated"

    # Main worker. Some production API tokens intentionally have Workers/Zone access but
    # no R2 object permission; fall back to the Wrangler OAuth session when that happens.
    log_info "Deploying main worker..."
    if ! OPEN_NEXT_DEPLOY=true npx wrangler deploy; then
        log_warn "Worker deploy with the production token failed; retrying with Wrangler OAuth"
        env -u CLOUDFLARE_API_TOKEN OPEN_NEXT_DEPLOY=true npx wrangler deploy
    fi
    log_success "Main worker deployed"

    # Cron worker
    if [[ -d "workers/cron" ]]; then
        log_info "Deploying cron worker..."
        npx wrangler deploy --config workers/cron/wrangler.toml
        log_success "Cron worker deployed"
    fi

    # Outrank webhook proxy (bypasses Bot Fight Mode via workers.dev)
    if [[ -d "workers/outrank-proxy" ]]; then
        log_info "Deploying outrank proxy worker..."
        npx wrangler deploy --config workers/outrank-proxy/wrangler.toml
        log_success "Outrank proxy worker deployed"
    fi
}
