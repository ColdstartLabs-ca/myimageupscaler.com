import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const MIGRATION_UNDER_TEST = 'supabase/migrations/20260907204138_durable_upscale_execution.sql';
const BASELINE_MIGRATIONS = [
  'supabase/migrations/20250121000000_create_credit_transactions_table.sql',
  'supabase/migrations/20250121000100_create_processing_jobs_table.sql',
  'supabase/migrations/20260513153141_idempotent_processing_refunds.sql',
  'supabase/migrations/20260726131000_provider_outage_quota_release.sql',
  'supabase/migrations/20260726134000_processing_jobs_cost_attribution.sql',
  'supabase/migrations/20260810000100_processing_jobs_failed_rows.sql',
  'supabase/migrations/20260826120000_upscale_input_storage_and_credit_reservations.sql',
  'supabase/migrations/20260826143000_durable_delivery_ack_reservations.sql',
];
// The batch quota table and its atomic RPCs live inside a larger security
// migration; only that section is required for the durable admission path.
const BATCH_QUOTA_SECTION = {
  file: 'supabase/migrations/20260115000000_security_fixes.sql',
  from: 266,
  to: 420,
};

const PRELUDE = `
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, public BOOLEAN NOT NULL DEFAULT FALSE,
  file_size_limit BIGINT, allowed_mime_types TEXT[]
);
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  subscription_credits_balance INTEGER NOT NULL DEFAULT 0,
  purchased_credits_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$fn$;
`;

export interface IUpscalePostgres {
  db: Client;
  connectionString: string;
  connect(): Promise<Client>;
  stop(): Promise<void>;
}

/** Fresh local PostgreSQL with the production credit/batch migrations. No remote credentials. */
export async function startUpscalePostgres(
  options: { executorReady?: boolean } = {}
): Promise<IUpscalePostgres> {
  const containerName = `miu-upscale-test-${randomUUID()}`;
  const clients = new Set<Client>();
  const stop = async (): Promise<void> => {
    await Promise.allSettled([...clients].map(client => client.end()));
    spawnSync('docker', ['rm', '-f', '-v', containerName], { stdio: 'ignore', timeout: 30_000 });
  };
  try {
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        containerName,
        '--tmpfs',
        '/var/lib/postgresql/data:rw',
        '-e',
        'POSTGRES_PASSWORD=test',
        '-p',
        '127.0.0.1::5432',
        'public.ecr.aws/supabase/postgres:17.6.1.156',
      ],
      { stdio: 'pipe', timeout: 60_000 }
    );
    const mapping = execFileSync('docker', ['port', containerName, '5432/tcp'], {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
    const port = mapping.split('\n')[0].split(':').at(-1);
    const connectionString = `postgresql://supabase_admin:test@127.0.0.1:${port}/postgres`;
    let ready = false;
    // Supabase bootstraps on a Unix-only server; only TCP readiness identifies
    // the final server, after bootstrap has finished assigning role passwords.
    for (let i = 0; i < 120; i += 1) {
      const probe = spawnSync(
        'docker',
        ['exec', containerName, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin'],
        { stdio: 'ignore', timeout: 5_000 }
      );
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) {
      const logs = spawnSync('docker', ['logs', '--tail', '25', containerName], {
        encoding: 'utf8',
      });
      throw new Error(`Isolated PostgreSQL did not start: ${logs.stderr ?? logs.stdout}`);
    }
    execFileSync(
      'docker',
      [
        'exec',
        containerName,
        'psql',
        '-U',
        'supabase_admin',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        "ALTER USER supabase_admin WITH LOGIN PASSWORD 'test'",
      ],
      { stdio: 'pipe', timeout: 10_000 }
    );
    const connect = async (): Promise<Client> => {
      const client = new Client({
        connectionString,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 20_000,
      });
      await client.connect();
      clients.add(client);
      return client;
    };
    const db = await connect();
    await db.query(PRELUDE);
    const section = readFileSync(BATCH_QUOTA_SECTION.file, 'utf8')
      .split('\n')
      .slice(BATCH_QUOTA_SECTION.from - 1, BATCH_QUOTA_SECTION.to)
      .join('\n');
    await db.query(section);
    for (const file of BASELINE_MIGRATIONS) await db.query(readFileSync(file, 'utf8'));
    // DDL is transactional too: a failure cannot leave a half-applied ledger.
    await db.query('BEGIN');
    try {
      await db.query(readFileSync(MIGRATION_UNDER_TEST, 'utf8'));
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    if (options.executorReady === true) {
      await db.query('SELECT public.record_upscale_executor_health($1,true)', [
        `sha256:${'1'.repeat(64)}`,
      ]);
    }
    return { db, connectionString, connect, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function createUpscaleUser(
  db: Client,
  subscription = 10,
  purchased = 0
): Promise<string> {
  const id = randomUUID();
  await db.query('INSERT INTO auth.users (id) VALUES ($1)', [id]);
  await db.query(
    `INSERT INTO public.profiles (id, subscription_credits_balance, purchased_credits_balance)
    VALUES ($1, $2, $3)`,
    [id, subscription, purchased]
  );
  return id;
}

export interface IAdmitUpscaleOverrides {
  fingerprint?: string;
  amount?: number;
  batchLimit?: number;
  buildId?: string;
  deadlineAt?: string | null;
  provider?: string;
  modelId?: string;
  qualityTier?: string;
  config?: Record<string, unknown>;
}

export async function admitUpscale(
  db: Client,
  userId: string | null,
  jobId: string,
  options: IAdmitUpscaleOverrides = {}
) {
  const result = await db.query(
    `SELECT * FROM public.admit_upscale_execution(
    $1, $2, $3, $4, 'image/png', 1024, 512, 512, $5, 2,
    $6::JSONB, 'billing-model', $7, $8, 'v1', $9, $10, $11, $12, NULL)`,
    [
      userId,
      jobId,
      options.fingerprint ?? 'f'.repeat(48),
      `${userId}/input.png`,
      options.qualityTier ?? 'balanced',
      JSON.stringify(options.config ?? { scale: 2 }),
      options.modelId ?? 'resolved-model',
      options.provider ?? 'replicate',
      options.amount ?? 3,
      options.batchLimit ?? 5,
      options.deadlineAt ?? null,
      options.buildId ?? 'test-build',
    ]
  );
  return result.rows[0];
}
