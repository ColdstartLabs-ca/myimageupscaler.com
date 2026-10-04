#!/bin/bash
# Disposable local Supabase for tests: `up` | `down` | `status`.
#
# The database is built from a SCHEMA-ONLY copy of production (no data, no credentials, no
# network to prod): $TEST_DB_SCHEMA, else the newest backups/*.schema.sql.gz. deploy.sh passes
# a fresh post-migration dump so the tests always see the schema this deploy ships.
# tests/helpers/test-database.ts recognises exactly this stack (container + port + demo keys),
# so the harness guard accepts it while still refusing every other real-database target.
#
# `up` takes an atomic lock and cleans up after itself on failure or Ctrl-C; exit 3 means
# another run owns the stack (it is never touched). `down` removes the containers, volumes,
# network and temp files, so nothing is left behind.

set -euo pipefail

PROJECT_ID="miu-test"
API_PORT=55421
# Pinned to the CLI version this was verified with: `-x` service names and config keys move.
SUPABASE_CLI="supabase@2.119.0"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
EXIT_BUSY=3
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="${TMPDIR:-/tmp}/${PROJECT_ID}.lock"
WORKDIR="$LOCK/work"

cmd="${1:-status}"

owned_containers() { docker ps -aq --filter "name=^supabase_.*_${PROJECT_ID}\$"; }

teardown() {
  if [ -d "$WORKDIR/supabase" ]; then
    (cd "$WORKDIR" && npx --yes "$SUPABASE_CLI" stop --no-backup --project-id "$PROJECT_ID") >/dev/null 2>&1 || true
  fi
  # Anything the CLI missed (it stops on the first error): remove by exact project id.
  local ids; ids="$(owned_containers)"
  if [ -n "$ids" ]; then docker rm -f -v $ids >/dev/null 2>&1 || true; fi
  docker volume ls -q --filter "name=^supabase_.*_${PROJECT_ID}\$" | xargs -r docker volume rm -f >/dev/null 2>&1 || true
  docker network rm "supabase_network_${PROJECT_ID}" >/dev/null 2>&1 || true
  rm -rf "$LOCK"
}

# mkdir is atomic: exactly one run wins. A lock whose owner pid is dead (crashed run) is
# reclaimed; a lock without an owner pid (manual `yarn test:db:up`) lives until `down`.
acquire_lock() {
  if mkdir -m 700 "$LOCK" 2>/dev/null; then
    echo "${TEST_DB_OWNER_PID:-0}" > "$LOCK/pid"
    return 0
  fi
  local pid; pid="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -z "$pid" ]; then sleep 2; pid="$(cat "$LOCK/pid" 2>/dev/null || true)"; fi
  if [ -n "$pid" ] && [ "$pid" != "0" ] && ! kill -0 "$pid" 2>/dev/null; then
    echo "test-db: reclaiming stale stack from dead run $pid" >&2
    teardown
    mkdir -m 700 "$LOCK" 2>/dev/null && echo "${TEST_DB_OWNER_PID:-0}" > "$LOCK/pid" && return 0
  fi
  return 1
}

case "$cmd" in
  up)
    command -v docker >/dev/null || { echo "test-db: docker is required" >&2; exit 1; }
    schema="${TEST_DB_SCHEMA:-$(ls "$ROOT"/backups/*.schema.sql.gz 2>/dev/null | sort | tail -1 || true)}"
    if [ -z "$schema" ] || [ ! -f "$schema" ]; then
      echo "test-db: no schema found. Run \`yarn db:backup\` or set TEST_DB_SCHEMA=<file.schema.sql[.gz]>" >&2
      exit 1
    fi
    if ! acquire_lock; then
      echo "test-db: ${PROJECT_ID} is owned by another run. Wait for it, or \`yarn test:db:down\` if it is stale." >&2
      exit "$EXIT_BUSY"
    fi
    # From here on this run owns the stack and must remove it if it does not finish starting.
    abort() { echo "test-db: startup failed or interrupted, cleaning up" >&2; teardown; exit 1; }
    trap abort ERR INT TERM
    mkdir -p "$WORKDIR/supabase/migrations"
    cp "$ROOT/tests/test-db/config.toml" "$WORKDIR/supabase/config.toml"
    echo "test-db: starting disposable Supabase (${PROJECT_ID}) on 127.0.0.1:${API_PORT}"
    (cd "$WORKDIR" && npx --yes "$SUPABASE_CLI" start -x studio,imgproxy,vector,logflare,edge-runtime,mailpit,postgres-meta,realtime) >/dev/null
    echo "test-db: loading schema from $(basename "$schema")"
    case "$schema" in *.gz) reader=(gunzip -c) ;; *) reader=(cat) ;; esac
    psql_db() { docker exec -i "$DB_CONTAINER" psql -q -U postgres -d postgres -v ON_ERROR_STOP=1 >/dev/null; }
    "${reader[@]}" "$schema" | psql_db
    # Bucket rows are data, not schema, so a schema-only copy lacks them: replay the exact
    # INSERT statements from the migrations that create them.
    for migration in $(grep -l "INSERT INTO storage.buckets" "$ROOT"/supabase/migrations/*.sql); do
      awk '/INSERT INTO storage.buckets/ {on=1} on {print} on && /;[[:space:]]*(--.*)?$/ {on=0}' "$migration" | psql_db
    done
    # Pricing arms: the exact seed INSERTs from the migration that creates them.
    sed -n '/^INSERT INTO pricing_bandit_arms/,/^ON CONFLICT/p' \
      "$ROOT/supabase/migrations/20260409003620_pricing_bandit_arms.sql" | psql_db
    psql_db < "$ROOT/tests/test-db/seed.sql"
    trap - ERR INT TERM
    echo "test-db: ready"
    ;;
  down)
    teardown
    echo "test-db: removed"
    ;;
  status)
    if [ -n "$(owned_containers)" ]; then echo "running"; else echo "stopped"; fi
    ;;
  *)
    echo "usage: $0 up|down|status" >&2
    exit 2
    ;;
esac
