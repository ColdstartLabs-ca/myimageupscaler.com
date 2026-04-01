#!/bin/bash

# Database Backup & Restore Script
# Exports/imports the Supabase PostgreSQL database using pg_dump/pg_restore
# DB credentials are fetched from GCloud Secret Manager on demand — nothing stored locally.
#
# Usage:
#   ./scripts/db-backup.sh export [--sql] [--data-only] [--schema-only]
#   ./scripts/db-backup.sh import <file>
#   ./scripts/db-backup.sh list
#   ./scripts/db-backup.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUPS_DIR="$PROJECT_ROOT/backups"

# GCloud Secret Manager config (matches deploy/steps/00-fetch-secrets.sh)
GCLOUD_PROJECT="myimageupscaler-auth"
GCLOUD_SECRET_API="myimageupscaler-api-prod"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
log_step()    { echo -e "\n${CYAN}${BOLD}▸ $1${NC}"; }

usage() {
    echo -e "${BOLD}Usage:${NC}"
    echo "  yarn db:backup                            Export database (custom format)"
    echo "  yarn db:export -- --sql                   Export as plain SQL"
    echo "  yarn db:export -- --data-only             Export data only (no schema)"
    echo "  yarn db:export -- --schema-only           Export schema only (no data)"
    echo "  yarn db:import -- <file>                  Restore from backup file"
    echo "  yarn db:backups                           List available backups"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  yarn db:backup"
    echo "  yarn db:export -- --sql"
    echo "  yarn db:import -- backups/backup_2026-03-31_14-30-00.dump"
    exit 0
}

# Fetch DB credentials from GCloud Secret Manager
fetch_db_credentials() {
    log_step "Fetching DB credentials from GCloud Secret Manager"

    if ! command -v gcloud &>/dev/null; then
        log_error "gcloud CLI not installed. Install from: https://cloud.google.com/sdk/docs/install"
    fi

    if ! gcloud auth print-identity-token &>/dev/null 2>&1; then
        log_error "Not authenticated with gcloud. Run: gcloud auth login"
    fi

    local secret_content
    secret_content=$(gcloud secrets versions access latest \
        --secret="$GCLOUD_SECRET_API" \
        --project="$GCLOUD_PROJECT" 2>/dev/null) \
        || log_error "Failed to fetch secret '$GCLOUD_SECRET_API'. Check gcloud access."

    # Extract specific vars from the secret (KEY=VALUE format)
    SUPABASE_DB_PASSWORD=$(echo "$secret_content" | grep '^SUPABASE_DB_PASSWORD=' | cut -d= -f2-)
    SUPABASE_DB_REGION=$(echo "$secret_content" | grep '^SUPABASE_DB_REGION=' | cut -d= -f2-)

    if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
        log_error "SUPABASE_DB_PASSWORD not found in gcloud secret '$GCLOUD_SECRET_API'"
    fi
    if [[ -z "${SUPABASE_DB_REGION:-}" ]]; then
        log_error "SUPABASE_DB_REGION not found in gcloud secret '$GCLOUD_SECRET_API'. Add it with the AWS region (e.g. us-west-2)"
    fi

    log_success "DB credentials fetched"
}

# Load environment variables (only needs NEXT_PUBLIC_SUPABASE_URL from .env.client)
load_environment() {
    log_step "Loading environment"
    cd "$PROJECT_ROOT"

    if ! source "$SCRIPT_DIR/load-env.sh"; then
        log_error "Failed to load environment variables"
    fi

    if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
        log_error "NEXT_PUBLIC_SUPABASE_URL is not set"
    fi

    log_success "Environment loaded"

    # Fetch DB-specific credentials from gcloud (not stored locally)
    fetch_db_credentials
}

