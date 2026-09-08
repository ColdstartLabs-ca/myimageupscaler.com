import { execFile } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { Pool, types } from 'pg';

const runFile = promisify(execFile);
const POSTGRES_IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.156';
const POSTGREST_IMAGE = 'postgrest/postgrest:v12.2.12';
const ASYNC_MIGRATION = '20260907000100_async_replicate_reservations.sql';

// The Postgres image predates GoTrue's JSON-claims compatibility migrations.
// These are the upstream Supabase Auth definitions with Namespace = auth:
// https://github.com/supabase/auth/blob/v2.192.0/migrations/20211124214934_update_auth_functions.up.sql
// https://github.com/supabase/auth/blob/v2.192.0/migrations/20211202183645_update_auth_uid.up.sql
// Without them, real get_user_data/RLS would see auth.uid() = NULL under PostgREST 12.
const AUTH_CLAIMS_SQL = `
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$
    SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true),
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
  $$;
  CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE SQL STABLE AS $$
    SELECT coalesce(current_setting('request.jwt.claim.role', true),
      current_setting('request.jwt.claims', true)::jsonb ->> 'role')::text
  $$;
  CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT LANGUAGE SQL STABLE AS $$
    SELECT coalesce(current_setting('request.jwt.claim.email', true),
      current_setting('request.jwt.claims', true)::jsonb ->> 'email')::text
  $$;
`;

interface IUserOptions {
  id?: string;
  tier?: 'free' | 'hobby' | 'pro' | 'business';
  subscriptionCredits?: number;
  purchasedCredits?: number;
}

export interface IAsyncUpscaleDatabase {
  pool: Pool;
  /** Bare PostgREST origin; a Supabase proxy strips /rest/v1 before forwarding. */
  restUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  /** Synthetic per-fixture secret, never a repository or production credential. */
  jwtSecret: string;
  jwtForUser(id: string): string;
  createUser(options?: IUserOptions): Promise<{ id: string; accessToken: string }>;
  close(): Promise<void>;
}

interface IMigrationSource {
  file: string;
  from?: string;
  before?: string;
}

// Exact committed SQL, including the currently deployed credit arithmetic and
// grants. Sections omit unrelated webhook/email migrations, never replace RPCs.
// The original SQL-language subscription reader requires its table first.
const BASELINE: Array<string | IMigrationSource> = [
  '20250120000000_create_profiles_table.sql',
  '20250120000200_create_subscriptions_table.sql',
  '20250120000100_create_rpc_functions.sql',
  '20250121000000_create_credit_transactions_table.sql',
  '20250121000100_create_processing_jobs_table.sql',
  '20250121000200_enhanced_credit_functions.sql',
  '20250121000400_fix_profiles_subscription_status.sql',
  '20250202000000_add_admin_role.sql',
  '20250203000000_fix_admin_policy_recursion.sql',
  '20250221000000_secure_credits.sql',
  '20251205000200_separate_credit_pools.sql',
  '20251205000300_update_credit_rpcs.sql',
  '20251209000000_get_user_data_rpc.sql',
  {
    file: '20251229000100_fix_credit_clawback.sql',
    from: 'CREATE OR REPLACE FUNCTION refund_credits_to_pool(',
    before: '-- Step 7: Create clawback_purchased_credits function',
  },
  {
    file: '20260115000000_security_fixes.sql',
    from: '-- Create batch_usage table to track hourly batch limits',
  },
  {
    file: '20260120000100_fix_function_search_paths.sql',
    from: '-- User data function',
    before: '-- Auth trigger function',
  },
  '20260214000100_fix_profile_role_immutability.sql',
  '20260226000100_add_anti_freeloader.sql',
  '20260317000100_ip_flagging_and_paywall.sql',
  '20260513153141_idempotent_processing_refunds.sql',
  '20260527155303_add_default_privileges_public_schema.sql',
  '20260718021253_free_tier_credit_grants.sql',
  '20260718175546_ten_credit_unique_free_grants.sql',
  '20260718175635_free_grant_incident_repair_rpc.sql',
  '20260718175933_qualify_free_grant_pgcrypto.sql',
  '20260718190000_restore_five_credit_grant_policy.sql',
  '20260718194900_restore_five_credit_grant_policy.sql',
  '20260718195105_fix_claim_grant_column_ambiguity.sql',
  '20260722193018_disable_shared_identity_reduction.sql',
  '20260726131000_provider_outage_quota_release.sql',
  '20260726132000_provider_health_circuit.sql',
  '20260726134000_processing_jobs_cost_attribution.sql',
  '20260801000002_processing_health_alert_policy.sql',
  '20260805182000_provider_circuit_half_open_recovery.sql',
  '20260805210000_harden_provider_circuit_grants.sql',
  '20260810000100_processing_jobs_failed_rows.sql',
  '20260826120000_upscale_input_storage_and_credit_reservations.sql',
  '20260826143000_durable_delivery_ack_reservations.sql',
];

