#!/bin/bash

step_build() {
    log_step 2 "Building"

    cd "$PROJECT_ROOT"

    # Create .env.local for Next.js build (combines client + api env vars)
    log_info "Creating .env.local for Next.js build..."
    cat .env.client.prod .env.api.prod > .env.local 2>/dev/null || true

    log_info "Building blog data..."
    npx tsx scripts/build-blog.ts

    log_info "OpenNext build..."
    npx opennextjs-cloudflare build

    # Clean up .env.local after build
    rm -f .env.local

    [[ ! -f ".open-next/worker.js" ]] && log_error "Build failed"
    log_success "Build complete"
}
