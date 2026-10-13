import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import * as storageModule from '../../../scripts/storage/backup-and-purge.mjs';
import { parseRawJsonl } from '../../../scripts/storage/backup-verification.mjs';

afterEach(() => vi.restoreAllMocks());

it('freezes all plan fields under a raw digest and refuses overwriting the plan', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqr-plan-writer-'));
  try {
    const rows = [{ id: 'original-row', user_id: 'original-owner', path: 'user/image.png' }];
    const { manifestPath, digest } = await storageModule.writeFrozenPlan(dir, 'expire', rows);
    const raw = await fs.readFile(manifestPath, 'utf8');
    expect(parseRawJsonl(raw)).toEqual(rows);
    expect(digest).toBe(createHash('sha256').update(raw).digest('hex'));
    await expect(
      storageModule.writeFrozenPlan(dir, 'expire', [{ ...rows[0], id: 'different-row' }])
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(raw);
    const empty = await storageModule.writeFrozenPlan(dir, 'purge', []);
    expect(parseRawJsonl(await fs.readFile(empty.manifestPath, 'utf8'))).toEqual([]);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

it('preserves the supplied database password in the actual pg client', async () => {
  vi.spyOn(pg.Client.prototype, 'connect').mockResolvedValueOnce(undefined);
  const config = {
    dbHost: 'localhost',
    dbUser: 'postgres.test',
    dbPassword: 'test-only-password',
    connectionString: 'postgresql://postgres.test@localhost:5432/postgres',
  };
  const client = await storageModule.createDb(config);
  expect(client.connectionParameters.password).toBe(config.dbPassword);
  expect(client.connectionParameters.host).toBe(config.dbHost);
  expect(client.connectionParameters.user).toBe(config.dbUser);
});

// Operator scripts are plain ESM (.mjs); tests are outside the tsc project.
/* eslint-disable @typescript-eslint/no-explicit-any */

function pagedStorage(pages: any[]) {
  const calls: any[] = [];
  return {
    calls,
    from: () => ({
      list: async (dir: string, options: any) => {
        calls.push({ dir, ...options });
        return pages.shift() ?? { data: [], error: null };
      },
    }),
  };
}

describe('storage-runtime: pathExists exact lookup', () => {
  const base = 'aaa.png';

  it('does not report an absent object present after 100 prefix matches in the first page', async () => {
    const prefixMatches = Array.from({ length: 100 }, (_, i) => ({
      name: `${base}.bak-${i}`,
      id: `id-${i}`,
    }));
    const storage = pagedStorage([
      { data: prefixMatches, error: null },
      { data: [], error: null },
    ]);

    await expect(storageModule.pathExists(storage, 'saved-images', `dir/${base}`)).resolves.toBe(
      false
    );
    expect(storage.calls).toHaveLength(2);
    expect(storage.calls[0]).toMatchObject({ dir: 'dir', search: base, limit: 100, offset: 0 });
    expect(storage.calls[1]).toMatchObject({ offset: 100 });
  });

  it('finds an exact name/id match only when it appears on a later page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({
      name: `${base}.bak-${i}`,
      id: `id-${i}`,
    }));
    const storage = pagedStorage([
      { data: firstPage, error: null },
      { data: [{ name: base, id: 'real-object-id' }], error: null },
    ]);

    await expect(storageModule.pathExists(storage, 'saved-images', `dir/${base}`)).resolves.toBe(
      true
    );
  });

  it('fails closed on a storage error and on a missing inventory', async () => {
    const errored = pagedStorage([{ data: null, error: { message: 'restricted' } }]);
    await expect(storageModule.pathExists(errored, 'saved-images', `dir/${base}`)).rejects.toThrow(
      /Exact object check failed: restricted/
    );

    const noInventory = pagedStorage([{ data: null, error: null }]);
    await expect(
      storageModule.pathExists(noInventory, 'saved-images', `dir/${base}`)
    ).rejects.toThrow(/no inventory/i);
  });

  it('rejects an unsafe path before any lookup', async () => {
    const storage = pagedStorage([]);
    await expect(
      storageModule.pathExists(storage, 'saved-images', '../escape.png')
    ).rejects.toThrow(/Unsafe object path/);
    expect(storage.calls).toHaveLength(0);
  });
});

function fakeDb(options: { failOn?: string } = {}) {
  const calls: string[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      if (options.failOn && sql === options.failOn) throw new Error(`${sql} failed`);
      return { rows: [] };
    }),
  };
}