# Build the PostgreSQL connection string
# Uses Session Pooler (IPv4) via SUPABASE_DB_REGION for WSL2/IPv4-only networks.
# Password is passed via PGPASSWORD env var to avoid URI encoding issues with special chars.
build_connection_string() {
    local url="${NEXT_PUBLIC_SUPABASE_URL}"
    local project_ref
    project_ref=$(echo "$url" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')

    # Session Pooler: IPv4-accessible, works with pg_dump (session mode)
    echo "postgresql://postgres.${project_ref}@aws-0-${SUPABASE_DB_REGION}.pooler.supabase.com:5432/postgres"
}

# Resolve a PostgreSQL tool, preferring version 17 to match the Supabase server
resolve_pg_tool() {
    local tool="$1"
    if [[ -x "/usr/lib/postgresql/17/bin/$tool" ]]; then
        echo "/usr/lib/postgresql/17/bin/$tool"
    elif command -v "$tool" &>/dev/null; then
        echo "$tool"
    else
        log_error "$tool is not installed. Install postgresql-client-17: sudo apt-get install postgresql-client-17"
    fi
}

# Export subcommand
cmd_export() {
    local format="custom"   # custom = .dump, sql = .sql
    local pg_flags=()
    local ext="dump"

    # Parse flags
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --sql)          format="sql"; ext="sql" ;;
            --data-only)    pg_flags+=("--data-only") ;;
            --schema-only)  pg_flags+=("--schema-only") ;;
            *)              log_error "Unknown flag: $1" ;;
        esac
        shift
    done

    local pg_dump_bin
    pg_dump_bin=$(resolve_pg_tool pg_dump)

    load_environment

    local conn
    conn=$(build_connection_string)

    mkdir -p "$BACKUPS_DIR"

    local timestamp
    timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
    local filename="backup_${timestamp}.${ext}"
    local filepath="$BACKUPS_DIR/$filename"

    log_step "Exporting database"
    log_info "Format: $format"
    log_info "Output: $filepath"

    if [[ "$format" == "sql" ]]; then
        PGPASSWORD="${SUPABASE_DB_PASSWORD}" "$pg_dump_bin" \
            "${pg_flags[@]}" \
            --no-password \
            "$conn" \
            > "$filepath"
    else
        PGPASSWORD="${SUPABASE_DB_PASSWORD}" "$pg_dump_bin" \
            --format=custom \
            "${pg_flags[@]}" \
            --no-password \
            "$conn" \
            --file="$filepath"
    fi

    local size
    size=$(du -sh "$filepath" | cut -f1)
    log_success "Export complete: $filename ($size)"
}

# Import subcommand
cmd_import() {
    local filepath="${1:-}"

    if [[ -z "$filepath" ]]; then
        echo -e "${RED}Error:${NC} No backup file specified."
        echo "Usage: yarn db:import -- <file>"
        echo "       yarn db:backups   (to list available backups)"
        exit 1
    fi

    if [[ ! -f "$filepath" ]]; then
        log_error "File not found: $filepath"
    fi

    # Detect format
    local ext="${filepath##*.}"

    echo ""
    echo -e "${RED}${BOLD}⚠  WARNING: DESTRUCTIVE OPERATION ⚠${NC}"
    echo -e "${YELLOW}This will overwrite data in the production database.${NC}"
    echo -e "File: ${BOLD}$filepath${NC}"
    echo ""
    echo -n "Type YES to continue: "
    read -r confirmation

    if [[ "$confirmation" != "YES" ]]; then
        echo "Aborted."
        exit 0
    fi

    load_environment

    local conn
    conn=$(build_connection_string)

    log_step "Restoring database from $filepath"

    if [[ "$ext" == "dump" ]]; then
        local pg_restore_bin
        pg_restore_bin=$(resolve_pg_tool pg_restore)
        log_info "Format: custom (pg_restore)"
        PGPASSWORD="${SUPABASE_DB_PASSWORD}" "$pg_restore_bin" \
            --no-password \
            --clean \
            --if-exists \
            --no-owner \
            --no-privileges \
            --dbname="$conn" \
            "$filepath"
    else
        local psql_bin
        psql_bin=$(resolve_pg_tool psql)
        log_info "Format: SQL (psql)"
        PGPASSWORD="${SUPABASE_DB_PASSWORD}" "$psql_bin" \
            --no-password \
            "$conn" \
            < "$filepath"
    fi

    log_success "Restore complete"
}

# List subcommand
cmd_list() {
    mkdir -p "$BACKUPS_DIR"

    local files
    files=$(ls -lt "$BACKUPS_DIR"/*.{dump,sql} 2>/dev/null || true)

    if [[ -z "$files" ]]; then
        echo "No backups found in $BACKUPS_DIR"
        exit 0
    fi

    echo -e "${BOLD}Available backups in backups/:${NC}"
    echo ""
    ls -lht "$BACKUPS_DIR"/*.{dump,sql} 2>/dev/null | awk '{print $5, $6, $7, $8, $9}' | sed "s|$BACKUPS_DIR/||"
}

# Main
case "${1:-}" in
    export)     shift; cmd_export "$@" ;;
    import)     shift; cmd_import "$@" ;;
    list)       cmd_list ;;
    --help|-h)  usage ;;
    "")         usage ;;
    *)          echo -e "${RED}Unknown command: $1${NC}"; usage ;;
esac
