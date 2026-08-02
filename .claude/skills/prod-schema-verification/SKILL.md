---
name: prod-schema-verification
description: Verify production database schema state before and after a deploy — migration parity, RLS, SECURITY DEFINER grant surface, and dedupe constraints. Use when applying migrations to production, checking deploy readiness, or auditing whether prod schema matches the repo.
---

# Production Schema Verification

## Quick use

```bash
yarn verify:prod:schema          # human-readable
yarn verify:prod:schema --json   # machine-readable, exit 1 on any failure
```

Read-only. The one check that writes runs inside a transaction that is always rolled back.
Run it **before** a deploy (will `db push` succeed?) and **after** (did anything drift?).

Implementation: `scripts/deploy/verify-prod-schema.sh` (fetches GCloud secrets) →
`scripts/deploy/verify-prod-migration-state.ts` (the checks).

## Why each check exists

### 1. Migration parity — the actual deploy gate

`scripts/deploy/deploy.sh` runs `supabase db push --dry-run` and **hard-fails the deploy**
on any mismatch. Two failure shapes:

- **Pending migration** — a repo file not in `supabase_migrations.schema_migrations`.
- **Out-of-order pending** — a pending migration whose version sorts _before_ the newest
  applied one. This is the nasty one: it blocks `db push` outright.

You create the out-of-order case by hand-applying a _later_ migration while deliberately
holding back an _earlier_ one. If you hold a migration back, either remove it from
`supabase/migrations/` or accept that the next deploy applies it automatically —
`db push --yes` applies **everything** pending.

### 2. `mcp__supabase__apply_migration` records a generated version, not your filename

This is the trap. Applying `20260801000000_foo.sql` via MCP records version
`20260802072950` (the wall-clock time), not `20260801000000`. The repo file then looks
_pending_ forever, and the version ordering can block `db push`.

**After any MCP `apply_migration`, reconcile the ledger:**

```sql
UPDATE supabase_migrations.schema_migrations
SET version = '<version from the filename>'
WHERE name = '<migration name>' AND version <> '<version from the filename>';
```

Then re-run `yarn verify:prod:schema` and confirm parity.

### 3. SECURITY DEFINER grant surface

`REVOKE ALL ON FUNCTION ... FROM PUBLIC` does **not** remove the role-specific EXECUTE
grants Supabase's default privileges hand to `anon` and `authenticated`. A function with
only the PUBLIC revoke stays callable by anyone holding the publishable anon key.

Verified in production: `claim_provider_health_alert` had
`proacl = anon=X/postgres, authenticated=X/postgres` despite its `FROM PUBLIC` revoke.

**Every SECURITY DEFINER RPC needs all three revokes:**

```sql
REVOKE ALL ON FUNCTION public.fn(<arg types>) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn(<arg types>) FROM anon;
REVOKE ALL ON FUNCTION public.fn(<arg types>) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn(<arg types>) TO service_role;
```

Reference implementations: `20260722193411_create_shared_identity_repair_rpc.sql`,
`20260802000000_harden_provider_health_alert_grants.sql`.

Check any function directly:

```sql
SELECT proname, prosecdef, array_to_string(proacl, E'\n')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname = '<name>';
```

### 4. RLS + dedupe constraints

New tables must have RLS enabled _and_ at least one policy — RLS with zero policies
denies everything, which fails closed but silently breaks writes.

The billing dedupe unique constraint is what stops one Stripe charge being counted twice
(`checkout.session.completed` and `invoice.payment_succeeded` both observe the initial
subscription charge). The harness proves it by claiming the same key twice and asserting
a `23505`.

## Testing production safely

Wrap any probe that mutates in an explicit transaction and roll it back:

```sql
BEGIN;
SELECT * FROM public.some_rpc('probe', ...);
ROLLBACK;
```

This exercises the real function body — including its writes — with nothing persisted.
Confirm afterward with a `count(*)` that no rows survived.

**Before any production schema change**, per `CLAUDE.md`: run `yarn db:backup`, confirm
with `yarn db:backups` and `gzip -t`, and record the archive paths.

## Extending the harness

Add table names to `SERVICE_ROLE_ONLY_TABLES` or function prefixes to
`SERVICE_ROLE_ONLY_RPC_PREFIXES` in `scripts/deploy/verify-prod-migration-state.ts`.
Each check returns `{name, ok, detail}`; any `ok: false` exits 1.
