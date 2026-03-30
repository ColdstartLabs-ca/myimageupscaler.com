#!/bin/bash

step_deploy() {
    log_step 3 "Deploying"

    cd "$PROJECT_ROOT"

    # Main worker
    log_info "Deploying main worker..."
    npx opennextjs-cloudflare deploy
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
