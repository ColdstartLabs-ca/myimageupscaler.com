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
import {
  withDatabaseBatch,
  INPUT_CANDIDATE_SQL,
  INPUT_RECHECK_SQL,
  INACTIVE_GALLERY_SQL,
  GALLERY_RECHECK_SQL,
} from '../../scripts/storage/backup-and-purge.mjs';

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
  CREATE SCHEMA IF NOT EXISTS storage;
  DROP TABLE IF EXISTS public.saved_images CASCADE;
  DROP TABLE IF EXISTS public.processing_credit_reservations CASCADE;
  DROP TABLE IF EXISTS public.processing_jobs CASCADE;
  DROP TABLE IF EXISTS public.profiles CASCADE;
  DROP TABLE IF EXISTS public.subscriptions CASCADE;
  DROP TABLE IF EXISTS public.credit_transactions CASCADE;
  DROP TABLE IF EXISTS storage.objects CASCADE;
  DROP TABLE IF EXISTS auth.sessions CASCADE;
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
    user_id uuid,
    input_storage_path text,
    output_url text,
    status text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.processing_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    input_image_path text,
    output_image_path text,
    status text
  );
  CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text NOT NULL,
    name text NOT NULL,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    last_sign_in_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE auth.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    refreshed_at timestamp without time zone,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
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
    label: 'session refresh (auth.sessions)',
    table: 'auth.sessions',
    sql: `INSERT INTO auth.sessions (user_id, refreshed_at, created_at, updated_at) VALUES ('${USER_ID}', now() AT TIME ZONE 'UTC', now() - interval '90 days', now() - interval '90 days')`,
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

