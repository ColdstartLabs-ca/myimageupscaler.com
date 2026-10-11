import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * PRD-SQR-02 R2 cutover gap — SQL proof on a disposable PostgreSQL 17 container
 * (the cached Supabase image, matching production major version). No production
 * DB, credentials, storage, or user data are touched.
 *
 * The migration must default every existing row and every old-deployment insert
 * to `supabase`, accept an explicit `r2` write, and reject any other value. A row
 * is flipped to `r2` only later by the operator migration, never here.
 */

const dockerAvailable = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const containerName = `miu-gallery-storage-backend-${randomUUID()}`;
const MIGRATION = 'supabase/migrations/20261011002000_saved_images_storage_backend.sql';

let client: Client | undefined;
let connectionString: string;

describe.runIf(dockerAvailable)('saved_images storage_backend migration on PostgreSQL 17', () => {
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(readFileSync(MIGRATION, 'utf8'));
    await client.query(
      readFileSync('supabase/migrations/20261011003000_gallery_legacy_deletions.sql', 'utf8')
    );
  }, 240_000);

  afterAll(async () => {
    await client?.end();
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
  });

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await client!.query(`INSERT INTO auth.users(id) VALUES ($1)`, [id]);
    return id;
  }

  async function insertLegacy(
    userId: string,
    storagePath = `${userId}/image.png`
  ): Promise<string> {
    const row = await client!.query(
      `INSERT INTO public.saved_images
         (user_id, storage_path, original_filename, file_size_bytes, width, height, model_used, processing_mode)
       VALUES ($1, $2, 'image.png', 2048, 512, 512, 'test-model', 'upscale')
       RETURNING id`,
      [userId, storagePath]
    );
    return row.rows[0].id;
  }

  it('adds a NOT NULL storage_backend column defaulting to supabase', async () => {
    const result = await client!.query(`
      SELECT column_default, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'saved_images'
        AND column_name = 'storage_backend'
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].is_nullable).toBe('NO');
    expect(result.rows[0].data_type).toBe('text');
    expect(result.rows[0].column_default).toContain('supabase');
  });

  it('defaults an insert that omits the backend to supabase (old deployment)', async () => {
    const userId = await createUser();
    const imageId = await insertLegacy(userId);

    const stored = await client!.query(
      `SELECT storage_backend FROM public.saved_images WHERE id = $1`,
      [imageId]
    );
    expect(stored.rows[0].storage_backend).toBe('supabase');
  });

  it('accepts an explicit r2 write', async () => {
    const userId = await createUser();
    const row = await client!.query(
      `INSERT INTO public.saved_images
         (user_id, storage_path, original_filename, file_size_bytes, width, height, model_used, processing_mode, storage_backend)
       VALUES ($1, $2, 'r2.png', 2048, 512, 512, 'test-model', 'upscale', 'r2')
       RETURNING storage_backend`,
      [userId, `${userId}/r2.png`]
    );
    expect(row.rows[0].storage_backend).toBe('r2');
  });

  it('rejects an unknown backend at the database level', async () => {
    const userId = await createUser();
    await expect(
      client!.query(
        `INSERT INTO public.saved_images
           (user_id, storage_path, original_filename, file_size_bytes, width, height, model_used, processing_mode, storage_backend)
         VALUES ($1, $2, 'bad.png', 2048, 512, 512, 'test-model', 'upscale', 'gcs')`,
        [userId, `${userId}/bad.png`]
      )
    ).rejects.toThrow();
  });

  it('rejects a NULL backend', async () => {
    const userId = await createUser();
    await expect(
      client!.query(
        `INSERT INTO public.saved_images
           (user_id, storage_path, original_filename, file_size_bytes, width, height, model_used, processing_mode, storage_backend)
         VALUES ($1, $2, 'null.png', 2048, 512, 512, 'test-model', 'upscale', NULL)`,
        [userId, `${userId}/null.png`]
      )
    ).rejects.toThrow();
  });

  it('keeps existing rows on supabase and never rewrites them', async () => {
    const userId = await createUser();
    const imageId = await insertLegacy(userId);
    const before = await client!.query(
      `SELECT storage_path, original_filename FROM public.saved_images WHERE id = $1`,
      [imageId]
    );

    const after = await client!.query(
      `SELECT storage_backend, storage_path, original_filename FROM public.saved_images WHERE id = $1`,
      [imageId]
    );
    expect(after.rows[0].storage_backend).toBe('supabase');
    expect(after.rows[0].storage_path).toBe(before.rows[0].storage_path);
    expect(after.rows[0].original_filename).toBe(before.rows[0].original_filename);
  });
  it('atomically retains the complete native legacy row in a private deletion journal', async () => {
    const userId = await createUser();
    const imageId = await insertLegacy(userId);
    await client!.query(
      `UPDATE public.saved_images SET created_at = '2026-08-01 12:00:00.123456+00' WHERE id = $1`,
      [imageId]
    );
    const before = await client!.query(
      'SELECT to_jsonb(si) AS snapshot FROM public.saved_images si WHERE id = $1',
      [imageId]
    );
    const result = await client!.query(
      'SELECT public.delete_legacy_gallery_image($1, $2, $3) AS deleted',
      [userId, imageId, `${userId}/image.png`]
    );
    expect(result.rows[0].deleted).toBe(true);
    expect(
      (await client!.query('SELECT id FROM public.saved_images WHERE id = $1', [imageId])).rows
    ).toHaveLength(0);
    const journal = await client!.query(
      'SELECT image_snapshot FROM public.gallery_legacy_deletions WHERE image_id = $1',
      [imageId]
    );
    expect(journal.rows[0].image_snapshot).toEqual(before.rows[0].snapshot);
  });

  it('does not delete or journal a row whose backend or path changed', async () => {
    const userId = await createUser();
    const imageId = await insertLegacy(userId);
    await client!.query(`UPDATE public.saved_images SET storage_backend = 'r2' WHERE id = $1`, [
      imageId,
    ]);
    expect(
      (
        await client!.query('SELECT public.delete_legacy_gallery_image($1, $2, $3) AS deleted', [
          userId,
          imageId,
          `${userId}/image.png`,
        ])
      ).rows[0].deleted
    ).toBe(false);
    await client!.query(
      `UPDATE public.saved_images SET storage_backend = 'supabase', storage_path = 'changed.png' WHERE id = $1`,
      [imageId]
    );
    expect(
      (
        await client!.query('SELECT public.delete_legacy_gallery_image($1, $2, $3) AS deleted', [
          userId,
          imageId,
          `${userId}/image.png`,
        ])
      ).rows[0].deleted
    ).toBe(false);
    expect(
      (await client!.query('SELECT id FROM public.saved_images WHERE id = $1', [imageId])).rows
    ).toHaveLength(1);
    expect(
      (
        await client!.query(
          'SELECT image_id FROM public.gallery_legacy_deletions WHERE image_id = $1',
          [imageId]
        )
      ).rows
    ).toHaveLength(0);
  });

  it('rolls back the row deletion if its durable journal cannot be written', async () => {
    const userId = await createUser();
    const imageId = await insertLegacy(userId);
    await client!.query(
      `INSERT INTO public.gallery_legacy_deletions(image_id, user_id, storage_path, image_snapshot) VALUES ($1, $2, 'previous.png', '{}'::jsonb)`,
      [imageId, userId]
    );
    await expect(
      client!.query('SELECT public.delete_legacy_gallery_image($1, $2, $3)', [
        userId,
        imageId,
        `${userId}/image.png`,
      ])
    ).rejects.toThrow(/duplicate key/);
    expect(
      (await client!.query('SELECT id FROM public.saved_images WHERE id = $1', [imageId])).rows
    ).toHaveLength(1);
  });

  it('rejects another owner and is unavailable to public client roles', async () => {
    const userId = await createUser();
    const otherUser = await createUser();
    const imageId = await insertLegacy(userId);
    expect(
      (
        await client!.query('SELECT public.delete_legacy_gallery_image($1, $2, $3) AS deleted', [
          otherUser,
          imageId,
          `${userId}/image.png`,
        ])
      ).rows[0].deleted
    ).toBe(false);
    for (const role of ['anon', 'authenticated']) {
      const permissions = await client!.query(
        `SELECT has_function_privilege($1, 'public.delete_legacy_gallery_image(uuid,uuid,text)', 'EXECUTE') AS execute, has_table_privilege($1, 'public.gallery_legacy_deletions', 'SELECT') AS read`,
        [role]
      );
      expect(permissions.rows[0]).toEqual({ execute: false, read: false });
    }
    const service = await client!.query(
      `SELECT has_function_privilege('service_role', 'public.delete_legacy_gallery_image(uuid,uuid,text)', 'EXECUTE') AS execute, has_table_privilege('service_role', 'public.gallery_legacy_deletions', 'INSERT') AS insert`
    );
    expect(service.rows[0]).toEqual({ execute: true, insert: false });
  });

  it.each(['storage_backend', 'storage_path'])(
    'rechecks %s after waiting for a concurrent update',
    async column => {
      const userId = await createUser();
      const imageId = await insertLegacy(userId);
      const updater = new Client({ connectionString });
      const deleter = new Client({ connectionString });
      await updater.connect();
      await deleter.connect();
      let deletion: Promise<unknown> | undefined;
      try {
        await updater.query('BEGIN');
        await updater.query(`UPDATE public.saved_images SET ${column} = $1 WHERE id = $2`, [
          column === 'storage_backend' ? 'r2' : 'new-path.png',
          imageId,
        ]);
        await deleter.query(`SET statement_timeout = '5s'`);
        const pid = (await deleter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        deletion = deleter.query(
          'SELECT public.delete_legacy_gallery_image($1, $2, $3) AS deleted',
          [userId, imageId, `${userId}/image.png`]
        );
        let waiting = false;
        for (let i = 0; i < 100; i += 1) {
          const state = await client!.query(
            `SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`,
            [pid]
          );
          if (state.rows[0]?.wait_event_type === 'Lock') {
            waiting = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
        await updater.query('COMMIT');
        expect(((await deletion) as { rows: { deleted: boolean }[] }).rows[0].deleted).toBe(false);
        expect(
          (await client!.query('SELECT id FROM public.saved_images WHERE id = $1', [imageId])).rows
        ).toHaveLength(1);
        expect(
          (
            await client!.query(
              'SELECT image_id FROM public.gallery_legacy_deletions WHERE image_id = $1',
              [imageId]
            )
          ).rows
        ).toHaveLength(0);
      } finally {
        await updater.query('ROLLBACK');
        await deletion?.catch(() => undefined);
        await updater.end();
        await deleter.end();
      }
    }
  );

  it('preserves cleanup references when account deletion cascades to legacy images', async () => {
    const userId = await createUser();
    const imageId = await insertLegacy(userId);
    await client!.query('DELETE FROM auth.users WHERE id = $1', [userId]);
    expect(
      (await client!.query('SELECT id FROM public.saved_images WHERE id = $1', [imageId])).rows
    ).toHaveLength(0);
    const journal = await client!.query(
      'SELECT user_id, storage_path FROM public.gallery_legacy_deletions WHERE image_id = $1',
      [imageId]
    );
    expect(journal.rows[0]).toEqual({ user_id: userId, storage_path: `${userId}/image.png` });
  });
});
