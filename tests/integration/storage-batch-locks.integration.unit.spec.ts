/**
 * SQR-01 bounded real-PostgreSQL-17 proof for `withDatabaseBatch`.
 *
 * Proves, against a disposable LOCAL synthetic PostgreSQL 17 only:
 *   1. While the batch callback holds its SHARE ROW EXCLUSIVE table locks,
 *      concurrent gallery rows, new input references, purchases, and
 *      sign-in updates cannot commit (verified through pg_locks, not timing).
 *   2. The lock is released on both ROLLBACK paths (callback status and
 *      thrown error) and on a COMMIT failure.
 *   3. `to_jsonb` row snapshots keep timestamp microseconds, while the
 *      node-postgres Date parser truncates them.
 *
 * Safety:
 *   - Never touches production, credentials, or a real backup.
 *   - Refuses any URL that is not loopback or is not the `sqr01_proof`
 *     database, before any SQL runs.
 *   - With `SQR01_REQUIRE_INTEGRATION=1` and no `SYNTHETIC_SQR01_DB_URL`,
 *     the suite fails. Otherwise it skips.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withDatabaseBatch } from '../../scripts/storage/backup-and-purge.mjs';

const RAW_URL = process.env.SYNTHETIC_SQR01_DB_URL;
const REQUIRED = process.env.SQR01_REQUIRE_INTEGRATION === '1';

if (!RAW_URL && REQUIRED) {
  throw new Error('SQR01_REQUIRE_INTEGRATION=1 but SYNTHETIC_SQR01_DB_URL is not set');
}

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);
const REQUIRED_DATABASE = 'sqr01_proof';

function parseDisposableUrl(raw: string): string {
  const url = new URL(raw);
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`SQR01 refuses non-loopback host: ${url.hostname}`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (database !== REQUIRED_DATABASE) {
    throw new Error(`SQR01 refuses database other than ${REQUIRED_DATABASE}: ${database}`);
  }
  return raw;
}

// Asserted at import time, before any client or SQL exists.
const CONFIG = RAW_URL ? { url: parseDisposableUrl(RAW_URL) } : null;

const USER_ID = '11111111-1111-1111-1111-111111111111';
const BLOCK_WAIT_MS = 5000;
const RELEASE_WAIT_MS = 4000;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

const SETUP_SQL = `
  CREATE SCHEMA IF NOT EXISTS auth;
  DROP TABLE IF EXISTS public.saved_images CASCADE;
  DROP TABLE IF EXISTS public.processing_credit_reservations CASCADE;
  DROP TABLE IF EXISTS public.processing_jobs CASCADE;
  DROP TABLE IF EXISTS public.profiles CASCADE;
  DROP TABLE IF EXISTS public.subscriptions CASCADE;
  DROP TABLE IF EXISTS public.credit_transactions CASCADE;
  DROP TABLE IF EXISTS auth.users CASCADE;

  CREATE TABLE public.saved_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    storage_path text,
    created_at timestamptz NOT NULL DEFAULT now(),
    code int,
    CONSTRAINT saved_images_code_uniq UNIQUE (code) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE TABLE public.processing_credit_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    input_storage_path text,
    output_url text,
    status text
  );
  CREATE TABLE public.processing_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    input_image_path text,
    output_image_path text,
    status text
  );
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    last_sign_in_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_tier text,
    subscription_status text,
    purchased_credits_balance integer NOT NULL DEFAULT 0
  );
  CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    status text
  );
  CREATE TABLE public.credit_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    type text,
    amount integer
  );
  INSERT INTO auth.users (id, last_sign_in_at) VALUES ('${USER_ID}', now() - interval '90 days');
`;

type Writer = { label: string; table: string; sql: string };

const PURGE_WRITERS: Writer[] = [
  {
    label: 'gallery row (saved_images)',
    table: 'public.saved_images',
    sql: `INSERT INTO public.saved_images (user_id, storage_path) VALUES ('${USER_ID}', 'blocked/gallery.png')`,
  },
  {
    label: 'new input reference (processing_jobs)',
    table: 'public.processing_jobs',
    sql: `INSERT INTO public.processing_jobs (input_image_path, status) VALUES ('blocked/input.png', 'queued')`,
  },
  {
    label: 'reservation/purchase (processing_credit_reservations)',
    table: 'public.processing_credit_reservations',
    sql: `INSERT INTO public.processing_credit_reservations (input_storage_path, status) VALUES ('blocked/input.png', 'reserved')`,
  },
];

const EXPIRE_WRITERS: Writer[] = [
  ...PURGE_WRITERS,
  {
    label: 'sign-in update (auth.users)',
    table: 'auth.users',
    sql: `UPDATE auth.users SET last_sign_in_at = now() WHERE id = '${USER_ID}'`,
  },
  {
    label: 'purchase (subscriptions)',
    table: 'public.subscriptions',
    sql: `INSERT INTO public.subscriptions (user_id, status) VALUES ('${USER_ID}', 'active')`,
  },
  {
    label: 'purchase (credit_transactions)',
    table: 'public.credit_transactions',
    sql: `INSERT INTO public.credit_transactions (user_id, type, amount) VALUES ('${USER_ID}', 'purchase', 100)`,
  },
  {
    label: 'profile write (profiles)',
    table: 'public.profiles',
    sql: `INSERT INTO public.profiles (subscription_tier) VALUES ('free')`,
  },
];

const maybe = CONFIG ? describe : describe.skip;

maybe('SQR-01 withDatabaseBatch locks on real PostgreSQL 17', () => {
  let batchDb: pg.Client;
  let writerDb: pg.Client;

  beforeAll(async () => {
    batchDb = new pg.Client({ connectionString: CONFIG!.url });
    writerDb = new pg.Client({ connectionString: CONFIG!.url });
    await batchDb.connect();
    await writerDb.connect();

    const { rows } = await batchDb.query(
      "SELECT (current_setting('server_version_num')::int / 10000) AS major",
    );
    expect(rows[0].major).toBeGreaterThanOrEqual(17);

    await batchDb.query(SETUP_SQL);
  }, 30000);

  afterAll(async () => {
    await batchDb?.end().catch(() => {});
    await writerDb?.end().catch(() => {});
  });

  async function proveBlocked(kind: 'purge' | 'expire', writer: Writer) {
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => (signalStarted = resolve));
    let writerSettled = false;
    let writerPromise: Promise<unknown> | null = null;
    let blockedSeen = false;
    let writerSettledAtCheck: boolean | null = null;

    const batchPromise = withDatabaseBatch(batchDb, kind, async () => {
      signalStarted();
      const deadline = Date.now() + BLOCK_WAIT_MS;
      while (Date.now() < deadline) {
        const { rows } = await batchDb.query(
          'SELECT 1 FROM pg_locks WHERE NOT granted AND relation = $1::regclass LIMIT 1',
          [writer.table],
        );
        if (rows.length > 0) {
          blockedSeen = true;
          break;
        }
        await sleep(10);
      }
      writerSettledAtCheck = writerSettled;
      return { status: 'ok' };
    });

    await started;
    writerPromise = writerDb.query(writer.sql);
    writerPromise.then(
      () => (writerSettled = true),
      () => (writerSettled = true),
    );

    await batchPromise;
    await withTimeout(writerPromise, RELEASE_WAIT_MS, `release after ${writer.label}`);

    return { blockedSeen, writerSettledAtCheck };
  }

  async function assertLockReleased(label: string) {
    await withTimeout(
      writerDb.query(
        `INSERT INTO public.saved_images (storage_path) VALUES ('released/${label}.png')`,
      ),
      RELEASE_WAIT_MS,
      `lock release after ${label}`,
    );
  }

  for (const writer of PURGE_WRITERS) {
    it(`purge lock blocks a concurrent ${writer.label}`, async () => {
      const result = await proveBlocked('purge', writer);
      expect(result.blockedSeen).toBe(true);
      expect(result.writerSettledAtCheck).toBe(false);
    }, 30000);
  }

  for (const writer of EXPIRE_WRITERS) {
    it(`expire lock blocks a concurrent ${writer.label}`, async () => {
      const result = await proveBlocked('expire', writer);
      expect(result.blockedSeen).toBe(true);
      expect(result.writerSettledAtCheck).toBe(false);
    }, 30000);
  }

  it('rolls back and releases the lock when the callback reports a non-ok status', async () => {
    const result = await withDatabaseBatch(batchDb, 'purge', async () => {
      await batchDb.query(
        "INSERT INTO public.saved_images (storage_path) VALUES ('rollback/status.png')",
      );
      return { status: 'stop' };
    });
    expect(result.status).toBe('stop');

    const { rows } = await batchDb.query(
      "SELECT count(*)::int AS n FROM public.saved_images WHERE storage_path = 'rollback/status.png'",
    );
    expect(rows[0].n).toBe(0);
    await assertLockReleased('callback-status');
  }, 30000);

  it('rolls back and releases the lock when the callback throws', async () => {
    await expect(
      withDatabaseBatch(batchDb, 'purge', async () => {
        await batchDb.query(
          "INSERT INTO public.saved_images (storage_path) VALUES ('rollback/throw.png')",
        );
        throw new Error('sqr01-boom');
      }),
    ).rejects.toThrow('sqr01-boom');

    const { rows } = await batchDb.query(
      "SELECT count(*)::int AS n FROM public.saved_images WHERE storage_path = 'rollback/throw.png'",
    );
    expect(rows[0].n).toBe(0);
    await assertLockReleased('callback-throw');
  }, 30000);

  it('rolls back and releases the lock when COMMIT fails', async () => {
    await expect(
      withDatabaseBatch(batchDb, 'purge', async () => {
        await batchDb.query(
          "INSERT INTO public.saved_images (storage_path, code) VALUES ('commitfail/a.png', 999)",
        );
        await batchDb.query(
          "INSERT INTO public.saved_images (storage_path, code) VALUES ('commitfail/b.png', 999)",
        );
        return { status: 'ok' };
      }),
    ).rejects.toThrow(/saved_images_code_uniq|duplicate key/i);

    const { rows } = await batchDb.query(
      "SELECT count(*)::int AS n FROM public.saved_images WHERE storage_path LIKE 'commitfail/%'",
    );
    expect(rows[0].n).toBe(0);
    await assertLockReleased('commit-failure');
  }, 30000);

  it('to_jsonb keeps microseconds while the pg Date parser truncates them', async () => {
    const id = crypto.randomUUID();
    await batchDb.query(
      `INSERT INTO public.saved_images (id, storage_path, created_at)
       VALUES ($1, 'micro/ts.png', '2026-10-10 12:34:56.123456+00')`,
      [id],
    );

    const json = await batchDb.query(
      'SELECT to_jsonb(s) AS snapshot FROM public.saved_images s WHERE s.id = $1',
      [id],
    );
    const snapshotTimestamp: string = json.rows[0].snapshot.created_at;
    expect(snapshotTimestamp).toContain('.123456');

    const plain = await batchDb.query(
      'SELECT created_at FROM public.saved_images WHERE id = $1',
      [id],
    );
    const parsed = plain.rows[0].created_at as Date;
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getUTCMilliseconds()).toBe(123);
    expect(parsed.toISOString()).not.toBe(snapshotTimestamp);
  }, 30000);
});
