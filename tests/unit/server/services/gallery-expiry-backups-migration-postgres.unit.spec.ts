import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * PRD-SQR-04 verified-backup gate — SQL policy proof on a disposable
 * PostgreSQL 17 container (the cached Supabase image, matching production major
 * version). No production DB, credentials, storage, or user data are touched.
 *
 * The warning migration is applied first because this migration depends on
 * public.gallery_expiry_activity_anchor and public.gallery_expiry_notices.
 */

const dockerAvailable = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const containerName = `miu-gallery-expiry-backups-${randomUUID()}`;
let client: Client | undefined;
let connectionString = '';

const WARNING_MIGRATION = 'supabase/migrations/20261010235000_gallery_expiry_warning.sql';
const MIGRATION = 'supabase/migrations/20261011001000_gallery_expiry_verified_backups.sql';

const userIds = new Map<string, string>();
function uid(name: string): string {
  const existing = userIds.get(name);
  if (existing) return existing;
  const created = randomUUID();
  userIds.set(name, created);
  return created;
}

describe.runIf(dockerAvailable)('gallery expiry verified-backup gate on PostgreSQL 17', () => {
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
    connectionString = `postgresql://supabase_admin:test@127.0.0.1:${mapping.split(':').at(-1)}/postgres`;

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
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        storage_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
        width INTEGER NOT NULL CHECK (width > 0),
        height INTEGER NOT NULL CHECK (height > 0),
        model_used TEXT NOT NULL,
        processing_mode TEXT NOT NULL CHECK (processing_mode IN ('upscale', 'enhance', 'both', 'custom')),
        storage_backend TEXT NOT NULL DEFAULT 'supabase' CHECK (storage_backend IN ('supabase', 'r2')),
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

    await client.query(readFileSync(WARNING_MIGRATION, 'utf8'));
    await client.query(readFileSync(MIGRATION, 'utf8'));
  }, 240_000);

  afterAll(async () => {
    await client?.end();
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
  });

  beforeEach(async () => {
    await client!.query(`
      TRUNCATE public.gallery_expiry_backups, public.gallery_expiry_notices,
        public.email_lifecycle_queue, public.processing_credit_reservations,
        public.credit_transactions, public.subscriptions, public.saved_images,
        public.profiles, auth.sessions, auth.users CASCADE
    `);
  });

  async function createUser(name: string, createdDaysAgo: number, lastSignInDaysAgo: number) {
    await client!.query(
      `INSERT INTO auth.users(id, created_at, last_sign_in_at)
       VALUES ($1, now() - ($2 || ' days')::interval, now() - ($3 || ' days')::interval)`,
      [uid(name), createdDaysAgo, lastSignInDaysAgo]
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

  async function createImage(
    name: string,
    createdDaysAgo = 35,
    storageBackend = 'r2'
  ): Promise<string> {
    const created = await client!.query(
      `INSERT INTO public.saved_images
         (user_id, storage_path, original_filename, file_size_bytes, width, height, model_used, processing_mode, created_at, storage_backend)
       VALUES ($1, $2, $3, 2048, 512, 512, 'test-model', 'upscale', now() - ($4 || ' days')::interval, $5)
       RETURNING id`,
      [uid(name), `gallery/${uid(name)}/image.png`, `${name}.png`, createdDaysAgo, storageBackend]
    );
    return created.rows[0].id;
  }

  async function insertSession(name: string, refreshedDaysAgo: number) {
    await client!.query(
      `INSERT INTO auth.sessions(user_id, created_at, updated_at, refreshed_at)
       VALUES ($1, now() - interval '2 days', now() - interval '2 days',
         (now() - ($2 || ' days')::interval)::timestamp)`,
      [uid(name), refreshedDaysAgo]
    );
  }

  async function sendWarning(name: string, sentDaysAgo: number | null) {
    const anchor = (
      await client!.query(`SELECT public.gallery_expiry_activity_anchor($1)::text AS anchor`, [
        uid(name),
      ])
    ).rows[0].anchor;
    await client!.query(
      `INSERT INTO public.gallery_expiry_notices(user_id, activity_anchor, warning_sent_at)
       VALUES ($1, $2, CASE WHEN $3::text IS NULL THEN NULL ELSE now() - ($3 || ' days')::interval END)`,
      [uid(name), anchor, sentDaysAgo]
    );
  }

  async function registerBackup(
    imageId: string,
    opts: { localHoursAgo?: number; remoteHoursAgo?: number } = {}
  ) {
    const sha = createHash('sha256').update(imageId).digest('hex');
    await client!.query(
      `INSERT INTO public.gallery_expiry_backups
         (image_id, user_id, storage_path, saved_row, sha256, size_bytes, source_etag,
          archive_key, archive_etag, backup_run_id, manifest_sha256,
          local_verified_at, remote_verified_at)
       SELECT si.id, si.user_id, si.storage_path, to_jsonb(si), $2, si.file_size_bytes, '"source-etag"',
              'archive/gallery/' || si.id::text || '/' || $2, '"archive-etag"', 'run-1', repeat('a', 64),
              now() - ($3 || ' hours')::interval, now() - ($4 || ' hours')::interval
       FROM public.saved_images AS si WHERE si.id = $1`,
      [imageId, sha, opts.localHoursAgo ?? 0, opts.remoteHoursAgo ?? 0]
    );
  }

  async function createEligible(name: string): Promise<string> {
    await createUser(name, 60, 40);
    await createProfile(name);
    const imageId = await createImage(name);
    await registerBackup(imageId);
    await sendWarning(name, 8);
    return imageId;
  }

  async function claim(limit: number): Promise<Array<Record<string, unknown>>> {
    return (await client!.query(`SELECT * FROM public.claim_gallery_expiry_images($1)`, [limit]))
      .rows;
  }

  it('finalizes exactly seven days after delivery but keeps a warning one microsecond newer', async () => {
    await client!.query('BEGIN');
    try {
      const images: string[] = [];
      for (const name of ['boundary-7-exact', 'boundary-7-recent']) {
        await createUser(name, 60, 40);
        await createProfile(name);
        const image = await createImage(name);
        images.push(image);
        await registerBackup(image);
        await sendWarning(name, 7);
      }
      await client!.query(
        `UPDATE public.gallery_expiry_notices
         SET warning_sent_at = now() - interval '7 days' + interval '1 microsecond'
         WHERE user_id = $1`,
        [uid('boundary-7-recent')]
      );
      const exact = await client!.query(
        `SELECT warning_sent_at = now() - interval '7 days' AS exact
         FROM public.gallery_expiry_notices WHERE user_id = $1`,
        [uid('boundary-7-exact')]
      );
      expect(exact.rows[0].exact).toBe(true);
      const claimed = await claim(10);
      expect(claimed.map(row => row.image_id)).toEqual([images[0]]);
      const finished = await client!.query(
        `SELECT public.finish_gallery_expiry_image($1, $2) AS outcome`,
        [images[0], claimed[0].attempt_id]
      );
      expect(finished.rows[0].outcome).toBe('completed');
      const remaining = await client!.query(
        `SELECT id FROM public.saved_images WHERE id = ANY($1::uuid[])`,
        [images]
      );
      expect(remaining.rows.map(row => row.id)).toEqual([images[1]]);
    } finally {
      await client!.query('ROLLBACK');
    }
  });

  it('keeps a recent Auth sign-in even when profiles.updated_at is old', async () => {
    const image = await createEligible('old-profile-recent-signin');
    await client!.query(
      `UPDATE public.profiles SET updated_at = now() - interval '80 days' WHERE id = $1`,
      [uid('old-profile-recent-signin')]
    );
    await client!.query(
      `UPDATE auth.users SET last_sign_in_at = now() - interval '1 day' WHERE id = $1`,
      [uid('old-profile-recent-signin')]
    );
    const timestamps = await client!.query(
      `SELECT p.updated_at < now() - interval '30 days' AS old_profile,
              u.last_sign_in_at > now() - interval '2 days' AS recent_signin
       FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = $1`,
      [uid('old-profile-recent-signin')]
    );
    expect(timestamps.rows[0]).toEqual({ old_profile: true, recent_signin: true });
    expect(await claim(10)).toHaveLength(0);
    const remaining = await client!.query(`SELECT id FROM public.saved_images WHERE id = $1`, [image]);
    expect(remaining.rows.map(row => row.id)).toEqual([image]);
  });

  it('keeps a new image unchanged when saved after claim and before finalization', async () => {
    const image = await createEligible('save-after-claim');
    const claimed = await claim(10);
    expect(claimed.map(row => row.image_id)).toEqual([image]);
    const newImage = await createImage('save-after-claim', 0);
    await client!.query(
      `UPDATE public.saved_images SET storage_path = $2, original_filename = 'new-after-claim.png'
       WHERE id = $1`,
      [newImage, `${uid('save-after-claim')}/${newImage}.png`]
    );
    const before = await client!.query(
      `SELECT to_jsonb(si) AS row FROM public.saved_images si WHERE id = $1`,
      [newImage]
    );
    const finished = await client!.query(
      `SELECT public.finish_gallery_expiry_image($1, $2) AS outcome`,
      [image, claimed[0].attempt_id]
    );
    // The new save refreshes activity, so the old claim must be recovered too.
    expect(finished.rows[0].outcome).toBe('restore_required');
    const released = await client!.query(
      `SELECT public.release_gallery_expiry_image($1, $2, '"source-etag"') AS released`,
      [image, claimed[0].attempt_id]
    );
    expect(released.rows[0].released).toBe(true);
    const after = await client!.query(
      `SELECT to_jsonb(si) AS row FROM public.saved_images si WHERE id = $1`,
      [newImage]
    );
    expect(after.rows).toEqual(before.rows);
    const registry = await client!.query(
      `SELECT image_id, state FROM public.gallery_expiry_backups WHERE user_id = $1`,
      [uid('save-after-claim')]
    );
    expect(registry.rows).toEqual([{ image_id: image, state: 'ready' }]);
    const remaining = await client!.query(
      `SELECT id FROM public.saved_images WHERE user_id = $1 ORDER BY id`,
      [uid('save-after-claim')]
    );
    expect(remaining.rows.map(row => row.id).sort()).toEqual([image, newImage].sort());
    expect(await claim(10)).toHaveLength(0);
  });

  it('keeps every image when the registry is empty', async () => {
    await createUser('empty-1', 60, 40);
    await createProfile('empty-1');
    await createImage('empty-1');
    await sendWarning('empty-1', 8);

    expect(await claim(10)).toHaveLength(0);
    const images = await client!.query(`SELECT count(*)::int AS n FROM public.saved_images`);
    expect(images.rows[0].n).toBe(1);
  });

  it('keeps images whose proof is stale, future, or no longer matches the snapshot', async () => {
    await createUser('proof-stale', 60, 40);
    await createProfile('proof-stale');
    const stale = await createImage('proof-stale');
    await registerBackup(stale, { localHoursAgo: 25 });
    await sendWarning('proof-stale', 8);

    await createUser('proof-future', 60, 40);
    await createProfile('proof-future');
    const future = await createImage('proof-future');
    await registerBackup(future, { remoteHoursAgo: -1 });
    await sendWarning('proof-future', 8);

    await createUser('proof-mismatch', 60, 40);
    await createProfile('proof-mismatch');
    const mismatch = await createImage('proof-mismatch');
    await registerBackup(mismatch);
    await sendWarning('proof-mismatch', 8);
    await client!.query(`UPDATE public.saved_images SET original_filename = 'changed.png' WHERE id = $1`, [
      mismatch,
    ]);

    expect(await claim(10)).toHaveLength(0);
  });

  it('keeps active, persistent-session, paid, unsent, and recently warned users', async () => {
    await createUser('keep-session', 60, 40);
    await createProfile('keep-session');
    const sessionImage = await createImage('keep-session');
    await registerBackup(sessionImage);
    await sendWarning('keep-session', 8);
    await insertSession('keep-session', 1);

    await createUser('keep-paid', 60, 40);
    await createProfile('keep-paid', { subscription_status: 'active', subscription_tier: 'pro' });
    const paidImage = await createImage('keep-paid');
    await registerBackup(paidImage);
    await sendWarning('keep-paid', 8);

    await createUser('keep-purchase', 60, 40);
    await createProfile('keep-purchase');
    const purchaseImage = await createImage('keep-purchase');
    await registerBackup(purchaseImage);
    await sendWarning('keep-purchase', 8);
    await client!.query(
      `INSERT INTO public.credit_transactions(user_id, amount, type) VALUES ($1, 100, 'purchase')`,
      [uid('keep-purchase')]
    );

    await createUser('keep-unsent', 60, 40);
    await createProfile('keep-unsent');
    const unsentImage = await createImage('keep-unsent');
    await registerBackup(unsentImage);
    await sendWarning('keep-unsent', null);

    await createUser('keep-recent-warn', 60, 40);
    await createProfile('keep-recent-warn');
    const recentImage = await createImage('keep-recent-warn');
    await registerBackup(recentImage);
    await sendWarning('keep-recent-warn', 3);

    expect(await claim(10)).toHaveLength(0);
  });

  it('claims eligible images up to the cap and marks them deleting', async () => {
    for (let i = 0; i < 12; i += 1) {
      await createEligible(`cap-${i}`);
    }

    const claimed = await claim(999);
    expect(claimed).toHaveLength(10);
    for (const row of claimed) {
      expect(row.state).toBe('deleting');
      expect(row.attempt_id).not.toBeNull();
      expect(row.started_at).not.toBeNull();
    }

    const ready = await client!.query(
      `SELECT count(*)::int AS n FROM public.gallery_expiry_backups WHERE state = 'ready'`
    );
    expect(ready.rows[0].n).toBe(2);
  });

  it('returns restore_required and deletes nothing when the snapshot changed', async () => {
    const imageId = await createEligible('mutate-1');
    const [claimed] = await claim(10);
    expect(claimed.image_id).toBe(imageId);

    await client!.query(`UPDATE public.saved_images SET original_filename = 'tampered.png' WHERE id = $1`, [
      imageId,
    ]);

    const result = await client!.query(
      `SELECT public.finish_gallery_expiry_image($1, $2) AS outcome`,
      [imageId, claimed.attempt_id]
    );
    expect(result.rows[0].outcome).toBe('restore_required');

    const backup = await client!.query(
      `SELECT state FROM public.gallery_expiry_backups WHERE image_id = $1`,
      [imageId]
    );
    expect(backup.rows[0].state).toBe('deleting');
    const image = await client!.query(`SELECT count(*)::int AS n FROM public.saved_images WHERE id = $1`, [
      imageId,
    ]);
    expect(image.rows[0].n).toBe(1);
  });

  it('is safe against a wrong attempt, a non-owner attempt, and a double claim', async () => {
    const imageId = await createEligible('race-1');
    const [claimed] = await claim(10);

    const wrongAttempt = await client!.query(
      `SELECT public.finish_gallery_expiry_image($1, gen_random_uuid()) AS outcome`,
      [imageId]
    );
    expect(wrongAttempt.rows[0].outcome).toBe('restore_required');

    const wrongOwner = await client!.query(
      `SELECT public.finish_gallery_expiry_image(gen_random_uuid(), $1) AS outcome`,
      [claimed.attempt_id]
    );
    expect(wrongOwner.rows[0].outcome).toBe('restore_required');

    const image = await client!.query(`SELECT count(*)::int AS n FROM public.saved_images WHERE id = $1`, [
      imageId,
    ]);
    expect(image.rows[0].n).toBe(1);

    await createEligible('race-2');
    const other = new Client({ connectionString });
    await other.connect();
    try {
      await client!.query('BEGIN');
      const first = await client!.query(`SELECT * FROM public.claim_gallery_expiry_images(10)`);
      expect(first.rows).toHaveLength(1);
      const second = await other.query(`SELECT * FROM public.claim_gallery_expiry_images(10)`);
      expect(second.rows).toHaveLength(0);
    } finally {
      await client!.query('ROLLBACK');
      await other.end();
    }
  });

  it('recovers a crashed claim even when the user is now active and the proof is old', async () => {
    const imageId = await createEligible('crash-1');
    const [claimed] = await claim(10);

    await client!.query(
      `UPDATE public.gallery_expiry_backups
       SET local_verified_at = now() - interval '2 days', remote_verified_at = now() - interval '2 days',
           started_at = now() - interval '6 minutes'
       WHERE image_id = $1`,
      [imageId]
    );
    await insertSession('crash-1', 1);

    const recovered = await client!.query(`SELECT * FROM public.recover_gallery_expiry_images(10)`);
    expect(recovered.rows).toHaveLength(1);
    expect(recovered.rows[0].image_id).toBe(imageId);
    expect(recovered.rows[0].attempt_id).not.toBe(claimed.attempt_id);
    expect(recovered.rows[0].attempt_id).not.toBeNull();
    expect(new Date(recovered.rows[0].started_at).getTime()).toBeGreaterThan(
      new Date(claimed.started_at as string).getTime()
    );

    const staleFinish = await client!.query(
      `SELECT public.finish_gallery_expiry_image($1, $2) AS outcome`,
      [imageId, claimed.attempt_id]
    );
    expect(staleFinish.rows[0].outcome).toBe('restore_required');

    const staleRelease = await client!.query(
      `SELECT public.release_gallery_expiry_image($1, $2, '"etag-stale"') AS released`,
      [imageId, claimed.attempt_id]
    );
    expect(staleRelease.rows[0].released).toBe(false);
  });

  it('finalizes exactly the claimed image and keeps an unrelated image', async () => {
    await createUser('final-1', 60, 40);
    await createProfile('final-1');
    const first = await createImage('final-1');
    const second = await createImage('final-1');
    await registerBackup(first);
    await registerBackup(second);
    await sendWarning('final-1', 8);

    const claimed = await claim(10);
    expect(claimed).toHaveLength(2);

    const result = await client!.query(
      `SELECT public.finish_gallery_expiry_image($1, $2) AS outcome`,
      [first, claimed.find(row => row.image_id === first)!.attempt_id]
    );
    expect(result.rows[0].outcome).toBe('completed');

    const remaining = await client!.query(
      `SELECT id FROM public.saved_images WHERE user_id = $1`,
      [uid('final-1')]
    );
    expect(remaining.rows.map(row => row.id)).toEqual([second]);
  });

  it('releases only the matching deleting attempt without refreshing the proof', async () => {
    const imageId = await createEligible('release-1');
    const [claimed] = await claim(10);
    const before = await client!.query(
      `SELECT local_verified_at, remote_verified_at FROM public.gallery_expiry_backups WHERE image_id = $1`,
      [imageId]
    );

    const wrong = await client!.query(
      `SELECT public.release_gallery_expiry_image($1, gen_random_uuid(), '"etag-x"') AS released`,
      [imageId]
    );
    expect(wrong.rows[0].released).toBe(false);

    const released = await client!.query(
      `SELECT public.release_gallery_expiry_image($1, $2, '"etag-restored"') AS released`,
      [imageId, claimed.attempt_id]
    );
    expect(released.rows[0].released).toBe(true);

    const after = await client!.query(
      `SELECT state, source_etag, attempt_id, local_verified_at, remote_verified_at
       FROM public.gallery_expiry_backups WHERE image_id = $1`,
      [imageId]
    );
    expect(after.rows[0]).toMatchObject({ state: 'ready', source_etag: '"etag-restored"', attempt_id: null });
    expect(after.rows[0].local_verified_at.toISOString()).toBe(
      before.rows[0].local_verified_at.toISOString()
    );
    expect(after.rows[0].remote_verified_at.toISOString()).toBe(
      before.rows[0].remote_verified_at.toISOString()
    );
  });

  it('rejects a registry row with omitted verification timestamps', async () => {
    await createUser('no-timestamps', 60, 40);
    await createProfile('no-timestamps');
    const imageId = await createImage('no-timestamps');
    const sha = createHash('sha256').update(imageId).digest('hex');
    await expect(
      client!.query(
        `INSERT INTO public.gallery_expiry_backups
           (image_id, user_id, storage_path, saved_row, sha256, size_bytes, source_etag,
            archive_key, archive_etag, backup_run_id, manifest_sha256)
         SELECT si.id, si.user_id, si.storage_path, to_jsonb(si), $2, si.file_size_bytes, '"source-etag"',
                'archive/gallery/' || si.id::text || '/' || $2, '"archive-etag"', 'run-1', repeat('a', 64)
         FROM public.saved_images AS si WHERE si.id = $1`,
        [imageId, sha]
      )
    ).rejects.toThrow(/local_verified_at/);
  });

  it('rejects a malformed snapshot that is not an object or misses required keys', async () => {
    await createUser('bad-snapshot', 60, 40);
    await createProfile('bad-snapshot');
    const imageId = await createImage('bad-snapshot');
    const sha = createHash('sha256').update(imageId).digest('hex');
    await expect(
      client!.query(
        `INSERT INTO public.gallery_expiry_backups
           (image_id, user_id, storage_path, saved_row, sha256, size_bytes, source_etag,
            archive_key, archive_etag, backup_run_id, manifest_sha256,
            local_verified_at, remote_verified_at)
         SELECT si.id, si.user_id, si.storage_path, '[]'::jsonb, $2, si.file_size_bytes, '"source-etag"',
                'archive/gallery/' || si.id::text || '/' || $2, '"archive-etag"', 'run-1', repeat('a', 64),
                now(), now()
         FROM public.saved_images AS si WHERE si.id = $1`,
        [imageId, sha]
      )
    ).rejects.toThrow(/gallery_expiry_backups_snapshot_matches/);

    await expect(
      client!.query(
        `INSERT INTO public.gallery_expiry_backups
           (image_id, user_id, storage_path, saved_row, sha256, size_bytes, source_etag,
            archive_key, archive_etag, backup_run_id, manifest_sha256,
            local_verified_at, remote_verified_at)
         SELECT si.id, si.user_id, si.storage_path,
                jsonb_build_object('id', si.id::text, 'user_id', si.user_id::text, 'storage_path', si.storage_path),
                $2, si.file_size_bytes, '"source-etag"',
                'archive/gallery/' || si.id::text || '/' || $2, '"archive-etag"', 'run-1', repeat('a', 64),
                now(), now()
         FROM public.saved_images AS si WHERE si.id = $1`,
        [imageId, sha]
      )
    ).rejects.toThrow(/gallery_expiry_backups_snapshot_matches/);
  });

  it('cannot claim an image whose owner has no profile', async () => {
    await createUser('no-profile', 60, 40);
    const imageId = await createImage('no-profile');
    await registerBackup(imageId);
    await sendWarning('no-profile', 8);

    expect(await claim(10)).toHaveLength(0);
  });

  it('cannot claim an image that is still on the legacy backend', async () => {
    await createUser('legacy-backend', 60, 40);
    await createProfile('legacy-backend');
    const imageId = await createImage('legacy-backend');
    await registerBackup(imageId);
    await sendWarning('legacy-backend', 8);
    await client!.query(`UPDATE public.saved_images SET storage_backend = 'supabase' WHERE id = $1`, [
      imageId,
    ]);

    expect(await claim(10)).toHaveLength(0);
  });

  it('rejects an empty ETag on release', async () => {
    const imageId = await createEligible('empty-etag');
    const [claimed] = await claim(10);

    await expect(
      client!.query(`SELECT public.release_gallery_expiry_image($1, $2, '') AS released`, [
        imageId,
        claimed.attempt_id,
      ])
    ).rejects.toThrow(/gallery_expiry_backups_source_etag_format/);
  });

  it('revokes table and RPC access from public, anon and authenticated', async () => {
    const result = await client!.query(`
      SELECT
        has_table_privilege('service_role', 'public.gallery_expiry_backups', 'SELECT') AS svc_select,
        has_table_privilege('service_role', 'public.gallery_expiry_backups', 'INSERT') AS svc_insert,
        has_table_privilege('service_role', 'public.gallery_expiry_backups', 'UPDATE') AS svc_update,
        has_table_privilege('service_role', 'public.gallery_expiry_backups', 'DELETE') AS svc_delete,
        has_table_privilege('anon', 'public.gallery_expiry_backups', 'SELECT') AS anon_select,
        has_table_privilege('authenticated', 'public.gallery_expiry_backups', 'SELECT') AS authed_select,
        has_function_privilege('anon', 'public.claim_gallery_expiry_images(integer)', 'EXECUTE') AS claim_anon,
        has_function_privilege('authenticated', 'public.finish_gallery_expiry_image(uuid,uuid)', 'EXECUTE') AS finish_authed
    `);
    expect(result.rows[0]).toMatchObject({
      svc_select: true,
      svc_insert: true,
      svc_update: true,
      svc_delete: false,
      anon_select: false,
      authed_select: false,
      claim_anon: false,
      finish_authed: false,
    });
  });

  it.each(['REPEATABLE READ', 'SERIALIZABLE'])(
    'fails closed under %s isolation and deletes nothing',
    async isolation => {
      const imageId = await createEligible('isolation-fail');
      const [claimed] = await claim(10);
      expect(claimed.image_id).toBe(imageId);

      const isolated = new Client({ connectionString });
      await isolated.connect();
      try {
        await isolated.query(`BEGIN ISOLATION LEVEL ${isolation}`);
        await expect(
          isolated.query(`SELECT public.finish_gallery_expiry_image($1, $2) AS outcome`, [
            imageId,
            claimed.attempt_id,
          ])
        ).rejects.toThrow(/requires READ COMMITTED/);
      } finally {
        await isolated.query('ROLLBACK');
      }

      const image = await isolated.query(
        `SELECT count(*)::int AS n FROM public.saved_images WHERE id = $1`,
        [imageId]
      );
      const backup = await isolated.query(
        `SELECT state FROM public.gallery_expiry_backups WHERE image_id = $1`,
        [imageId]
      );
      await isolated.end();

      expect(image.rows[0].n).toBe(1);
      expect(backup.rows[0].state).toBe('deleting');
    }
  );
});
