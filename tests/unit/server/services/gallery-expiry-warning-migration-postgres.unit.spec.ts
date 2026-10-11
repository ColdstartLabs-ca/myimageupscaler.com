import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * PRD-SQR-04 Phase 2 — SQL policy proof on a disposable PostgreSQL 17 container.
 * Uses the cached Supabase PostgreSQL 17 image (matches production major version).
 * No production DB, credentials, or data are touched.
 */

const dockerAvailable = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const containerName = `miu-gallery-expiry-${randomUUID()}`;
let client: Client | undefined;

const MIGRATION = 'supabase/migrations/20261010235000_gallery_expiry_warning.sql';

const userIds = new Map<string, string>();
function uid(name: string): string {
  const existing = userIds.get(name);
  if (existing) return existing;
  const created = randomUUID();
  userIds.set(name, created);
  return created;
}

describe.runIf(dockerAvailable)('gallery expiry warning policy on PostgreSQL 17', () => {
  beforeAll(async () => {
    execFileSync('docker', [
      'run',
      '--rm',
      '-d',
      '--name',
      containerName,
      '-e',
      'POSTGRES_PASSWORD=test',
      '-P',
      'public.ecr.aws/supabase/postgres:17.6.1.052',
    ]);

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const health = spawnSync(
        'docker',
        ['inspect', '--format', '{{.State.Health.Status}}', containerName],
        { encoding: 'utf8' }
      ).stdout.trim();
      if (health === 'healthy') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const mapping = execFileSync('docker', ['port', containerName, '5432/tcp'], {
      encoding: 'utf8',
    }).trim();
    const connectionString = `postgresql://supabase_admin:test@127.0.0.1:${mapping.split(':').at(-1)}/postgres`;

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const candidate = new Client({ connectionString });
      try {
        await candidate.connect();
        client = candidate;
        break;
      } catch {
        await candidate.end().catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (!client) throw new Error('PostgreSQL test connection failed');

    // The Supabase image already provides anon/authenticated/service_role, the auth
    // schema with auth.users and auth.role(), and pgcrypto. Only the tables the
    // migration needs are created here.
    await client.query(`
      CREATE TABLE auth.sessions(
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        refreshed_at TIMESTAMP WITHOUT TIME ZONE
      );

      CREATE FUNCTION public.handle_updated_at() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

      CREATE TABLE public.profiles(
        id UUID PRIMARY KEY,
        subscription_status TEXT,
        subscription_tier TEXT,
        subscription_credits_balance INTEGER DEFAULT 0,
        purchased_credits_balance INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE public.subscriptions(
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE public.credit_transactions(
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE public.saved_images(
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE public.processing_credit_reservations(
        job_id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE public.email_lifecycle_campaigns(
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        template_name TEXT NOT NULL,
        email_type TEXT NOT NULL,
        preference_key TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        cooldown_days INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'lifecycle',
        sort_priority INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE public.email_lifecycle_queue(
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_key TEXT NOT NULL REFERENCES public.email_lifecycle_campaigns(key),
        user_id UUID,
        recipient_email TEXT NOT NULL DEFAULT 'redacted@example.com',
        scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT,
        template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        processing_claim_id UUID,
        processing_claimed_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX idx_email_lifecycle_queue_pending_unique
        ON public.email_lifecycle_queue(user_id, campaign_key)
        WHERE status = 'pending';
    `);

    await client.query(readFileSync(MIGRATION, 'utf8'));
    await client.query(
      `INSERT INTO public.email_lifecycle_campaigns
         (key, name, category, template_name, email_type, cooldown_days, priority, sort_priority)
       VALUES ('low-credits', 'Low credits', 'low_credit', 'low-credits', 'marketing', 7, 'lifecycle', 90)`
    );
  }, 240_000);

  afterAll(async () => {
    await client?.end();
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
  });

  beforeEach(async () => {
    await client!.query('TRUNCATE public.email_lifecycle_queue, public.gallery_expiry_notices');
  });

  async function daysAgo(days: number): Promise<string> {
    const result = await client!.query(`SELECT (now() - ($1 || ' days')::interval) AS ts`, [days]);
    return result.rows[0].ts.toISOString();
  }

  async function anchorTextOf(name: string): Promise<string> {
    const result = await client!.query(
      `SELECT public.gallery_expiry_activity_anchor($1)::text AS anchor`,
      [uid(name)]
    );
    return result.rows[0].anchor;
  }

  async function anchorMillisOf(name: string): Promise<number> {
    const result = await client!.query(
      `SELECT public.gallery_expiry_activity_anchor($1) AS anchor`,
      [uid(name)]
    );
    return new Date(result.rows[0].anchor).getTime();
  }

  async function createUser(name: string, createdDaysAgo: number, lastSignInDaysAgo: number | null) {
    const lastSignIn = lastSignInDaysAgo === null ? null : await daysAgo(lastSignInDaysAgo);
    await client!.query(
      `INSERT INTO auth.users(id, created_at, last_sign_in_at) VALUES ($1, now() - ($2 || ' days')::interval, $3)`,
      [uid(name), createdDaysAgo, lastSignIn]
    );
  }

  async function insertSession(
    name: string,
    opts: {
      createdAtDaysAgo: number;
      updatedAtDaysAgo: number;
      refreshedAtDaysAgo?: number;
      refreshedAtRaw?: string | null;
    }
  ) {
    const refreshed =
      opts.refreshedAtRaw !== undefined
        ? opts.refreshedAtRaw
        : opts.refreshedAtDaysAgo !== undefined
          ? ((await daysAgo(opts.refreshedAtDaysAgo)) as string)
          : null;
    await client!.query(
      `INSERT INTO auth.sessions(user_id, created_at, updated_at, refreshed_at)
       VALUES ($1, now() - ($2 || ' days')::interval, now() - ($3 || ' days')::interval,
         CASE WHEN $4::text IS NULL THEN NULL ELSE ($4::text)::timestamp END)`,
      [uid(name), opts.createdAtDaysAgo, opts.updatedAtDaysAgo, refreshed]
    );
  }

  async function createProfile(
    name: string,
    overrides: Partial<{
      subscription_status: string | null;
      subscription_tier: string | null;
      purchased_credits_balance: number;
    }> = {}
  ) {
    await client!.query(
      `INSERT INTO public.profiles(id, subscription_status, subscription_tier, purchased_credits_balance)
       VALUES ($1, $2, $3, $4)`,
      [
        uid(name),
        overrides.subscription_status ?? 'free',
        overrides.subscription_tier ?? 'free',
        overrides.purchased_credits_balance ?? 0,
      ]
    );
  }

  async function candidateIds(): Promise<string[]> {
    const candidates = await client!.query(
      `SELECT user_id FROM public.get_gallery_expiry_warning_candidates(50)`
    );
    return candidates.rows.map(row => row.user_id);
  }

  it('anchors inactivity on the newest real activity signal', async () => {
    await createUser('anchor-1', 100, 40);
    await insertSession('anchor-1', {
      createdAtDaysAgo: 100,
      updatedAtDaysAgo: 100,
      refreshedAtDaysAgo: 10,
    });
    expect(await anchorMillisOf('anchor-1')).toBeGreaterThan(new Date(await daysAgo(11)).getTime());

    await createUser('anchor-2', 100, null);
    await client!.query(
      `INSERT INTO public.saved_images(user_id, created_at) VALUES ($1, now() - interval '5 days')`,
      [uid('anchor-2')]
    );
    expect(await anchorMillisOf('anchor-2')).toBeGreaterThan(new Date(await daysAgo(6)).getTime());

    await createUser('anchor-3', 100, 90);
    await client!.query(
      `INSERT INTO public.processing_credit_reservations(job_id, user_id, created_at)
       VALUES (gen_random_uuid(), $1, now() - interval '2 days')`,
      [uid('anchor-3')]
    );
    expect(await anchorMillisOf('anchor-3')).toBeGreaterThan(new Date(await daysAgo(3)).getTime());
  });

  it('reads a naive session refreshed_at as UTC regardless of the session TimeZone', async () => {
    await createUser('anchor-tz', 200, null);
    await client!.query(`SET TIME ZONE 'America/Los_Angeles'`);
    await client!.query(
      `INSERT INTO auth.sessions(user_id, created_at, updated_at, refreshed_at)
       VALUES ($1, now() - interval '200 days', now() - interval '200 days', '2026-08-01 12:00:00.123456'::timestamp)`,
      [uid('anchor-tz')]
    );
    const laAnchor = await client!.query(
      `SELECT public.gallery_expiry_activity_anchor($1) AS anchor`,
      [uid('anchor-tz')]
    );
    await client!.query(`SET TIME ZONE 'UTC'`);
    const utcAnchor = await client!.query(
      `SELECT public.gallery_expiry_activity_anchor($1) AS anchor`,
      [uid('anchor-tz')]
    );

    expect(new Date(laAnchor.rows[0].anchor).toISOString()).toBe(
      new Date(utcAnchor.rows[0].anchor).toISOString()
    );
    expect(laAnchor.rows[0].anchor.toISOString()).toBe('2026-08-01T12:00:00.123Z');
  });

  it('selects free, never-bought, inactive users and dedupes by period', async () => {
    await createUser('cand-eligible', 60, 40);
    await createProfile('cand-eligible');

    await createUser('cand-active', 60, 40);
    await createProfile('cand-active', { subscription_status: 'active', subscription_tier: 'pro' });

    await createUser('cand-trialing-sub', 60, 40);
    await createProfile('cand-trialing-sub');
    await client!.query(
      `INSERT INTO public.subscriptions(id, user_id, status) VALUES ('sub-1', $1, 'trialing')`,
      [uid('cand-trialing-sub')]
    );

    await createUser('cand-bought', 60, 40);
    await createProfile('cand-bought');
    await client!.query(
      `INSERT INTO public.credit_transactions(user_id, amount, type) VALUES ($1, 100, 'purchase')`,
      [uid('cand-bought')]
    );

    await createUser('cand-balance', 60, 40);
    await createProfile('cand-balance', { purchased_credits_balance: 50 });

    await createUser('cand-recent', 60, 3);
    await createProfile('cand-recent');

    await createUser('cand-refreshed', 60, 40);
    await createProfile('cand-refreshed');
    await insertSession('cand-refreshed', {
      createdAtDaysAgo: 40,
      updatedAtDaysAgo: 40,
      refreshedAtDaysAgo: 1,
    });

    await createUser('cand-null-refreshed', 60, 40);
    await createProfile('cand-null-refreshed');
    await insertSession('cand-null-refreshed', {
      createdAtDaysAgo: 1,
      updatedAtDaysAgo: 40,
      refreshedAtRaw: null,
    });

    await createUser('cand-warned', 60, 40);
    await createProfile('cand-warned');
    const warnedAnchor = await anchorTextOf('cand-warned');
    await client!.query(
      `INSERT INTO public.gallery_expiry_notices(user_id, activity_anchor, warning_sent_at)
       VALUES ($1, $2, now())`,
      [uid('cand-warned'), warnedAnchor]
    );

    await createUser('cand-crash-window', 60, 40);
    await createProfile('cand-crash-window');
    await client!.query(
      `INSERT INTO public.gallery_expiry_notices(user_id, activity_anchor) VALUES ($1, $2)`,
      [uid('cand-crash-window'), await anchorTextOf('cand-crash-window')]
    );

    await createUser('cand-recoverable', 60, 40);
    await createProfile('cand-recoverable');
    const recoverAnchor = await anchorTextOf('cand-recoverable');
    const recoverNotice = await client!.query(
      `INSERT INTO public.gallery_expiry_notices(user_id, activity_anchor) VALUES ($1, $2) RETURNING id`,
      [uid('cand-recoverable'), recoverAnchor]
    );
    await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
       VALUES ('gallery_expiry_warning', $1, 'pending',
         jsonb_build_object('notice_id', $2::text, 'activity_anchor', $3::text))`,
      [uid('cand-recoverable'), recoverNotice.rows[0].id, recoverAnchor]
    );

    const ids = await candidateIds();

    expect(ids).toContain(uid('cand-eligible'));
    expect(ids).toContain(uid('cand-crash-window'));
    expect(ids).toContain(uid('cand-recoverable'));
    expect(ids).not.toContain(uid('cand-active'));
    expect(ids).not.toContain(uid('cand-trialing-sub'));
    expect(ids).not.toContain(uid('cand-bought'));
    expect(ids).not.toContain(uid('cand-balance'));
    expect(ids).not.toContain(uid('cand-recent'));
    expect(ids).not.toContain(uid('cand-refreshed'));
    expect(ids).not.toContain(uid('cand-null-refreshed'));
    expect(ids).not.toContain(uid('cand-warned'));
  });

  it('bounds the candidate request between 1 and 50', async () => {
    const wide = await client!.query(
      `SELECT count(*)::int AS n FROM public.get_gallery_expiry_warning_candidates(999)`
    );
    expect(wide.rows[0].n).toBeGreaterThanOrEqual(2);
    expect(wide.rows[0].n).toBeLessThanOrEqual(50);

    const narrow = await client!.query(
      `SELECT count(*)::int AS n FROM public.get_gallery_expiry_warning_candidates(0)`
    );
    expect(narrow.rows[0].n).toBe(1);
  });

  it('keeps a microsecond anchor exact and drops the candidate after a real SQL send', async () => {
    await createUser('micro-1', 200, null);
    await client!.query(
      `UPDATE auth.users SET last_sign_in_at = '2026-08-01 12:00:00.123456+00' WHERE id = $1`,
      [uid('micro-1')]
    );
    await createProfile('micro-1');

    const anchor = await anchorTextOf('micro-1');
    expect(anchor).toMatch(/12:00:00\.123456/);

    await client!.query(
      `INSERT INTO public.gallery_expiry_notices(user_id, activity_anchor) VALUES ($1, $2)`,
      [uid('micro-1'), anchor]
    );
    expect(await candidateIds()).toContain(uid('micro-1'));

    const notice = await client!.query(
      `SELECT id FROM public.gallery_expiry_notices WHERE user_id = $1`,
      [uid('micro-1')]
    );
    const queued = await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
       VALUES ('gallery_expiry_warning', $1, 'pending',
         jsonb_build_object('notice_id', $2::text, 'activity_anchor', $3::text))
       RETURNING id`,
      [uid('micro-1'), notice.rows[0].id, anchor]
    );
    await client!.query(
      `UPDATE public.email_lifecycle_queue SET status = 'sent', sent_at = now() WHERE id = $1`,
      [queued.rows[0].id]
    );

    expect(await candidateIds()).not.toContain(uid('micro-1'));
  });

  it('re-enqueues a crash-window notice, then skips it once the send is recorded', async () => {
    await createUser('crash-1', 60, 40);
    await createProfile('crash-1');
    const anchor = await anchorTextOf('crash-1');
    await client!.query(
      `INSERT INTO public.gallery_expiry_notices(user_id, activity_anchor) VALUES ($1, $2) RETURNING id`,
      [uid('crash-1'), anchor]
    );
    // Notice exists, no queue row: still a candidate so the service can re-enqueue it.
    expect(await candidateIds()).toContain(uid('crash-1'));

    const notice = await client!.query(
      `SELECT id FROM public.gallery_expiry_notices WHERE user_id = $1`,
      [uid('crash-1')]
    );
    const queued = await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
       VALUES ('gallery_expiry_warning', $1, 'pending',
         jsonb_build_object('notice_id', $2::text, 'activity_anchor', $3::text))
       RETURNING id`,
      [uid('crash-1'), notice.rows[0].id, anchor]
    );
    await client!.query(
      `UPDATE public.email_lifecycle_queue SET status = 'sent', sent_at = now() WHERE id = $1`,
      [queued.rows[0].id]
    );

    expect(await candidateIds()).not.toContain(uid('crash-1'));
  });

  it('cancels stale pending warnings globally but never sent rows or other campaigns', async () => {
    await createUser('cancel-stale', 60, 40);
    await createProfile('cancel-stale');
    await createUser('cancel-keep', 60, 40);
    await createProfile('cancel-keep');

    const staleId = uid('cancel-stale');
    const keepId = uid('cancel-keep');
    const keepAnchor = await anchorTextOf('cancel-keep');

    await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata, sent_at, processing_claim_id)
       VALUES
         ('gallery_expiry_warning', $1, 'pending', jsonb_build_object('activity_anchor', $2::text), NULL, gen_random_uuid()),
         ('gallery_expiry_warning', $1, 'sent', jsonb_build_object('activity_anchor', $2::text), now(), NULL),
         ('gallery_expiry_warning', $3, 'pending', jsonb_build_object('activity_anchor', $4::text), NULL, NULL),
         ('low-credits', $3, 'pending', jsonb_build_object('activity_anchor', $4::text), NULL, NULL)`,
      [staleId, '2026-01-01 00:00:00+00', keepId, keepAnchor]
    );

    const cancelled = await client!.query(
      `SELECT public.cancel_stale_gallery_expiry_warnings() AS n`
    );
    expect(cancelled.rows[0].n).toBe(1);

    const staleRow = await client!.query(
      `SELECT status, reason, processing_claim_id FROM public.email_lifecycle_queue
       WHERE user_id = $1 AND campaign_key = 'gallery_expiry_warning' AND sent_at IS NULL`,
      [staleId]
    );
    expect(staleRow.rows[0]).toMatchObject({
      status: 'cancelled',
      reason: 'gallery_expiry_anchor_changed',
      processing_claim_id: null,
    });

    const keepRow = await client!.query(
      `SELECT status FROM public.email_lifecycle_queue WHERE user_id = $1`,
      [keepId]
    );
    // The keep user's gallery row stays; the low-credits row also stays.
    const statuses = keepRow.rows.map(r => r.status);
    expect(statuses).toContain('pending');
    expect(
      await client!.query(
        `SELECT count(*)::int AS n FROM public.email_lifecycle_queue
         WHERE user_id = $1 AND campaign_key = 'low-credits' AND status = 'pending'`,
        [keepId]
      )
    ).toMatchObject({ rows: [{ n: 1 }] });
    expect(
      await client!.query(
        `SELECT count(*)::int AS n FROM public.email_lifecycle_queue
         WHERE user_id = $1 AND campaign_key = 'gallery_expiry_warning' AND status = 'sent'`,
        [staleId]
      )
    ).toMatchObject({ rows: [{ n: 1 }] });
  });

  it('cancels a matching pending warning once the user pays, even with the same anchor', async () => {
    await createUser('cancel-paid', 60, 40);
    await createProfile('cancel-paid', { subscription_status: 'active', subscription_tier: 'pro' });
    const paidId = uid('cancel-paid');
    const anchor = await anchorTextOf('cancel-paid');
    await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
       VALUES ('gallery_expiry_warning', $1, 'pending', jsonb_build_object('activity_anchor', $2::text))`,
      [paidId, anchor]
    );

    const cancelled = await client!.query(
      `SELECT public.cancel_stale_gallery_expiry_warnings() AS n`
    );
    expect(cancelled.rows[0].n).toBe(1);

    const row = await client!.query(
      `SELECT status, reason FROM public.email_lifecycle_queue WHERE user_id = $1`,
      [paidId]
    );
    expect(row.rows[0]).toMatchObject({ status: 'cancelled', reason: 'gallery_expiry_user_paid' });
  });

  it('cancels at most 50 pending rows per call', async () => {
    for (let i = 0; i < 55; i += 1) {
      const name = `bound-${i}`;
      await createUser(name, 60, 40);
      await createProfile(name);
      await client!.query(
        `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
         VALUES ('gallery_expiry_warning', $1, 'pending', jsonb_build_object('activity_anchor', '2026-01-01 00:00:00+00'))`,
        [uid(name)]
      );
    }

    const cancelled = await client!.query(
      `SELECT public.cancel_stale_gallery_expiry_warnings() AS n`
    );
    expect(cancelled.rows[0].n).toBe(50);
  });

  it('enforces one pending-or-sent gallery queue row per notice id', async () => {
    const noticeId = randomUUID();
    const meta = JSON.stringify({ notice_id: noticeId });
    await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
       VALUES ('gallery_expiry_warning', $1, 'pending', $2::jsonb)`,
      [uid('idx-a'), meta]
    );

    await expect(
      client!.query(
        `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
         VALUES ('gallery_expiry_warning', $1, 'pending', $2::jsonb)`,
        [uid('idx-b'), meta]
      )
    ).rejects.toThrow(/duplicate key|unique/i);

    await client!.query(
      `UPDATE public.email_lifecycle_queue SET status = 'sent', sent_at = now()
       WHERE metadata ->> 'notice_id' = $1`,
      [noticeId]
    );
    await expect(
      client!.query(
        `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
         VALUES ('gallery_expiry_warning', $1, 'pending', $2::jsonb)`,
        [uid('idx-c'), meta]
      )
    ).rejects.toThrow(/duplicate key|unique/i);

    // A cancelled row leaves the index, so a fresh attempt is allowed.
    await client!.query(
      `UPDATE public.email_lifecycle_queue SET status = 'cancelled', sent_at = NULL
       WHERE metadata ->> 'notice_id' = $1`,
      [noticeId]
    );
    await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
       VALUES ('gallery_expiry_warning', $1, 'pending', $2::jsonb)`,
      [uid('idx-d'), meta]
    );
    expect(
      (
        await client!.query(
          `SELECT count(*)::int AS n FROM public.email_lifecycle_queue WHERE metadata ->> 'notice_id' = $1`,
          [noticeId]
        )
      ).rows[0].n
    ).toBe(2);
  });

  it('captures the first real sent_at and survives queue pruning', async () => {
    await createUser('sent-1', 60, 40);
    await createProfile('sent-1');
    const sentId = uid('sent-1');
    const anchor = await anchorTextOf('sent-1');
    const notice = await client!.query(
      `INSERT INTO public.gallery_expiry_notices(user_id, activity_anchor) VALUES ($1, $2) RETURNING id`,
      [sentId, anchor]
    );
    const noticeId = notice.rows[0].id;

    const queued = await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
       VALUES ('gallery_expiry_warning', $1, 'pending',
         jsonb_build_object('notice_id', $2::text, 'activity_anchor', $3::text))
       RETURNING id`,
      [sentId, noticeId, anchor]
    );
    const queueId = queued.rows[0].id;

    const beforeSend = await client!.query(
      `SELECT warning_sent_at FROM public.gallery_expiry_notices WHERE id = $1`,
      [noticeId]
    );
    expect(beforeSend.rows[0].warning_sent_at).toBeNull();

    await client!.query(
      `UPDATE public.email_lifecycle_queue SET status = 'failed', sent_at = now() - interval '1 hour'
       WHERE id = $1`,
      [queueId]
    );
    const afterFailed = await client!.query(
      `SELECT warning_sent_at FROM public.gallery_expiry_notices WHERE id = $1`,
      [noticeId]
    );
    expect(afterFailed.rows[0].warning_sent_at).not.toBeNull();
    const firstSentAt = afterFailed.rows[0].warning_sent_at;

    await client!.query(
      `UPDATE public.email_lifecycle_queue SET sent_at = now() WHERE id = $1`,
      [queueId]
    );
    const afterSecondSend = await client!.query(
      `SELECT warning_sent_at FROM public.gallery_expiry_notices WHERE id = $1`,
      [noticeId]
    );
    expect(afterSecondSend.rows[0].warning_sent_at.toISOString()).toBe(firstSentAt.toISOString());

    // Malformed metadata must not abort the queue write and must not touch the notice.
    await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata, sent_at)
       VALUES ('gallery_expiry_warning', $1, 'sent',
         jsonb_build_object('notice_id', 'not-a-uuid', 'activity_anchor', 'nope'), now())`,
      [sentId]
    );

    await client!.query(`DELETE FROM public.email_lifecycle_queue WHERE id = $1`, [queueId]);
    const afterPrune = await client!.query(
      `SELECT warning_sent_at, queue_id FROM public.gallery_expiry_notices WHERE id = $1`,
      [noticeId]
    );
    expect(afterPrune.rows[0].warning_sent_at.toISOString()).toBe(firstSentAt.toISOString());
    expect(afterPrune.rows[0].queue_id).toBeNull();
  });

  it('propagates real database failures from the delivery trigger instead of swallowing them', async () => {
    await createUser('propagate-1', 60, 40);
    await createProfile('propagate-1');
    const anchor = await anchorTextOf('propagate-1');
    const notice = await client!.query(
      `INSERT INTO public.gallery_expiry_notices(user_id, activity_anchor) VALUES ($1, $2) RETURNING id`,
      [uid('propagate-1'), anchor]
    );
    const queued = await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
       VALUES ('gallery_expiry_warning', $1, 'pending',
         jsonb_build_object('notice_id', $2::text, 'activity_anchor', $3::text))
       RETURNING id`,
      [uid('propagate-1'), notice.rows[0].id, anchor]
    );

    await client!.query(`
      CREATE FUNCTION public.test_force_notice_failure() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'forced notice update failure'; END; $$;
      CREATE TRIGGER test_force_notice_failure BEFORE UPDATE ON public.gallery_expiry_notices
        FOR EACH ROW EXECUTE FUNCTION public.test_force_notice_failure();
    `);

    try {
      await expect(
        client!.query(
          `UPDATE public.email_lifecycle_queue SET status = 'sent', sent_at = now() WHERE id = $1`,
          [queued.rows[0].id]
        )
      ).rejects.toThrow(/forced notice update failure/);
    } finally {
      await client!.query(`
        DROP TRIGGER IF EXISTS test_force_notice_failure ON public.gallery_expiry_notices;
        DROP FUNCTION IF EXISTS public.test_force_notice_failure();
      `);
    }
  });

  it('revokes trigger and RPC execute from public, anon and authenticated', async () => {
    const result = await client!.query(`
      SELECT
        has_function_privilege('anon', 'public.capture_gallery_expiry_warning_delivery()', 'EXECUTE') AS trigger_anon,
        has_function_privilege('authenticated', 'public.capture_gallery_expiry_warning_delivery()', 'EXECUTE') AS trigger_authed,
        has_function_privilege('anon', 'public.cancel_stale_gallery_expiry_warnings()', 'EXECUTE') AS cancel_anon,
        has_function_privilege('authenticated', 'public.get_gallery_expiry_warning_candidates(integer)', 'EXECUTE') AS candidates_authed
    `);
    expect(result.rows[0]).toMatchObject({
      trigger_anon: false,
      trigger_authed: false,
      cancel_anon: false,
      candidates_authed: false,
    });
  });

  it('seeds the campaign as an enabled transactional account retention notice', async () => {
    const campaign = await client!.query(
      `SELECT email_type, preference_key, priority, enabled FROM public.email_lifecycle_campaigns
       WHERE key = 'gallery_expiry_warning'`
    );
    expect(campaign.rows[0]).toMatchObject({
      email_type: 'transactional',
      preference_key: null,
      priority: 'transactional',
      enabled: true,
    });
  });

  it('cancels a stale warning even when 50 valid pending rows are older', async () => {
    for (let i = 0; i < 50; i += 1) {
      const name = `stale-behind-${i}`;
      await createUser(name, 60, 40);
      await createProfile(name);
      const anchor = await anchorTextOf(name);
      await client!.query(
        `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata, created_at)
         VALUES ('gallery_expiry_warning', $1, 'pending',
           jsonb_build_object('activity_anchor', $2::text), now() - (($3 || ' seconds')::interval))`,
        [uid(name), anchor, String(1000 - i)]
      );
    }

    await createUser('stale-behind-victim', 60, 40);
    await createProfile('stale-behind-victim');
    await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata, created_at)
       VALUES ('gallery_expiry_warning', $1, 'pending',
         jsonb_build_object('activity_anchor', '2026-01-01 00:00:00+00'), now())`,
      [uid('stale-behind-victim')]
    );

    const cancelled = await client!.query(
      `SELECT public.cancel_stale_gallery_expiry_warnings() AS n`
    );
    expect(cancelled.rows[0].n).toBe(1);

    const victim = await client!.query(
      `SELECT status, reason FROM public.email_lifecycle_queue WHERE user_id = $1`,
      [uid('stale-behind-victim')]
    );
    expect(victim.rows[0]).toMatchObject({
      status: 'cancelled',
      reason: 'gallery_expiry_anchor_changed',
    });

    const validPending = await client!.query(
      `SELECT count(*)::int AS n FROM public.email_lifecycle_queue
       WHERE campaign_key = 'gallery_expiry_warning' AND status = 'pending'`
    );
    expect(validPending.rows[0].n).toBe(50);
  });

  it('returns a new eligible warning when 50 live pending rows are older', async () => {
    for (let i = 0; i < 50; i += 1) {
      const name = `live-pending-${i}`;
      await createUser(name, 220, 200);
      await createProfile(name);
      const anchor = await anchorTextOf(name);
      const notice = await client!.query(
        `INSERT INTO public.gallery_expiry_notices(user_id, activity_anchor) VALUES ($1, $2) RETURNING id`,
        [uid(name), anchor]
      );
      const queued = await client!.query(
        `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
         VALUES ('gallery_expiry_warning', $1, 'pending',
           jsonb_build_object('notice_id', $2::text, 'activity_anchor', $3::text))
         RETURNING id`,
        [uid(name), notice.rows[0].id, anchor]
      );
      await client!.query(
        `UPDATE public.gallery_expiry_notices SET queue_id = $1 WHERE id = $2`,
        [queued.rows[0].id, notice.rows[0].id]
      );
    }

    await createUser('late-eligible', 210, 190);
    await createProfile('late-eligible');

    const ids = await candidateIds();
    expect(ids).toContain(uid('late-eligible'));
    expect(ids).not.toContain(uid('live-pending-0'));
  });

  it('never cancels a sent gallery row even when its anchor is stale', async () => {
    await createUser('sent-stale', 60, 40);
    await createProfile('sent-stale');
    await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata, sent_at)
       VALUES ('gallery_expiry_warning', $1, 'sent',
         jsonb_build_object('activity_anchor', '2026-01-01 00:00:00+00'), now())`,
      [uid('sent-stale')]
    );

    const cancelled = await client!.query(
      `SELECT public.cancel_stale_gallery_expiry_warnings() AS n`
    );
    expect(cancelled.rows[0].n).toBe(0);

    const row = await client!.query(
      `SELECT status FROM public.email_lifecycle_queue WHERE user_id = $1`,
      [uid('sent-stale')]
    );
    expect(row.rows[0].status).toBe('sent');
  });

  it('does not abort the cancel scan on malformed anchor metadata', async () => {
    await createUser('malformed-bad', 60, 40);
    await createProfile('malformed-bad');
    await createUser('malformed-old', 60, 40);
    await createProfile('malformed-old');
    await client!.query(
      `INSERT INTO public.email_lifecycle_queue(campaign_key, user_id, status, metadata)
       VALUES
         ('gallery_expiry_warning', $1, 'pending', jsonb_build_object('activity_anchor', 'not-a-timestamp')),
         ('gallery_expiry_warning', $2, 'pending', jsonb_build_object('activity_anchor', '2026-01-01 00:00:00+00'))`,
      [uid('malformed-bad'), uid('malformed-old')]
    );

    const cancelled = await client!.query(
      `SELECT public.cancel_stale_gallery_expiry_warnings() AS n`
    );
    expect(cancelled.rows[0].n).toBe(2);

    const reasons = await client!.query(
      `SELECT reason FROM public.email_lifecycle_queue
       WHERE campaign_key = 'gallery_expiry_warning' AND status = 'cancelled'`
    );
    expect(reasons.rows.map(r => r.reason)).toEqual([
      'gallery_expiry_anchor_changed',
      'gallery_expiry_anchor_changed',
    ]);
  });
});
