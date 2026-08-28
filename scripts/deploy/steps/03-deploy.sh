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

    # Main worker
    log_info "Deploying main worker..."
    # OpenNext populates the incremental-cache R2 bucket before deploying. Some
    # production API tokens intentionally have Workers/Zone access but no R2
    # object permission; use the already-authenticated Wrangler OAuth session
    # for this command when the production token cannot list the cache bucket.
    if npx wrangler r2 bucket list >/dev/null 2>&1; then
        if ! npx opennextjs-cloudflare deploy; then
            log_warn "OpenNext deploy failed after cache upload; retrying the Worker upload with Wrangler"
            OPEN_NEXT_DEPLOY=true npx wrangler deploy
        fi
    elif env -u CLOUDFLARE_API_TOKEN npx wrangler r2 bucket list >/dev/null 2>&1; then
        log_warn "Production Cloudflare token lacks R2 access; using Wrangler OAuth for OpenNext deploy"
        if ! env -u CLOUDFLARE_API_TOKEN npx opennextjs-cloudflare deploy; then
            log_warn "OpenNext deploy failed after cache upload; retrying the Worker upload with Wrangler OAuth"
            env -u CLOUDFLARE_API_TOKEN OPEN_NEXT_DEPLOY=true npx wrangler deploy
        fi
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
