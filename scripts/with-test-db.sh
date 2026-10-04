#!/bin/bash
# Runs a command with the disposable local test database up, and always tears it down.
# Usage: scripts/with-test-db.sh '<shell command>'
# If another run owns the database (exit 3) it is left untouched and this run fails.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DB_OWNER_PID=$$ "$ROOT/scripts/test-db.sh" up
status=$?
[ "$status" -eq 0 ] || exit 1
trap 'exit 130' INT TERM
trap '"$ROOT/scripts/test-db.sh" down' EXIT
bash -c "$1"
