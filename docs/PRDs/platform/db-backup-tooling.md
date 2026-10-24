# PRD: Database Backup & Restore Tooling

**Complexity: 3 → LOW mode**

## 1. Context

**Problem:** No CLI commands exist to backup, export, or restore the production Supabase database. Developers must manually use the Supabase Dashboard or construct `pg_dump` commands by hand.

**Files Analyzed:**

- `scripts/load-env.sh` — env loading
- `scripts/setup/common.sh` — shared script utilities
- `app/api/migrate-blog/route.ts` — shows connection string construction pattern
- `.env.api.example` — available env vars
- `package.json` — existing scripts

**Current Behavior:**

- No `db:backup`, `db:export`, or `db:import` scripts exist
- Only DB script is `setup:db` (runs migrations)
- Connection string pattern exists in `migrate-blog/route.ts`: `postgresql://postgres.{projectRef}:{serviceRoleKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
- There is only one Supabase project (production) — no separate dev database

## 2. Solution

**Approach:**

- Create a single `scripts/db-backup.sh` script that handles both export and import
- Use `pg_dump` / `pg_restore` (standard PostgreSQL tools) against the Supabase direct connection
- Reuse `load-env.sh` for env loading (always loads `.env.api`)
- Construct the PostgreSQL connection string from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (same pattern as `migrate-blog/route.ts`)
- Store backups in `backups/` directory (gitignored)
- Add `yarn db:backup`, `yarn db:export`, `yarn db:import` scripts to package.json

**Key Decisions:**

- Use Supabase's **direct connection** (port 5432), not the transaction pooler (port 6543), because `pg_dump` needs a direct connection
- Export as **custom format** (`.dump`) by default for `pg_restore` compatibility, with `--sql` flag for plain SQL
- Filename convention: `backup_YYYY-MM-DD_HH-MM-SS.dump` (or `.sql`)
- Always loads from `.env.api` — single production database, no dev/prod split
- `--data-only` flag to skip schema (since schema is managed by migrations)
- `--schema-only` flag to export only schema
- Import requires explicit confirmation to prevent accidents

**Data Changes:** None — this is developer tooling only.

## 3. Execution Phases

### Phase 1: Backup Script + Package.json Integration

**Files (3):**

- `scripts/db-backup.sh` — new backup/restore script
- `.gitignore` — add `backups/` directory
- `package.json` — add `db:backup`, `db:export`, `db:import` scripts

**Implementation:**

- [ ] Create `scripts/db-backup.sh` with subcommands:
  - `export` — runs `pg_dump` to create a backup file
  - `import <file>` — runs `pg_restore` / `psql` to restore from a backup file
  - `list` — lists available backups in `backups/` directory
- [ ] Script must:
  - Source `scripts/load-env.sh` (loads `.env.client` + `.env.api`)
  - Extract project ref from `NEXT_PUBLIC_SUPABASE_URL`
  - Build connection string: `postgresql://postgres.{ref}:{SUPABASE_SERVICE_ROLE_KEY}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
  - Check `pg_dump` / `psql` are installed
  - Create `backups/` dir if it doesn't exist
  - Default export format: custom (`.dump`), `--sql` for plain SQL
  - Support `--data-only` and `--schema-only` flags
  - Import requires interactive confirmation ("This will overwrite data. Type YES to continue")
  - Import detects file format (`.dump` → `pg_restore`, `.sql` → `psql`)
- [ ] Add `backups/` to `.gitignore`
- [ ] Add package.json scripts:
  ```json
  "db:backup": "chmod +x ./scripts/db-backup.sh && ./scripts/db-backup.sh export",
  "db:export": "chmod +x ./scripts/db-backup.sh && ./scripts/db-backup.sh export",
  "db:import": "chmod +x ./scripts/db-backup.sh && ./scripts/db-backup.sh import",
  "db:backups": "chmod +x ./scripts/db-backup.sh && ./scripts/db-backup.sh list"
  ```

**Usage Examples:**

```bash
# Export database
yarn db:backup

# Export as plain SQL
yarn db:export -- --sql

# Export data only (no schema)
yarn db:export -- --data-only

# List available backups
yarn db:backups

# Restore from a backup
yarn db:import -- backups/backup_2026-03-31_14-30-00.dump
```

**Tests Required:**
| Test | Assertion |
|------|-----------|
| `./scripts/db-backup.sh --help` | Shows usage info, exits 0 |
| `./scripts/db-backup.sh export` (with valid env) | Creates file in `backups/`, exits 0 |
| `./scripts/db-backup.sh list` | Lists files, exits 0 |
| `./scripts/db-backup.sh import` (no file arg) | Shows error, exits 1 |

**Verification:**

```bash
# Test export
yarn db:backup
# Expected: Creates backups/backup_YYYY-MM-DD_HH-MM-SS.dump

# Test list
yarn db:backups
# Expected: Shows the backup file just created

# Test help
./scripts/db-backup.sh --help
# Expected: Shows usage
```

## 4. Acceptance Criteria

- [ ] `yarn db:backup` exports database to `backups/`
- [ ] `yarn db:import -- <file>` restores a backup with confirmation prompt
- [ ] `yarn db:backups` lists available backup files
- [ ] `--sql` flag produces plain SQL output
- [ ] `--data-only` and `--schema-only` flags work
- [ ] Import detects `.dump` vs `.sql` format automatically
- [ ] `backups/` directory is gitignored
- [ ] Script reuses existing `load-env.sh` infrastructure
- [ ] Script validates `pg_dump`/`psql` are installed before running
- [ ] `yarn verify` passes