async function docker(args: string[], timeout = 30_000): Promise<string> {
  const result = await runFile('docker', args, { timeout, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}

async function waitFor(label: string, check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(250);
  }
  throw new Error(`${label} did not become ready within 60 seconds`);
}

async function publishedPort(container: string, port: number): Promise<number> {
  const mapping = await docker(['port', container, `${port}/tcp`]);
  const match = /^127\.0\.0\.1:(\d+)$/m.exec(mapping);
  if (!match) throw new Error(`Missing loopback port for ${container}`);
  return Number(match[1]);
}

async function migrationSql(source: string | IMigrationSource): Promise<string> {
  const spec = typeof source === 'string' ? { file: source } : source;
  const sql = await readFile(resolve('supabase/migrations', spec.file), 'utf8');
  const start = spec.from ? sql.indexOf(spec.from) : 0;
  const end = spec.before ? sql.indexOf(spec.before, start) : sql.length;
  if (start < 0 || end < start) throw new Error(`Migration section moved: ${spec.file}`);
  return sql.slice(start, end);
}

/**
 * Starts two uniquely named disposable containers and a private Docker network.
 * Supabase's image supplies auth.users, roles and extensions; upstream Auth SQL
 * updates its old JWT helpers. Storage has metadata scaffolding only: the HTTP
 * fixture owns Auth responses and Storage transport, without a GoTrue server.
 * Email delivery and Stripe webhook schemas are outside this execution fixture.
 * Run from the repository root; no environment files or credentials are read.
 */
export async function startAsyncUpscaleDatabase(
  options: { omitUnusedLegacyRefunds?: boolean } = {}
): Promise<IAsyncUpscaleDatabase> {
  const suffix = randomUUID();
  const network = `miu-async-network-${suffix}`;
  const postgres = `miu-async-postgres-${suffix}`;
  const postgrest = `miu-async-postgrest-${suffix}`;
  const password = randomBytes(24).toString('hex');
  const jwtSecret = randomBytes(32).toString('hex');
  let pool: Pool | undefined;
  let networkCreated = false;
  let postgresCreated = false;
  let postgrestCreated = false;
  let closing: Promise<void> | undefined;

  const close = (): Promise<void> => {
    closing ??= (async () => {
      const cleanup = await Promise.allSettled([
        pool?.end(),
        postgrestCreated ? docker(['rm', '-f', '-v', postgrest]) : Promise.resolve(),
        postgresCreated ? docker(['rm', '-f', '-v', postgres]) : Promise.resolve(),
      ]);
      const networkCleanup = await Promise.allSettled([
        networkCreated ? docker(['network', 'rm', network]) : Promise.resolve(),
      ]);
      if ([...cleanup, ...networkCleanup].some(result => result.status === 'rejected')) {
        throw new Error(`Disposable database cleanup failed (${suffix})`);
      }
    })();
    return closing;
  };

  const jwt = (role: 'anon' | 'authenticated' | 'service_role', id?: string): string => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        role,
        iss: 'supabase',
        iat: issuedAt,
        exp: issuedAt + 24 * 60 * 60,
        ...(id && {
          sub: id,
          aud: 'authenticated',
          email: `fixture-${id}@example.test`,
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
        }),
      })
    ).toString('base64url');
    const input = `${header}.${payload}`;
    return `${input}.${createHmac('sha256', jwtSecret).update(input).digest('base64url')}`;
  };
  const anonKey = jwt('anon');
  const serviceRoleKey = jwt('service_role');
  const jwtForUser = (id: string): string => jwt('authenticated', id);

  try {
    await docker(['network', 'create', network]);
    networkCreated = true;
    await docker(
      [
        'run',
        '-d',
        '--name',
        postgres,
        '--network',
        network,
        '--tmpfs',
        '/var/lib/postgresql/data:rw',
        '-e',
        `POSTGRES_PASSWORD=${password}`,
        '-p',
        '127.0.0.1::5432',
        POSTGRES_IMAGE,
      ],
      60_000
    );
    postgresCreated = true;
    // The image first runs a Unix-socket bootstrap server. TCP readiness marks
    // the final server, after the actual Supabase schemas/roles were installed.
    await waitFor('Disposable PostgreSQL', async () => {
      try {
        await docker(
          ['exec', postgres, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin'],
          5000
        );
        return true;
      } catch {
        return false;
      }
    });
    await docker([
      'exec',
      postgres,
      'psql',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `ALTER USER supabase_admin WITH LOGIN PASSWORD '${password}'; ALTER USER authenticator WITH LOGIN PASSWORD '${password}';`,
    ]);
    const port = await publishedPort(postgres, 5432);
    pool = new Pool({
      connectionString: `postgresql://supabase_admin:${password}@127.0.0.1:${port}/postgres`,
      max: 20,
      connectionTimeoutMillis: 5000,
      statement_timeout: 20_000,
      // Preserve the exact expiry used by the existing EOF acknowledgement,
      // matching PostgREST strings rather than losing microseconds in JS Date.
      types: {
        getTypeParser: (oid, format) =>
          oid === 1184 && format !== 'binary'
            ? (value: string) => value
            : types.getTypeParser(oid, format),
      },
    });
    const databasePool = pool;
    const setup = await databasePool.connect();
    try {
      await setup.query(AUTH_CLAIMS_SQL);
      await setup.query(`
        CREATE SCHEMA IF NOT EXISTS storage;
        CREATE TABLE IF NOT EXISTS storage.buckets (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, public BOOLEAN NOT NULL DEFAULT false,
          file_size_limit BIGINT, allowed_mime_types TEXT[]
        );
        GRANT USAGE ON SCHEMA storage TO postgres;
        GRANT ALL ON TABLE storage.buckets TO postgres;
        SET ROLE postgres;
        SET search_path = public, extensions;
      `);
      for (const source of BASELINE) await setup.query(await migrationSql(source));
      if (options.omitUnusedLegacyRefunds) {
        // Production retired these unused entrypoints; their absence must not
        // prevent installation of the required async reservation functions.
        await setup.query(
          'DROP FUNCTION public.refund_credits_v2(UUID, INTEGER, TEXT, TEXT, TEXT)'
        );
        await setup.query(
          'DROP FUNCTION public.refund_credits_to_pool(UUID, INTEGER, TEXT, TEXT, TEXT)'
        );
      }
      await setup.query('BEGIN');
      try {
        await setup.query(await migrationSql(ASYNC_MIGRATION));
        await setup.query(await migrationSql('20260907000200_async_upscale_delivery_leases.sql'));
        await setup.query(await migrationSql('20260907000300_async_upscale_active_jobs.sql'));
        await setup.query(
          await migrationSql('20260908202311_provider_billing_circuit_recovery.sql')
        );
        await setup.query(await migrationSql('20260908202604_async_upscale_single_recovery.sql'));
        await setup.query('COMMIT');
      } catch (error) {
        await setup.query('ROLLBACK');
        throw error;
      }
    } finally {
      try {
        await setup.query('RESET ROLE; RESET search_path');
      } finally {
        setup.release();
      }
    }

    await docker(
      [
        'run',
        '-d',
        '--name',
        postgrest,
        '--network',
        network,
        '-p',
        '127.0.0.1::3000',
        '-e',
        `PGRST_DB_URI=postgresql://authenticator:${password}@${postgres}:5432/postgres`,
        '-e',
        'PGRST_DB_SCHEMAS=public',
        '-e',
        'PGRST_DB_ANON_ROLE=anon',
        '-e',
        'PGRST_DB_CONFIG=false',
        '-e',
        'PGRST_DB_POOL=20',
        '-e',
        `PGRST_JWT_SECRET=${jwtSecret}`,
        POSTGREST_IMAGE,
      ],
      60_000
    );
    postgrestCreated = true;
    const restUrl = `http://127.0.0.1:${await publishedPort(postgrest, 3000)}`;
    await waitFor('Disposable PostgREST', async () => {
      try {
        const response = await fetch(`${restUrl}/rpc/read_async_upscale_job`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_user_id: randomUUID(), p_job_id: randomUUID() }),
          signal: AbortSignal.timeout(2000),
        });
        return response.ok && (await response.json()).outcome === 'not_found';
      } catch {
        return false;
      }
    });

    return {
      pool: databasePool,
      restUrl,
      anonKey,
      serviceRoleKey,
      jwtSecret,
      jwtForUser,
      async createUser(options = {}) {
        const id = options.id ?? randomUUID();
        const tier = options.tier ?? 'free';
        const isPaid = tier !== 'free';
        const subscriptionCredits = options.subscriptionCredits ?? (isPaid ? 100 : 5);
        const purchasedCredits = options.purchasedCredits ?? 0;
        const client = await databasePool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `
            INSERT INTO auth.users (id, aud, role, email,
              raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            VALUES ($1, 'authenticated', 'authenticated', $2,
              '{"provider":"email","providers":["email"]}', '{}', now(), now())
          `,
            [id, `fixture-${id}@example.test`]
          );
          await client.query("SELECT set_config('app.trusted_credit_operation', 'true', true)");
          await client.query(
            `
            UPDATE public.profiles SET subscription_credits_balance = $2,
              purchased_credits_balance = $3, subscription_status = $4,
              subscription_tier = $5, stripe_customer_id = $6,
              region_tier = 'standard', signup_country = 'US', is_flagged_freeloader = false
            WHERE id = $1
          `,
            [
              id,
              subscriptionCredits,
              purchasedCredits,
              isPaid ? 'active' : null,
              isPaid ? tier : null,
              isPaid ? `cus_async_${id}` : null,
            ]
          );
          // Fixture seeding records a terminal setup decision without minting
          // an extra welcome grant beyond the explicit balances requested above.
          await client.query(
            `
            INSERT INTO public.free_credit_grants (user_id, identity_hash, network_hash, granted_credits)
            VALUES ($1::uuid, encode(sha256(convert_to($1::uuid::text, 'UTF8')), 'hex'),
              encode(sha256(convert_to($1::uuid::text, 'UTF8')), 'hex'), 0)
          `,
            [id]
          );
          if (isPaid) {
            await client.query(
              `
              INSERT INTO public.subscriptions (id, user_id, status, price_id,
                current_period_start, current_period_end, cancel_at_period_end)
              VALUES ($1, $2, 'active', $3, now(), now() + interval '30 days', false)
            `,
              [`sub_async_${id}`, id, `price_async_${tier}`]
            );
          }
          await client.query('COMMIT');
          return { id, accessToken: jwtForUser(id) };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Disposable database startup and cleanup failed'
      );
    }
    throw error;
  }
}
