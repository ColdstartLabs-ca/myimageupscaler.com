#!/bin/bash

step_deploy() {
    log_step 3 "Deploying"

    cd "$PROJECT_ROOT"

    # Main worker
    log_info "Deploying main worker..."
    # OpenNext populates the incremental-cache R2 bucket before deploying. Some
    # production API tokens intentionally have Workers/Zone access but no R2
    # object permission; use the already-authenticated Wrangler OAuth session
    # for this command when the production token cannot list the cache bucket.
    if npx wrangler r2 bucket list >/dev/null 2>&1; then
        npx opennextjs-cloudflare deploy
    elif env -u CLOUDFLARE_API_TOKEN npx wrangler r2 bucket list >/dev/null 2>&1; then
        log_warn "Production Cloudflare token lacks R2 access; using Wrangler OAuth for OpenNext deploy"
        env -u CLOUDFLARE_API_TOKEN npx opennextjs-cloudflare deploy
    else
        log_error "No authenticated Cloudflare credential can access the incremental-cache R2 bucket"
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
