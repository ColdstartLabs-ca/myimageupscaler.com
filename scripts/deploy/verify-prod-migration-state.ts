/**
 * Read-only production schema readiness harness.
 *
 * Answers one question: "is production's schema state consistent with this
 * repo, and are the security-sensitive objects locked down?"
 *
 * Run it BEFORE a deploy (does the migration state let `supabase db push`
 * through?) and AFTER a deploy (did anything drift?).
 *
 * Every check is read-only. The single check that writes runs inside a
 * transaction that is always rolled back.
 *
 * Credentials come from the environment, same shape the deploy pipeline and
 * db-backup.sh already use. Run via `yarn verify:prod:schema`, which fetches
 * them from GCloud Secret Manager first.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { serverEnv } from '@shared/config/env';

interface ICheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');

/**
 * SECURITY DEFINER RPCs must never be executable by anon/authenticated.
 * `REVOKE ALL ... FROM PUBLIC` does NOT strip the role-specific EXECUTE grants
 * Supabase's default privileges hand out, so each function needs explicit
 * per-role revokes. See 20260802000000_harden_provider_health_alert_grants.sql.
 */
const SERVICE_ROLE_ONLY_RPC_PREFIXES = ['claim_provider_health_alert'];

/** Tables that must be service-role only (RLS on, no anon/authenticated policy). */
const SERVICE_ROLE_ONLY_TABLES = ['billing_analytics_events', 'billing_payment_failures'];

function localMigrationVersions(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .map(file => file.split('_')[0])
    .sort();
}

function connectionString(): string {
  // Shell-provided deploy secrets; they are not part of the app env schema.
  const password = process.env.SUPABASE_DB_PASSWORD;
  const region = process.env.SUPABASE_DB_REGION;
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;

  if (!password || !region) {
    throw new Error(
      'SUPABASE_DB_PASSWORD and SUPABASE_DB_REGION are required. Run via `yarn verify:prod:schema`.'
    );
  }

  const projectRef = url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];
  if (!projectRef)
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a Supabase project URL: ${url}`);

  const encoded = encodeURIComponent(password);
  return `postgresql://postgres.${projectRef}:${encoded}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
}

/**
 * Migration parity is the actual deploy gate: the deploy script runs
 * `supabase db push --dry-run` and hard-fails on any mismatch. A pending
 * migration that sorts BEFORE the newest applied one blocks the push outright.
 */
async function checkMigrationParity(client: Client): Promise<ICheckResult> {
  const local = localMigrationVersions();
  const { rows } = await client.query<{ version: string }>(
    'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
  );
  const remote = rows.map(row => row.version);
  const remoteSet = new Set(remote);
  const localSet = new Set(local);

  const pending = local.filter(version => !remoteSet.has(version));
  const remoteOnly = remote.filter(version => !localSet.has(version));
  const newestRemote = remote[remote.length - 1] ?? '';
  const outOfOrder = pending.filter(version => version < newestRemote);

  const ok = pending.length === 0 && remoteOnly.length === 0;
  return {
    name: 'migration parity (repo vs production)',
    ok,
    detail: ok
      ? `${local.length} local = ${remote.length} applied, nothing pending`
      : [
          pending.length ? `pending: ${pending.join(', ')}` : '',
          remoteOnly.length ? `applied but absent from repo: ${remoteOnly.join(', ')}` : '',
          outOfOrder.length
            ? `WILL BLOCK db push (sorts before ${newestRemote}): ${outOfOrder.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' | '),
  };
}

async function checkTables(client: Client): Promise<ICheckResult[]> {
  const { rows } = await client.query<{ relname: string; rls: boolean; policies: string }>(
    `SELECT c.relname,
            c.relrowsecurity AS rls,
            (SELECT count(*) FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
    [SERVICE_ROLE_ONLY_TABLES]
  );

  return SERVICE_ROLE_ONLY_TABLES.map(table => {
    const row = rows.find(candidate => candidate.relname === table);
    if (!row) return { name: `table ${table}`, ok: false, detail: 'MISSING from production' };
    const ok = row.rls && Number(row.policies) > 0;
    return {
      name: `table ${table}`,
      ok,
      detail: ok
        ? `exists, RLS enabled, ${row.policies} policy(ies)`
        : `RLS=${row.rls}, policies=${row.policies}`,
    };
  });
}

async function checkRpcGrants(client: Client): Promise<ICheckResult[]> {
  const { rows } = await client.query<{ proname: string; acl: string | null }>(
    `SELECT p.proname, pg_catalog.array_to_string(p.proacl, ',') AS acl
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef
        AND p.proname LIKE ANY($1)
      ORDER BY p.proname`,
    [SERVICE_ROLE_ONLY_RPC_PREFIXES.map(prefix => `${prefix}%`)]
  );

  if (rows.length === 0) {
    return [{ name: 'security definer RPC grants', ok: false, detail: 'no matching functions' }];
  }

  return rows.map(row => {
    const acl = row.acl ?? '';
    const exposed = ['anon', 'authenticated'].filter(role => acl.includes(`${role}=`));
    return {
      name: `rpc ${row.proname}`,
      ok: exposed.length === 0,
      detail: exposed.length
        ? `CALLABLE BY ${exposed.join(' + ')} — needs explicit REVOKE per role`
        : 'service_role only',
    };
  });
}

/**
 * The billing dedupe is what stops one Stripe charge being counted twice:
 * checkout.session.completed and invoice.payment_succeeded both observe the
 * initial subscription charge and both claim the same key. Proven by claiming
 * the same key twice inside a transaction that is always rolled back.
 */
async function checkDedupeConstraint(client: Client): Promise<ICheckResult> {
  const key = '__harness_dedupe_probe__';
  const insert = `INSERT INTO public.billing_analytics_events
      (event_key, event_name, source_object_id, lifecycle_action)
    VALUES ($1, 'revenue_received', $1, 'purchase_initial')`;

  await client.query('BEGIN');
  try {
    await client.query(insert, [key]);
    try {
      await client.query(insert, [key]);
      return {
        name: 'billing dedupe constraint',
        ok: false,
        detail: 'DUPLICATE ACCEPTED — one charge could be counted twice',
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      return {
        name: 'billing dedupe constraint',
        ok: code === '23505',
        detail:
          code === '23505'
            ? 'duplicate claim rejected with 23505 (rolled back)'
            : `unexpected error code ${code}`,
      };
    }
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const client = new Client({ connectionString: connectionString() });
  await client.connect();

  const checks: ICheckResult[] = [];
  try {
    checks.push(await checkMigrationParity(client));
    checks.push(...(await checkTables(client)));
    checks.push(...(await checkRpcGrants(client)));
    checks.push(await checkDedupeConstraint(client));
  } finally {
    await client.end();
  }

  const failed = checks.filter(check => !check.ok);

  if (asJson) {
    console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
  } else {
    console.log('\nProduction schema state\n');
    for (const check of checks) {
      console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name}`);
      console.log(`        ${check.detail}`);
    }
    console.log(
      failed.length === 0
        ? '\nAll checks passed. Production schema matches the repo.\n'
        : `\n${failed.length} check(s) FAILED.\n`
    );
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('Harness failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
