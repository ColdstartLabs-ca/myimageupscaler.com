#!/bin/bash

run_supabase_cli() {
    env \
        -u npm_config_argv \
        -u npm_config_version_commit_hooks \
        -u npm_config_version_git_message \
        -u npm_config_version_git_tag \
        -u npm_config_version_tag_prefix \
        npx supabase "$@"
}

deploy_database_migrations() {
    local linked_ref_path="$PROJECT_ROOT/supabase/.temp/project-ref"
    local expected_project_ref=""
    local linked_project_ref=""
    local migration_db_url=""

    cd "$PROJECT_ROOT"

    if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
        log_error "SUPABASE_DB_PASSWORD is required to verify and apply production migrations."
        return 1
    fi

    if [[ ! "${NEXT_PUBLIC_SUPABASE_URL:-}" =~ ^https://([a-z0-9]+)\.supabase\.co/?$ ]]; then
        log_error "NEXT_PUBLIC_SUPABASE_URL is not a valid Supabase project URL."
        return 1
    fi
    expected_project_ref="${BASH_REMATCH[1]}"

    log_info "Verifying and applying production database migrations..."

    if [[ -f "$linked_ref_path" ]]; then
        linked_project_ref=$(tr -d '[:space:]' < "$linked_ref_path")
        if [[ "$linked_project_ref" != "$expected_project_ref" ]]; then
            log_error "Linked Supabase project '$linked_project_ref' does not match production project '$expected_project_ref'. Deployment blocked."
            return 1
        fi
    fi

    if [[ -z "${SUPABASE_DB_REGION:-}" || ! "${SUPABASE_DB_REGION:-}" =~ ^[a-z0-9-]+$ ]]; then
        log_error "SUPABASE_DB_REGION must be a valid pooler region. Deployment blocked."
        return 1
    fi

    # Use the same IPv4 session pooler as backups; no management token is needed.
    if ! migration_db_url=$(node --input-type=module <<'NODE'
import { env, stdout } from 'node:process';
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const url = new URL(`postgresql://postgres.${ref}@aws-0-${env.SUPABASE_DB_REGION}.pooler.supabase.com:5432/postgres`);
url.password = encodeURIComponent(env.SUPABASE_DB_PASSWORD);
stdout.write(url.href);
NODE
    ); then
        log_error "Could not prepare the production database connection. Deployment blocked."
        return 1
    fi

    log_info "Checking production migration history..."
    if ! run_supabase_cli db push \
        --db-url "$migration_db_url" \
        --skip-vault \
        --dry-run; then
        log_error "Production migration history is incompatible with this repository. Deployment blocked; repair the mismatch manually."
        return 1
    fi

    log_info "Applying pending production migrations..."
    if ! run_supabase_cli db push \
        --db-url "$migration_db_url" \
        --skip-vault \
        --yes; then
        log_error "Production migrations failed. Deployment blocked."
        return 1
    fi

    log_info "Confirming production migration history is synchronized..."
    if ! run_supabase_cli db push \
        --db-url "$migration_db_url" \
        --skip-vault \
        --dry-run; then
        log_error "Production migration verification failed after applying migrations. Deployment blocked."
        return 1
    fi

    log_success "Production database migrations synchronized"
    echo ""
}