describe('storage-runtime: withDatabaseBatch', () => {
  it('begins, sets local timeouts, locks domain tables, calls back, then commits', async () => {
    const db = fakeDb();
    const callback = vi.fn(async () => ({ status: 'ok' }));

    const outcome = await storageModule.withDatabaseBatch(db, 'purge', callback);

    expect(outcome).toEqual({ status: 'ok' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(db.calls[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(db.calls).toEqual(
      expect.arrayContaining([
        "SET LOCAL lock_timeout = '5s'",
        "SET LOCAL statement_timeout = '30s'",
      ])
    );
    const lockIndex = db.calls.findIndex(sql => sql.startsWith('LOCK TABLE'));
    expect(lockIndex).toBeGreaterThan(db.calls.indexOf('BEGIN ISOLATION LEVEL READ COMMITTED'));
    expect(db.calls.indexOf('SET LOCAL lock_timeout')).toBeLessThan(lockIndex);
    expect(lockIndex).toBeLessThan(db.calls.indexOf('COMMIT'));
    expect(db.calls[db.calls.length - 1]).toBe('COMMIT');
    expect(db.calls.some(sql => sql.includes('storage.objects'))).toBe(false);
  });

  it('locks the expire domain tables including auth.sessions but never storage.objects', async () => {
    const db = fakeDb();

    await storageModule.withDatabaseBatch(db, 'expire', async () => ({ status: 'ok' }));

    const lock = db.calls.find(sql => sql.startsWith('LOCK TABLE')) ?? '';
    expect(lock).toContain('auth.users');
    expect(lock).toContain('auth.sessions');
    expect(lock).toContain('public.profiles');
    expect(lock).toContain('public.saved_images');
    expect(lock).not.toContain('storage.objects');
  });

  it('never locks auth.sessions for a purge batch', async () => {
    const db = fakeDb();

    await storageModule.withDatabaseBatch(db, 'purge', async () => ({ status: 'ok' }));

    const lock = db.calls.find(sql => sql.startsWith('LOCK TABLE')) ?? '';
    expect(lock).not.toContain('auth.sessions');
  });

  it('rolls back when the callback throws and rethrows', async () => {
    const db = fakeDb();

    await expect(
      storageModule.withDatabaseBatch(db, 'purge', async () => {
        throw new Error('callback boom');
      })
    ).rejects.toThrow('callback boom');

    expect(db.calls).toContain('ROLLBACK');
    expect(db.calls).not.toContain('COMMIT');
  });

  it('rolls back when COMMIT fails and rethrows', async () => {
    const db = fakeDb({ failOn: 'COMMIT' });

    await expect(
      storageModule.withDatabaseBatch(db, 'purge', async () => ({ status: 'ok' }))
    ).rejects.toThrow('COMMIT failed');

    expect(db.calls).toContain('ROLLBACK');
  });

  it('rolls back a non-ok outcome and returns it', async () => {
    const db = fakeDb();

    const outcome = await storageModule.withDatabaseBatch(db, 'purge', async () => ({
      status: 'error',
      error: 'objects remain',
    }));

    expect(outcome).toEqual({ status: 'error', error: 'objects remain' });
    expect(db.calls).toContain('ROLLBACK');
    expect(db.calls).not.toContain('COMMIT');
  });

  it('rejects an unknown batch kind before opening a transaction', async () => {
    const db = fakeDb();

    await expect(
      storageModule.withDatabaseBatch(db, 'nope', async () => ({ status: 'ok' }))
    ).rejects.toThrow(/Unknown batch kind/);

    expect(db.calls).not.toContain('BEGIN');
  });
});

describe('storage-runtime: gallery expiry eligibility SQL invariants', () => {
  const { INACTIVE_GALLERY_SQL, GALLERY_RECHECK_SQL } = storageModule as any;
  const cases: Array<[string, string]> = [
    ['initial gallery selection', INACTIVE_GALLERY_SQL],
    ['fresh recheck', GALLERY_RECHECK_SQL],
  ];

  it.each(cases)('%s keeps the 30-day sign-in and account-age cutoff', (_label, sql) => {
    expect(sql).toMatch(/u\.last_sign_in_at < now\(\) - interval '30 days'/);
    expect(sql).toMatch(
      /u\.last_sign_in_at IS NULL AND u\.created_at < now\(\) - interval '30 days'/
    );
  });

  it.each(cases)('%s excludes any recent image of a recently active user', (_label, sql) => {
    expect(sql).toMatch(/FROM public\.saved_images recentimage/);
    expect(sql).toMatch(/recentimage\.user_id = s\.user_id/);
    expect(sql).toMatch(/recentimage\.created_at >= now\(\) - interval '30 days'/);
  });

  it.each(cases)(
    '%s treats session refreshed_at as UTC and guards every recent session column',
    (_label, sql) => {
      expect(sql).toMatch(/FROM auth\.sessions\b/);
      expect(sql).toMatch(/sess\.refreshed_at AT TIME ZONE 'UTC' >= now\(\) - interval '30 days'/);
      expect(sql).toMatch(/sess\.created_at >= now\(\) - interval '30 days'/);
      expect(sql).toMatch(/sess\.updated_at >= now\(\) - interval '30 days'/);
    }
  );

  it.each(cases)('%s excludes saved images created within 30 days', (_label, sql) => {
    expect(sql).toMatch(/s\.created_at < now\(\) - interval '30 days'/);
  });

  it.each(cases)('%s excludes credit reservations created at or within 30 days', (_label, sql) => {
    expect(sql).toMatch(/FROM public\.processing_credit_reservations\b/);
    expect(sql).toMatch(/res\.created_at >= now\(\) - interval '30 days'/);
  });

  it.each(cases)(
    '%s exempts ever-paid users for both purchase and subscription credits',
    (_label, sql) => {
      expect(sql).toMatch(/ct\.amount > 0/);
      expect(sql).toMatch(/ct\.type IN \('purchase', 'subscription'\)/);
    }
  );
});

describe('storage-runtime: restoreGalleryObjects', () => {
  const config = { supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'service-role-key' };
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sqr-restore-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function makeRow(content: string, overrides: Record<string, any> = {}) {
    const buffer = Buffer.from(content);
    const dir = path.join(root, 'saved-images', 'user');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'photo.png'), buffer);
    return {
      id: '33333333-3333-4333-8333-333333333333',
      user_id: '11111111-1111-4111-8111-111111111111',
      bucket: 'saved-images',
      path: 'user/photo.png',
      bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      object_metadata: { mimetype: 'image/png', cacheControl: 'max-age=1234' },
      ...overrides,
    };
  }

  function existingStorage(present: boolean) {
    return {
      from: () => ({
        list: async () => ({
          data: present ? [{ name: 'photo.png', id: 'existing-id' }] : [],
          error: null,
        }),
      }),
    };
  }

  it('rehashes the local backup, then streamed-upserts with frozen headers and hash-verifies the restored bytes', async () => {
    const row = await makeRow('restored-bytes');
    const stored = Buffer.from('restored-bytes');
    const posts: any[] = [];
    const fetchFn: any = vi.fn(async (url: string, options: any = {}) => {
      if (options.method === 'POST') {
        const received: Buffer[] = [];
        for await (const chunk of options.body) received.push(Buffer.from(chunk));
        posts.push({
          url,
          headers: options.headers,
          duplex: options.duplex,
          received: Buffer.concat(received),
        });
        return { ok: true, status: 200, body: undefined };
      }
      return { ok: true, status: 200, body: Readable.toWeb(Readable.from(stored)) };
    });

    await storageModule.restoreGalleryObjects({
      config,
      storage: existingStorage(false),
      runDir: root,
      rows: [row],
      fetchFn,
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(
      `${config.supabaseUrl}/storage/v1/object/saved-images/user/photo.png`
    );
    expect(posts[0].duplex).toBe('half');
    expect(posts[0].headers['x-upsert']).toBe('false');
    expect(posts[0].headers['Content-Type']).toBe('image/png');
    expect(posts[0].headers['Cache-Control']).toBe('max-age=1234');
    expect(posts[0].received.equals(stored)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('refuses to write when the object already exists and requires frozen mimetype metadata', async () => {
    const row = await makeRow('untouched');
    const existingFetch: any = vi.fn();
    await storageModule.restoreGalleryObjects({
      config,
      storage: existingStorage(true),
      runDir: root,
      rows: [row],
      fetchFn: existingFetch,
    });
    expect(existingFetch).not.toHaveBeenCalled();

    const noMetadataFetch: any = vi.fn();
    await expect(
      storageModule.restoreGalleryObjects({
        config,
        storage: existingStorage(false),
        runDir: root,
        rows: [{ ...row, object_metadata: undefined }],
        fetchFn: noMetadataFetch,
      })
    ).rejects.toThrow(/Frozen restore metadata is required/);
    expect(noMetadataFetch).not.toHaveBeenCalled();
  });

  it('fails closed before any write when the local backup artifact is corrupted', async () => {
    const row = await makeRow('original-bytes');
    await fs.writeFile(path.join(root, 'saved-images', 'user', 'photo.png'), 'tampered');
    const fetchFn: any = vi.fn();

    await expect(
      storageModule.restoreGalleryObjects({
        config,
        storage: existingStorage(false),
        runDir: root,
        rows: [row],
        fetchFn,
      })
    ).rejects.toThrow(/Artifact verification failed/);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('aborts when the streamed upload is refused', async () => {
    const row = await makeRow('bytes');
    const fetchFn: any = vi.fn(async () => ({ ok: false, status: 500, body: undefined }));

    await expect(
      storageModule.restoreGalleryObjects({
        config,
        storage: existingStorage(false),
        runDir: root,
        rows: [row],
        fetchFn,
      })
    ).rejects.toThrow(/HTTP 500/);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects when the verified download does not match the frozen bytes', async () => {
    const row = await makeRow('bytes');
    const fetchFn: any = vi.fn(async (_url: string, options: any = {}) =>
      options.method === 'POST'
        ? { ok: true, status: 200, body: undefined }
        : {
            ok: true,
            status: 200,
            body: Readable.toWeb(Readable.from(Buffer.from('DIFFERENT-BYTES'))),
          }
    );

    await expect(
      storageModule.restoreGalleryObjects({
        config,
        storage: existingStorage(false),
        runDir: root,
        rows: [row],
        fetchFn,
      })
    ).rejects.toThrow(/hash mismatch/);
  });
});