if (!CONFIG) {

  console.warn(
    '[storage-batch-locks] NOT RUN: no owned synthetic PostgreSQL 17 (SYNTHETIC_SQR01_DB_URL). ' +
      'Skipped integration tests are not proof of the lock or eligibility behavior.',
  );
}

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

  it('source queries keep 6-digit microsecond strings under a non-UTC session timezone', async () => {
    const name = `${crypto.randomUUID()}/${crypto.randomUUID()}.png`;
    await batchDb.query(
      `INSERT INTO storage.objects (bucket_id, name, metadata, created_at, updated_at)
       VALUES ('upscale-inputs', $1, '{"size":123}'::jsonb,
               '2020-01-01 00:00:00.123456+00', '2020-01-01 00:00:00.654321+00')`,
      [name],
    );
    // A non-UTC session timezone must not drop microseconds from the JSON source.
    await batchDb.query("SET TIME ZONE 'Asia/Tokyo'");
    try {
      const candidate = await batchDb.query(INPUT_CANDIDATE_SQL);
      const row = candidate.rows.find(candidateRow => candidateRow.path === name);
      expect(row).toBeTruthy();
      expect(typeof row.created_at).toBe('string');
      expect(row.created_at).toContain('.123456');
      expect(row.created_at).toMatch(/(?:Z|[+-]\d{2}:\d{2})$/);
      expect(typeof row.updated_at).toBe('string');
      expect(row.updated_at).toContain('.654321');

      const recheck = await batchDb.query(INPUT_RECHECK_SQL, ['upscale-inputs', [name]]);
      const rechecked = recheck.rows.find(recheckRow => recheckRow.path === name);
      expect(rechecked).toBeTruthy();
      expect(typeof rechecked.created_at).toBe('string');
      expect(rechecked.created_at).toContain('.123456');
      expect(typeof rechecked.updated_at).toBe('string');
      expect(rechecked.updated_at).toContain('.654321');
    } finally {
      await batchDb.query("SET TIME ZONE 'UTC'");
      await batchDb.query('DELETE FROM storage.objects WHERE name = $1', [name]);
    }
  }, 30000);

  describe('gallery expiry eligibility SQL', () => {
    const seededUserIds: string[] = [];

    async function seed(scenario: string): Promise<{ userId: string; imageId: string }> {
      const userId = crypto.randomUUID();
      const imageId = crypto.randomUUID();
      seededUserIds.push(userId);
      const storagePath = `eligibility/${scenario}.png`;
      // Inactive free user: signed in and created 90 days ago.
      await batchDb.query(
        `INSERT INTO auth.users (id, last_sign_in_at, created_at)
         VALUES ($1, now() - interval '90 days', now() - interval '90 days')`,
        [userId],
      );
      // Gallery image saved 40 days ago, so it is older than the 30-day cutoff.
      await batchDb.query(
        `INSERT INTO public.saved_images (id, user_id, storage_path, created_at)
         VALUES ($1, $2, $3, now() - interval '40 days')`,
        [imageId, userId, storagePath],
      );
      await batchDb.query(
        `INSERT INTO storage.objects (bucket_id, name) VALUES ('saved-images', $1)`,
        [storagePath],
      );
      return { userId, imageId };
    }

    async function addImage(userId: string, scenario: string, ageInterval: string): Promise<string> {
      const imageId = crypto.randomUUID();
      const storagePath = `eligibility/${scenario}.png`;
      await batchDb.query(
        `INSERT INTO public.saved_images (id, user_id, storage_path, created_at)
         VALUES ($1, $2, $3, now() - $4::interval)`,
        [imageId, userId, storagePath, ageInterval],
      );
      await batchDb.query(
        `INSERT INTO storage.objects (bucket_id, name) VALUES ('saved-images', $1)`,
        [storagePath],
      );
      return imageId;
    }

    afterAll(async () => {
      if (!seededUserIds.length) return;
      await batchDb.query("DELETE FROM storage.objects WHERE name LIKE 'eligibility/%'");
      await batchDb.query('DELETE FROM public.saved_images WHERE user_id = ANY($1::uuid[])', [seededUserIds]);
      await batchDb.query('DELETE FROM auth.sessions WHERE user_id = ANY($1::uuid[])', [seededUserIds]);
      await batchDb.query('DELETE FROM public.processing_credit_reservations WHERE user_id = ANY($1::uuid[])', [seededUserIds]);
      await batchDb.query('DELETE FROM public.credit_transactions WHERE user_id = ANY($1::uuid[])', [seededUserIds]);
      await batchDb.query('DELETE FROM public.subscriptions WHERE user_id = ANY($1::uuid[])', [seededUserIds]);
      await batchDb.query('DELETE FROM public.profiles WHERE id = ANY($1::uuid[])', [seededUserIds]);
      await batchDb.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [seededUserIds]);
    });

    it('selects only the baseline inactive free user and excludes every 30-day signal', async () => {
      const baseline = await seed('baseline');
      const recentSession = await seed('recent-session');
      await batchDb.query(
        `INSERT INTO auth.sessions (user_id, refreshed_at) VALUES ($1, now() - interval '5 days')`,
        [recentSession.userId],
      );
      const recentImage = await seed('recent-image');
      await batchDb.query(
        `UPDATE public.saved_images SET created_at = now() - interval '5 days' WHERE id = $1`,
        [recentImage.imageId],
      );
      const recentReservation = await seed('recent-reservation');
      await batchDb.query(
        `INSERT INTO public.processing_credit_reservations (user_id, created_at)
         VALUES ($1, now() - interval '5 days')`,
        [recentReservation.userId],
      );
      const purchased = await seed('purchased');
      await batchDb.query(
        `INSERT INTO public.credit_transactions (user_id, type, amount) VALUES ($1, 'purchase', 100)`,
        [purchased.userId],
      );
      const subscriptionCredits = await seed('subscription-credits');
      await batchDb.query(
        `INSERT INTO public.credit_transactions (user_id, type, amount) VALUES ($1, 'subscription', 50)`,
        [subscriptionCredits.userId],
      );
      const paidTier = await seed('paid-tier');
      await batchDb.query(`INSERT INTO public.profiles (id, subscription_tier) VALUES ($1, 'pro')`, [
        paidTier.userId,
      ]);
      const activeSub = await seed('active-sub');
      await batchDb.query(
        `INSERT INTO public.subscriptions (user_id, status) VALUES ($1, 'active')`,
        [activeSub.userId],
      );

      const excluded = [
        recentSession,
        recentImage,
        recentReservation,
        purchased,
        subscriptionCredits,
        paidTier,
        activeSub,
      ];

      const initial = await batchDb.query(INACTIVE_GALLERY_SQL);
      const initialIds = initial.rows.map(row => row.snapshot.id);
      expect(initialIds).toContain(baseline.imageId);
      for (const variant of excluded) expect(initialIds).not.toContain(variant.imageId);

      const recheckIds = [baseline.imageId, ...excluded.map(variant => variant.imageId)];
      const rechecked = await batchDb.query(GALLERY_RECHECK_SQL, [recheckIds]);
      expect(rechecked.rows.map(row => row.id)).toEqual([baseline.imageId]);
    }, 30000);

    it('keeps every image of a recently active user (old image plus recent image)', async () => {
      const user = await seed('same-user-old');
      const recentImageId = await addImage(user.userId, 'same-user-new', '5 days');

      const initial = await batchDb.query(INACTIVE_GALLERY_SQL);
      const ids = initial.rows.map(row => row.snapshot.id);
      expect(ids).not.toContain(user.imageId);
      expect(ids).not.toContain(recentImageId);

      const rechecked = await batchDb.query(GALLERY_RECHECK_SQL, [[user.imageId]]);
      expect(rechecked.rows.map(row => row.id)).toEqual([]);
    }, 30000);

    it('treats a save exactly at the 30-day cutoff as recent activity', async () => {
      const user = await seed('boundary-save-old');
      await batchDb.query('BEGIN');
      try {
        await addImage(user.userId, 'boundary-save-exact', '30 days');
        const initial = await batchDb.query(INACTIVE_GALLERY_SQL);
        expect(initial.rows.map(row => row.snapshot.id)).not.toContain(user.imageId);
      } finally {
        await batchDb.query('COMMIT');
      }
    }, 30000);

    it('treats a reservation exactly at the 30-day cutoff as recent activity', async () => {
      const user = await seed('boundary-reservation');
      await batchDb.query('BEGIN');
      try {
        await batchDb.query(
          `INSERT INTO public.processing_credit_reservations (user_id, created_at)
           VALUES ($1, now() - interval '30 days')`,
          [user.userId],
        );
        const initial = await batchDb.query(INACTIVE_GALLERY_SQL);
        expect(initial.rows.map(row => row.snapshot.id)).not.toContain(user.imageId);
      } finally {
        await batchDb.query('COMMIT');
      }
    }, 30000);

    it('keeps a user whose newest session has NULL refreshed_at but a recent created_at', async () => {
      const user = await seed('null-refresh');
      await batchDb.query(
        `INSERT INTO auth.sessions (user_id, refreshed_at, created_at, updated_at)
         VALUES ($1, NULL, now(), now())`,
        [user.userId],
      );
      const initial = await batchDb.query(INACTIVE_GALLERY_SQL);
      expect(initial.rows.map(row => row.snapshot.id)).not.toContain(user.imageId);
    }, 30000);

    it('treats a session refreshed exactly at the cutoff as recent under any session timezone', async () => {
      const user = await seed('tz-boundary-session');
      await batchDb.query('BEGIN');
      try {
        await batchDb.query(
          `INSERT INTO auth.sessions (user_id, refreshed_at, created_at, updated_at)
           VALUES ($1, (now() AT TIME ZONE 'UTC') - interval '30 days',
                   now() - interval '90 days', now() - interval '90 days')`,
          [user.userId],
        );
        await batchDb.query("SET LOCAL TIME ZONE 'UTC'");
        const utc = (await batchDb.query(INACTIVE_GALLERY_SQL)).rows.map(row => row.snapshot.id);
        await batchDb.query("SET LOCAL TIME ZONE 'Asia/Tokyo'");
        const shifted = (await batchDb.query(INACTIVE_GALLERY_SQL)).rows.map(row => row.snapshot.id);
        expect(shifted.sort()).toEqual(utc.sort());
        expect(utc).not.toContain(user.imageId);
      } finally {
        await batchDb.query('COMMIT');
      }
    }, 30000);
  });
});
