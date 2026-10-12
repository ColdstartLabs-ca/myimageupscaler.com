import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, get } from 'node:http';
import { Readable } from 'node:stream';

import * as engine from '../../../scripts/storage/r2-reference-apply.mjs';
import { loadBackupIdentity } from '../../../scripts/storage/backup-verification.mjs';
import { writeReferencePlan, runVerifyReferencesCommand, runSourceProofCommand, PLAN_FILE } from '../../../scripts/storage/verify-r2-references.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const { runReferenceApply: runReferenceApplyEngine } = engine as any;
// Existing cases run with a held fence; the fence cases below override checkFence.
const runReferenceApply = (args: AnyRow) => runReferenceApplyEngine({ checkFence: async () => true, ...args });
/* eslint-enable @typescript-eslint/no-explicit-any */

type AnyRow = Record<string, any>;

const RUN_ID = 'backup-run-2026-10-13';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SAVED_ID = '22222222-2222-4222-8222-222222222222';
const BLOG_ID = '33333333-3333-4333-8333-333333333333';
const POST_ID = '44444444-4444-4444-8444-444444444444';
const SAVED_PATH = `${USER_ID}/${SAVED_ID}.png`;
const BLOG_PATH = 'posts/bbb.jpg';
const CREATED = '2026-10-01T00:00:00.123456+00:00';
const PUBLIC_BASE = 'https://assets.myimageupscaler.com';
const SUPABASE_BLOG = `https://xqysaylskffsfwunczbd.supabase.co/storage/v1/object/public/blog-images/${BLOG_PATH}`;

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** jsonb ignores key order; emulate with a canonical string. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as AnyRow)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function writeBackupRun(root: string): string {
  const runDir = path.join(root, RUN_ID);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const row = {
    bucket: 'saved-images',
    path: SAVED_PATH,
    bytes: 11,
    sha256: 'a'.repeat(64),
    created_at: CREATED,
    updated_at: CREATED,
  };
  const rawManifest = `${JSON.stringify(row)}\n`;
  const rawChecksum = `${row.sha256}  ${row.bucket}/${row.path}\n`;
  fs.writeFileSync(path.join(runDir, 'manifest.jsonl'), rawManifest);
  fs.writeFileSync(path.join(runDir, 'manifest.sha256'), rawChecksum);
  fs.writeFileSync(
    path.join(runDir, 'backup-verification.json'),
    JSON.stringify({
      run_id: RUN_ID,
      object_count: 1,
      total_bytes: 11,
      manifest_sha256: sha256(rawManifest),
      checksum_list_sha256: sha256(rawChecksum),
      verified_at: CREATED,
    })
  );
  return runDir;
}

function savedEntry(): AnyRow {
  const before = {
    id: SAVED_ID,
    user_id: USER_ID,
    storage_path: SAVED_PATH,
    storage_backend: 'supabase',
    original_filename: 'a.png',
    file_size_bytes: 11,
    created_at: CREATED,
    updated_at: CREATED,
  };
  return {
    table: 'saved_images',
    id: SAVED_ID,
    user_id: USER_ID,
    path: SAVED_PATH,
    target_bucket: 'miu-private',
    target_key: `saved/${SAVED_PATH}`,
    before,
    after: { ...before, storage_backend: 'r2' },
  };
}

function blogImageEntry(): AnyRow {
  const before = { id: BLOG_ID, user_id: null, storage_path: BLOG_PATH, url: SUPABASE_BLOG, alt_text: 'hello' };
  return {
    table: 'blog_images',
    id: BLOG_ID,
    user_id: null,
    field: 'url',
    target_bucket: 'miu-public',
    target_key: BLOG_PATH,
    before,
    after: { ...before, url: `${PUBLIC_BASE}/${BLOG_PATH}` },
  };
}

function blogPostEntry(): AnyRow {
  const before = {
    id: POST_ID,
    user_id: null,
    featured_image_url: SUPABASE_BLOG,
    content: `![x](${SUPABASE_BLOG}) keeps 12.5`,
    title: 'Unrelated',
  };
  return {
    table: 'blog_posts',
    id: POST_ID,
    user_id: null,
    field: 'content',
    before,
    after: { ...before, featured_image_url: `${PUBLIC_BASE}/${BLOG_PATH}`, content: `![x](${PUBLIC_BASE}/${BLOG_PATH}) keeps 12.5` },
  };
}

function makeSavedEntry(index: number): AnyRow {
  const id = `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
  const storagePath = `${USER_ID}/img-${index}.png`;
  const before = {
    id,
    user_id: USER_ID,
    storage_path: storagePath,
    storage_backend: 'supabase',
    original_filename: `img-${index}.png`,
    file_size_bytes: 100,
    created_at: CREATED,
    updated_at: CREATED,
  };
  return {
    table: 'saved_images',
    id,
    user_id: USER_ID,
    path: storagePath,
    target_bucket: 'miu-private',
    target_key: `saved/${storagePath}`,
    before,
    after: { ...before, storage_backend: 'r2' },
  };
}

function makePlan(identity: AnyRow, gallery: AnyRow[], blog: AnyRow[] = []): AnyRow {
  return {
    run_id: RUN_ID,
    manifest_sha256: identity.manifestSha256,
    manifest_object_count: identity.objectCount,
    manifest_total_bytes: identity.totalBytes,
    public_base: PUBLIC_BASE,
    gallery,
    blog,
  };
}

/** A minimal in-memory DB that applies the fixed statements and the native CAS. */
class FakeDb {
  tables: Record<string, Map<string, AnyRow>> = {
    saved_images: new Map(),
    blog_images: new Map(),
    blog_posts: new Map(),
  };
  queries: AnyRow[] = [];
  snapshot: AnyRow | null = null;
  failCommitOn = 0;
  commitCount = 0;

  seed(table: string, row: AnyRow): void {
    this.tables[table].set(row.id, JSON.parse(JSON.stringify(row)));
  }

  row(table: string, id: string): any {
    const found = this.tables[table].get(id);
    return found ? JSON.parse(JSON.stringify(found)) : undefined;
  }

  private copy(): AnyRow {
    return {
      saved_images: new Map([...this.tables.saved_images].map(([k, v]) => [k, { ...v }])),
      blog_images: new Map([...this.tables.blog_images].map(([k, v]) => [k, { ...v }])),
      blog_posts: new Map([...this.tables.blog_posts].map(([k, v]) => [k, { ...v }])),
    };
  }

  query = async (sql: string, params: any[] = []) => {
    this.queries.push({ sql, params });
    if (sql.startsWith('BEGIN')) {
      this.snapshot = this.copy();
      return { rowCount: null, rows: [] };
    }
    if (sql.startsWith('ROLLBACK')) {
      if (this.snapshot) {
        this.tables = this.snapshot;
        this.snapshot = null;
      }
      return { rowCount: null, rows: [] };
    }
    if (sql.startsWith('COMMIT')) {
      this.commitCount += 1;
      if (this.failCommitOn === this.commitCount) throw new Error('simulated uncertain commit');
      this.snapshot = null;
      return { rowCount: null, rows: [] };
    }
    if (sql.startsWith('SET LOCAL')) return { rowCount: null, rows: [] };

    const table = sql.includes('saved_images') ? 'saved_images' : sql.includes('blog_images') ? 'blog_images' : 'blog_posts';
    const id = params[0];
    const before = JSON.parse(params[params.length - 1]);
    const current = this.tables[table].get(id);
    if (!current || canonicalJson(current) !== canonicalJson(before)) {
      return { rowCount: 0, rows: [] };
    }
    const updated = JSON.parse(JSON.stringify(current));
    if (table === 'saved_images') updated.storage_backend = params[1];
    else if (table === 'blog_images') updated.url = params[1];
    else {
      updated.content = params[1];
      updated.featured_image_url = params[2];
    }
    this.tables[table].set(id, updated);
    return { rowCount: 1, rows: [{ row: JSON.parse(JSON.stringify(updated)) }] };
  };
}

describe('r2-reference-apply: runReferenceApply', () => {
  let root: string;
  let runDir: string;
  let identity: AnyRow;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-apply-'));
    runDir = writeBackupRun(root);
    identity = await loadBackupIdentity(runDir);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function writePlan(plan: AnyRow) {
    const { digestPath } = await writeReferencePlan(runDir, plan);
    return { digestPath, rawSha256: sha256(JSON.stringify(plan)) };
  }

  function verifier(plan: AnyRow, rawSha256: string, overrides: AnyRow = {}) {
    return async () => ({ ok: true, missing_count: 0, source_etag_unbound: 0, source_native_fenced: true, plan, plan_sha256: rawSha256, ...overrides });
  }

  function applyCurrent(plan: AnyRow, rawSha256: string, db: FakeDb, overrides: AnyRow = {}) {
    const logs: string[] = [];
    return runReferenceApply({
      identity,
      db,
      verifyCurrent: verifier(plan, rawSha256),
      verifyFreshDatabaseBackup: async () => {},
      log: (line: string) => logs.push(line),
      ...overrides,
    });
  }

  async function run(plan: AnyRow, db: FakeDb, overrides: AnyRow = {}) {
    const { rawSha256 } = await writePlan(plan);
    return applyCurrent(plan, rawSha256, db, overrides);
  }

  function seedBase(db: FakeDb, plan: AnyRow): void {
    for (const entry of plan.gallery) db.seed('saved_images', entry.before);
    for (const entry of plan.blog) {
      db.seed(entry.table, entry.before);
    }
  }

  it('applies gallery and blog rows in bound transactions and never deletes a source', async () => {
    const plan = makePlan(identity, [savedEntry()], [blogImageEntry(), blogPostEntry()]);
    const db = new FakeDb();
    seedBase(db, plan);
    const logs: string[] = [];
    const { rawSha256 } = await writePlan(plan);

    const result = await runReferenceApply({
      identity,
      db,
      verifyCurrent: verifier(plan, rawSha256),
      verifyFreshDatabaseBackup: async () => {},
      log: (line: string) => logs.push(line),
    });

    expect(result.applied).toEqual({ gallery: 1, blog: 2, total: 3 });
    expect(result.batches).toBe(1);
    expect(db.row('saved_images', SAVED_ID).storage_backend).toBe('r2');
    expect(db.row('blog_images', BLOG_ID).url).toBe(`${PUBLIC_BASE}/${BLOG_PATH}`);
    expect(db.row('blog_posts', POST_ID).content).toBe(`![x](${PUBLIC_BASE}/${BLOG_PATH}) keeps 12.5`);
    expect(db.row('blog_posts', POST_ID).featured_image_url).toBe(`${PUBLIC_BASE}/${BLOG_PATH}`);
    expect(db.queries.some(q => q.sql.startsWith('BEGIN'))).toBe(true);
    expect(db.queries.some(q => q.sql.startsWith('COMMIT'))).toBe(true);
    expect(db.queries.every(q => !/^\s*(delete|truncate|drop|insert)\b/i.test(q.sql))).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'manifest.jsonl'))).toBe(true);
    expect(logs).toContain(`applied saved_images:${SAVED_ID}`);
  });

  it('preserves a native microsecond timestamp exactly through the CAS', async () => {
    const plan = makePlan(identity, [savedEntry()]);
    const db = new FakeDb();
    seedBase(db, plan);
    await run(plan, db);
    expect(db.row('saved_images', SAVED_ID).created_at).toBe(CREATED);
    expect(db.row('saved_images', SAVED_ID).created_at).toContain('123456');
  });

  it('rolls back the whole batch and stops on a CAS conflict', async () => {
    const gallery = [makeSavedEntry(1), makeSavedEntry(2), makeSavedEntry(3)];
    const plan = makePlan(identity, gallery);
    const db = new FakeDb();
    seedBase(db, plan);
    db.seed('saved_images', { ...gallery[1].before, original_filename: 'changed-in-db.png' });

    await expect(run(plan, db)).rejects.toThrow(/CAS failed/);
    expect(db.tables.saved_images.get(gallery[0].id)?.storage_backend).toBe('supabase');
    expect(db.tables.saved_images.get(gallery[2].id)?.storage_backend).toBe('supabase');
    expect(db.queries.some(q => q.sql.startsWith('ROLLBACK'))).toBe(true);
    expect(db.queries.some(q => q.sql.startsWith('COMMIT'))).toBe(false);
  });

  it('performs zero DB queries when the fresh database backup fails', async () => {
    const plan = makePlan(identity, [savedEntry()]);
    const db = new FakeDb();
    seedBase(db, plan);
    const order: string[] = [];
    const { rawSha256 } = await writePlan(plan);

    await expect(
      runReferenceApply({
        identity,
        db,
        verifyCurrent: async () => {
          order.push('verifyCurrent');
          return { ok: true, missing_count: 0, source_etag_unbound: 0, source_native_fenced: true, plan, plan_sha256: rawSha256 };
        },
        verifyFreshDatabaseBackup: async () => {
          order.push('verifyFreshDatabaseBackup');
          throw new Error('backup failed');
        },
      })
    ).rejects.toThrow(/backup failed/);
    expect(db.queries).toHaveLength(0);
    expect(order).toEqual(['verifyCurrent', 'verifyFreshDatabaseBackup']);
  });

  it('refuses to waive a missing pre-existing blog reference', async () => {
    const plan = makePlan(identity, [savedEntry()]);
    const db = new FakeDb();
    seedBase(db, plan);
    const { rawSha256 } = await writePlan(plan);

    await expect(
      runReferenceApply({
        identity,
        db,
        verifyCurrent: verifier(plan, rawSha256, { ok: false, missing_count: 1 }),
        verifyFreshDatabaseBackup: async () => {},
      })
    ).rejects.toThrow(/missing_count=1/);
    expect(db.queries).toHaveLength(0);
  });

  it.each(['accepted', 'other-post', 'wrong-count', 'no-details', 'unfenced'])(
    'checks the exact baseline exception before source fencing (%s)', async mode => {
      const plan = makePlan(identity, [savedEntry()]);
      const db = new FakeDb();
      seedBase(db, plan);
      const { rawSha256 } = await writePlan(plan);
      const missing = [{
        sourceId: mode === 'other-post' ? 'blog_posts:other' : 'blog_posts:b26a2f86-ec30-40d0-8a33-bca21bfb7417',
        table: 'blog_posts', field: 'content', source: '2026/01/1769887240667-tools-inline-1.webp', reason: 'missing_manifest',
      }];
      const backup = vi.fn(async () => { throw new Error('backup boundary reached'); });
      await expect(runReferenceApply({
        identity, db,
        verifyCurrent: verifier(plan, rawSha256, {
          ok: true, missing_count: mode === 'wrong-count' ? 2 : 1,
          missing: mode === 'no-details' ? undefined : missing,
          source_native_fenced: mode !== 'unfenced',
        }),
        verifyFreshDatabaseBackup: backup,
      })).rejects.toThrow(mode === 'accepted' ? /backup boundary reached/ : mode === 'unfenced' ? /Native source fencing/ : /missing_count=/);
      expect(backup).toHaveBeenCalledTimes(mode === 'accepted' ? 1 : 0);
      expect(db.queries).toHaveLength(0);
    }
  );

  it.each([1, undefined, -1])('rejects unbound or absent source proof (%s) before any database work', async (unbound) => {
    const plan = makePlan(identity, [savedEntry()]);
    const db = new FakeDb();
    seedBase(db, plan);
    const { rawSha256 } = await writePlan(plan);
    const backup = vi.fn(async () => {});
    await expect(runReferenceApply({
      identity,
      db,
      verifyCurrent: verifier(plan, rawSha256, { source_etag_unbound: unbound }),
      verifyFreshDatabaseBackup: backup,
    })).rejects.toThrow(/source eTag proof/);
    expect(backup).not.toHaveBeenCalled();
    expect(db.queries).toHaveLength(0);
  });

  it('keeps apply disabled until native source fencing is proved', async () => {
    const plan = makePlan(identity, [savedEntry()]);
    const db = new FakeDb();
    const { rawSha256 } = await writePlan(plan);
    const backup = vi.fn(async () => {});
    await expect(runReferenceApply({identity, db,
      verifyCurrent: verifier(plan, rawSha256, {source_native_fenced: false}),
      verifyFreshDatabaseBackup: backup,
    })).rejects.toThrow(/Native source fencing/);
    expect(backup).not.toHaveBeenCalled();
    expect(db.queries).toHaveLength(0);
  });

  it('refuses a current plan that differs from the frozen plan', async () => {
    const plan = makePlan(identity, [savedEntry()]);
    const db = new FakeDb();
    seedBase(db, plan);
    const { rawSha256 } = await writePlan(plan);

    await expect(
      runReferenceApply({
        identity,
        db,
        verifyCurrent: verifier(plan, rawSha256, { plan: { ...plan, extra: 1 } }),
        verifyFreshDatabaseBackup: async () => {},
      })
    ).rejects.toThrow(/does not match the frozen plan/);
    expect(db.queries).toHaveLength(0);
  });

  it('rejects a tampered or non-hex plan digest', async () => {
    const plan = makePlan(identity, [savedEntry()]);
    const db = new FakeDb();
    seedBase(db, plan);
    const { digestPath, rawSha256 } = await writePlan(plan);

    fs.rmSync(digestPath);
    fs.writeFileSync(digestPath, `${'f'.repeat(64)}\n`);
    await expect(applyCurrent(plan, rawSha256, db)).rejects.toThrow(/does not bind/);

    fs.rmSync(digestPath);
    fs.writeFileSync(digestPath, 'not-a-digest\n');
    await expect(applyCurrent(plan, rawSha256, db)).rejects.toThrow(/64-hex/);
    expect(rawSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a traversing or symlinked plan path', async () => {
    const plan = makePlan(identity, [savedEntry()]);
    const db = new FakeDb();
    seedBase(db, plan);
    const { rawSha256 } = await writePlan(plan);

    await expect(
      applyCurrent(plan, rawSha256, db, { planPath: path.join(root, 'evil.json') })
    ).rejects.toThrow(/traversal escape/);

    const outside = path.join(root, 'outside.json');
    fs.writeFileSync(outside, JSON.stringify(plan));
    const link = path.join(runDir, 'link.json');
    fs.symlinkSync(outside, link);
    await expect(applyCurrent(plan, rawSha256, db, { planPath: link })).rejects.toThrow(/Symlink escape/);
    expect(rawSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a malicious table or an extra after field before any write', async () => {
    const badTable = saveWithTable();
    const tablePlan = makePlan(identity, [badTable]);
    const tableDb = new FakeDb();
    const { rawSha256: tableSha } = await writePlan(tablePlan);
    await expect(applyCurrent(tablePlan, tableSha, tableDb)).rejects.toThrow(/unknown table/);
    expect(tableDb.queries).toHaveLength(0);

    fs.rmSync(path.join(runDir, 'r2-reference-plan.json'));
    fs.rmSync(path.join(runDir, 'r2-reference-plan.digest'));
    const entry = savedEntry();
    entry.after = { ...entry.after, role: 'admin' };
    const fieldPlan = makePlan(identity, [entry]);
    const fieldDb = new FakeDb();
    seedBase(fieldDb, fieldPlan);
    await expect(run(fieldPlan, fieldDb)).rejects.toThrow(/field set/);
    expect(fieldDb.queries).toHaveLength(0);
  });

  it.each(['lock_timeout', 'statement_timeout'])('rolls back when %s setup fails before any reference update', async setting => {
    const plan = makePlan(identity, [savedEntry()]);
    const db = new FakeDb();
    seedBase(db, plan);
    const query = db.query;
    db.query = async (sql: string, params: any[] = []) => {
      if (sql.startsWith('SET LOCAL') && sql.includes(setting)) throw new Error('timeout setup failed');
      return query(sql, params);
    };

    await expect(run(plan, db)).rejects.toThrow('timeout setup failed');
    expect(db.snapshot).toBeNull();
    expect(db.queries.at(-1)?.sql).toBe('ROLLBACK');
    expect(db.queries.some(q => /^(UPDATE|COMMIT)/.test(q.sql))).toBe(false);
    expect(db.row('saved_images', SAVED_ID).storage_backend).toBe('supabase');
  });

  it('stops after an uncertain COMMIT and never reverses committed writes', async () => {
    const gallery = Array.from({ length: 101 }, (_, index) => makeSavedEntry(index + 1));
    const plan = makePlan(identity, gallery);
    const db = new FakeDb();
    seedBase(db, plan);
    db.failCommitOn = 1;

    await expect(run(plan, db)).rejects.toThrow(/uncertain commit/);
    const updates = db.queries.filter(q => q.sql.startsWith('UPDATE'));
    expect(updates).toHaveLength(50);
    expect(db.commitCount).toBe(1);
    expect(db.queries.some(q => q.sql.startsWith('ROLLBACK'))).toBe(false);
    expect(db.tables.saved_images.get(gallery[0].id)?.storage_backend).toBe('r2');
    expect(db.tables.saved_images.get(gallery[60].id)?.storage_backend).toBe('supabase');
  });

  it('splits rows into bounded 50-row transactions', async () => {
    const gallery = Array.from({ length: 51 }, (_, index) => makeSavedEntry(index + 1));
    const plan = makePlan(identity, gallery);
    const db = new FakeDb();
    seedBase(db, plan);

    const result = await run(plan, db);
    expect(result.batches).toBe(2);
    expect(result.applied.total).toBe(51);
    expect(db.queries.filter(q => q.sql.startsWith('BEGIN'))).toHaveLength(2);
    expect(db.queries.filter(q => q.sql.startsWith('COMMIT'))).toHaveLength(2);
  });

  describe('live fence re-check before every commit', () => {
    it('requires a checkFence function before any write', async () => {
      const plan = makePlan(identity, [savedEntry()]);
      const db = new FakeDb();
      seedBase(db, plan);
      const { rawSha256 } = await writePlan(plan);
      await expect(runReferenceApplyEngine({
        identity, db, verifyCurrent: verifier(plan, rawSha256), verifyFreshDatabaseBackup: async () => {},
      })).rejects.toThrow(/checkFence/);
      expect(db.queries).toHaveLength(0);
    });

    it('checks the fence once per batch, after the updates and immediately before COMMIT', async () => {
      const plan = makePlan(identity, Array.from({ length: 51 }, (_, index) => makeSavedEntry(index + 1)));
      const db = new FakeDb();
      seedBase(db, plan);
      const events: string[] = [];
      const original = db.query;
      db.query = async (sql: string, params: any[] = []) => {
        events.push(sql.startsWith('UPDATE') ? 'UPDATE' : sql.split(' ')[0]);
        return original(sql, params);
      };
      await run(plan, db, { checkFence: async () => { events.push('FENCE'); return true; } });
      const compact = events.filter(e => ['BEGIN', 'UPDATE', 'FENCE', 'COMMIT'].includes(e)).join(',');
      expect(compact).toBe(`BEGIN,${'UPDATE,'.repeat(50)}FENCE,COMMIT,BEGIN,UPDATE,FENCE,COMMIT`);
    });

    it('rolls back the batch and stops when the fence is lost before a commit', async () => {
      const plan = makePlan(identity, Array.from({ length: 51 }, (_, index) => makeSavedEntry(index + 1)));
      const db = new FakeDb();
      seedBase(db, plan);
      let checks = 0;
      await expect(run(plan, db, { checkFence: async () => (checks += 1) === 1 })).rejects.toThrow(/fence/i);
      expect(checks).toBe(2);
      expect(db.queries.filter(q => q.sql.startsWith('COMMIT'))).toHaveLength(1);
      expect(db.queries.filter(q => q.sql.startsWith('ROLLBACK'))).toHaveLength(1);
      expect(db.row('saved_images', plan.gallery[50].id).storage_backend).toBe('supabase');
      expect(db.row('saved_images', plan.gallery[0].id).storage_backend).toBe('r2');
    });

    it('treats a throwing fence check as lost', async () => {
      const plan = makePlan(identity, [savedEntry()]);
      const db = new FakeDb();
      seedBase(db, plan);
      await expect(run(plan, db, { checkFence: async () => { throw new Error('catalog unreadable'); } })).rejects.toThrow(/catalog unreadable/);
      expect(db.queries.some(q => q.sql.startsWith('COMMIT'))).toBe(false);
      expect(db.row('saved_images', plan.gallery[0].id).storage_backend).toBe('supabase');
    });
  });

  function saveWithTable(): AnyRow {
    return { ...savedEntry(), table: 'users' };
  }
});

/**
 * Optional real PostgreSQL 17 proof of the native full-row CAS on the cached
 * Supabase image. Skipped when Docker is unavailable.
 */
const dockerAvailable = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const containerName = `miu-r2-reference-apply-${crypto.randomUUID()}`;

describe.runIf(dockerAvailable)('r2-reference-apply: real PostgreSQL 17 CAS', () => {
  let root: string;
  let runDir: string;
  let identity: AnyRow;
  let client: any;
  let connectionString: string;
  const RUN = 'backup-run-pg17';

  beforeEach(async () => {
    const { Client } = await import('pg');
    execFileSync('docker', [
      'run', '--rm', '-d', '--name', containerName,
      '-e', 'POSTGRES_PASSWORD=test', '-P', 'public.ecr.aws/supabase/postgres:17.6.1.052',
    ]);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const health = spawnSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', containerName], { encoding: 'utf8' }).stdout.trim();
      if (health === 'healthy') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const mapping = execFileSync('docker', ['port', containerName, '5432/tcp'], { encoding: 'utf8' }).trim();
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
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        storage_path TEXT NOT NULL,
        storage_backend TEXT NOT NULL DEFAULT 'supabase',
        original_filename TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-apply-pg-'));
    runDir = path.join(root, RUN);
    fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
    const manifest = `${JSON.stringify({ bucket: 'saved-images', path: SAVED_PATH, bytes: 11, sha256: 'a'.repeat(64), created_at: CREATED, updated_at: CREATED })}\n`;
    const checksum = `${'a'.repeat(64)}  saved-images/${SAVED_PATH}\n`;
    fs.writeFileSync(path.join(runDir, 'manifest.jsonl'), manifest);
    fs.writeFileSync(path.join(runDir, 'manifest.sha256'), checksum);
    fs.writeFileSync(
      path.join(runDir, 'backup-verification.json'),
      JSON.stringify({ run_id: RUN, object_count: 1, total_bytes: 11, manifest_sha256: sha256(manifest), checksum_list_sha256: sha256(checksum) })
    );
    identity = await loadBackupIdentity(runDir);
  }, 240_000);

  afterEach(async () => {
    await client?.end();
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function buildPlan(): Promise<AnyRow> {
    const { rows } = await client.query('SELECT to_jsonb(t) AS row FROM public.saved_images AS t WHERE t.id = $1', [SAVED_ID]);
    const before = rows[0].row;
    const plan = {
      run_id: RUN,
      manifest_sha256: identity.manifestSha256,
      manifest_object_count: identity.objectCount,
      manifest_total_bytes: identity.totalBytes,
      public_base: PUBLIC_BASE,
      gallery: [{
        table: 'saved_images', id: SAVED_ID, user_id: USER_ID, path: SAVED_PATH,
        target_bucket: 'miu-private', target_key: `saved/${SAVED_PATH}`,
        before, after: { ...before, storage_backend: 'r2' },
      }],
      blog: [],
    };
    await writeReferencePlan(runDir, plan);
    return plan;
  }

  it('flips the row with the native CAS, preserves microseconds and refuses a stale row', async () => {
    await client.query(
      `INSERT INTO public.saved_images(id, user_id, storage_path, original_filename, created_at)
       VALUES ($1,$2,$3,'a.png',$4::timestamptz)`,
      [SAVED_ID, USER_ID, SAVED_PATH, CREATED]
    );
    const plan = await buildPlan();
    const rawSha256 = sha256(JSON.stringify(plan));
    const result = await runReferenceApply({
      identity,
      db: client,
      verifyCurrent: async () => ({ ok: true, missing_count: 0, source_etag_unbound: 0, source_native_fenced: true, plan, plan_sha256: rawSha256 }),
      verifyFreshDatabaseBackup: async () => {},
    });
    expect(result.applied).toEqual({ gallery: 1, blog: 0, total: 1 });
    const after = await client.query('SELECT storage_backend, to_char(created_at, \'US\') AS us FROM public.saved_images WHERE id = $1', [SAVED_ID]);
    expect(after.rows[0].storage_backend).toBe('r2');
    expect(after.rows[0].us).toBe('123456');

    // Mutate the row so the frozen CAS no longer matches: the update must fail
    // and roll back, leaving the row untouched.
    await client.query('UPDATE public.saved_images SET original_filename = $2 WHERE id = $1', [SAVED_ID, 'changed.png']);
    await expect(
      runReferenceApply({
        identity,
        db: client,
        verifyCurrent: async () => ({ ok: true, missing_count: 0, source_etag_unbound: 0, source_native_fenced: true, plan, plan_sha256: rawSha256 }),
        verifyFreshDatabaseBackup: async () => {},
      })
    ).rejects.toThrow(/CAS failed/);
    const stale = await client.query('SELECT original_filename FROM public.saved_images WHERE id = $1', [SAVED_ID]);
    expect(stale.rows[0].original_filename).toBe('changed.png');
  }, 120_000);
  it('guards actual verify publication against concurrent references and same-byte native versions over HTTP', async () => {
    const { Client } = await import('pg');
    const writer = new Client({ connectionString });
    const body = Buffer.from('hello bytes');
    const etag = crypto.createHash('md5').update(body).digest('hex');
    await client.query(`
      CREATE TABLE public.blog_images(id UUID PRIMARY KEY, storage_path TEXT, url TEXT);
      CREATE TABLE public.blog_posts(id UUID PRIMARY KEY, featured_image_url TEXT, content TEXT);
      -- The cached image seeds an older Storage table; model the native version
      -- column read by production without installing any permissions or triggers.
      ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS version TEXT;
      ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS public BOOLEAN DEFAULT FALSE;
      ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit BIGINT;
      ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types TEXT[];
    `);
    await client.query("INSERT INTO storage.buckets(id, name) VALUES ('saved-images','saved-images') ON CONFLICT DO NOTHING");
    await writer.connect();
    // A second connection commits during the destination GET, after the initial snapshot.
    let mutation: () => Promise<unknown> = async () => {};
    let requests = 0;
    let serverError: unknown;
    const server = createServer(async (_request, response) => {
      requests++;
      try {
        await mutation();
        response.writeHead(200, { 'content-length': body.length });
        response.end(body);
      } catch (error) {
        serverError = error;
        response.writeHead(500); response.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const db = { query: client.query.bind(client), end: async () => {} };
    try {
      for (const mode of ['unchanged', 'insert-ref', 'edit-ref', 'delete-ref', 'source-version', 'source-added', 'stale-source', 'missing-proof', 'repeatable-read']) {
        await client.query('TRUNCATE public.saved_images, storage.objects');
        await client.query(`INSERT INTO public.saved_images VALUES ($1,$2,$3,'supabase','a.png',$4)`, [SAVED_ID, USER_ID, SAVED_PATH, CREATED]);
        await client.query(`INSERT INTO storage.objects(id,bucket_id,name,version,metadata,created_at,updated_at) VALUES ($1,'saved-images',$2,'native-v1',$3,$4,$4)`, [SAVED_ID, SAVED_PATH, { size: body.length, eTag: etag }, CREATED]);
        const caseDir = path.join(root, mode);
        fs.mkdirSync(caseDir);
        const manifest = `${JSON.stringify({ bucket: 'saved-images', path: SAVED_PATH, bytes: body.length, sha256: sha256(body), created_at: CREATED, updated_at: CREATED })}\n`;
        const checksum = `${sha256(body)}  saved-images/${SAVED_PATH}\n`;
        fs.writeFileSync(path.join(caseDir, 'manifest.jsonl'), manifest);
        fs.writeFileSync(path.join(caseDir, 'manifest.sha256'), checksum);
        fs.writeFileSync(path.join(caseDir, 'backup-verification.json'), JSON.stringify({ run_id: mode, object_count: 1, total_bytes: body.length, manifest_sha256: sha256(manifest), checksum_list_sha256: sha256(checksum) }));
        const localPath = path.join(caseDir, 'saved-images', SAVED_PATH);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, body);
        fs.writeFileSync(path.join(caseDir, 'backup-checkpoint.json'), JSON.stringify({ downloaded: {
          [`saved-images::${SAVED_PATH}`]: { version: SAVED_ID, source_version: `"${etag}"`, created_at: CREATED, updated_at: CREATED },
        } }));
        const config = { signing: { endpoint: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`, accessKeyId: 'local', secretAccessKey: 'local' }, dbConfig: {} };
        if (mode !== 'missing-proof') await runSourceProofCommand({ manifest: caseDir, config, createDb: async () => db });
        if (mode === 'stale-source') await writer.query("UPDATE storage.objects SET version = 'same-bytes-new-version'");
        if (mode === 'repeatable-read') await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        mutation = async () => {
          if (mode === 'insert-ref') return writer.query(`INSERT INTO public.saved_images VALUES ($1,$2,'new.png','r2','new.png',$3)`, [BLOG_ID, USER_ID, CREATED]);
          if (mode === 'edit-ref') return writer.query("UPDATE public.saved_images SET original_filename = 'changed.png'");
          if (mode === 'delete-ref') return writer.query('DELETE FROM public.saved_images');
          if (mode === 'source-version') return writer.query("UPDATE storage.objects SET version = 'same-bytes-new-version'");
          if (mode === 'source-added') return writer.query(`INSERT INTO storage.objects(id,bucket_id,name,version,metadata,created_at,updated_at) SELECT $1,bucket_id,'new.png','v2',metadata,created_at,updated_at FROM storage.objects`, [BLOG_ID]);
        };
        const beforeRequests = requests;
        const task = runVerifyReferencesCommand({
          manifest: caseDir, config, createDb: async () => db,
          presignGet: () => `http://127.0.0.1:${port}/verified-object`,
          // Unit setup mocks global fetch; use a real localhost HTTP stream.
          fetchFn: (url: string, init: { signal: AbortSignal }) => new Promise((resolve, reject) => {
            get(url, { signal: init.signal }, response => resolve({
              ok: response.statusCode === 200, status: response.statusCode,
              body: Readable.toWeb(response),
            })).on('error', reject);
          }),
          runner: async (_command: string, _args: string[], options: { input?: string } = {}) => options.input !== undefined
            ? options.input.trim().split('\n').map(line => `${line.replace(/^[a-f0-9]{64} {2}/, '')}: OK`).join('\n')
            : `${sha256(manifest)}  manifest.jsonl\n`,
        });
        if (mode === 'unchanged') {
          const verified = await task;
          expect(verified.result.source_native_fenced).toBe(false);
          expect(verified.result.verified_count).toBe(1);
          expect(fs.existsSync(path.join(caseDir, PLAN_FILE))).toBe(true);
        } else {
          await expect(task, mode).rejects.toThrow(/snapshot changed|source identity|source snapshot|READ COMMITTED/);
          expect(fs.existsSync(path.join(caseDir, PLAN_FILE)), mode).toBe(false);
          expect(fs.existsSync(path.join(caseDir, 'r2-reference-plan.digest')), mode).toBe(false);
        }
        expect(requests - beforeRequests, mode).toBe(['stale-source', 'missing-proof', 'repeatable-read'].includes(mode) ? 0 : 1);
        expect(serverError).toBeUndefined();
        await client.query('ROLLBACK');
        const rows = await writer.query('SELECT id, storage_backend FROM public.saved_images');
        expect(rows.rows.filter((row: AnyRow) => row.id === SAVED_ID).map((row: AnyRow) => row.storage_backend), mode).toEqual(mode === 'delete-ref' ? [] : ['supabase']);
      }
    } finally {
      await client.query('ROLLBACK');
      await writer.end();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }, 120_000);


  it('reads the bucket fence gate from real storage.buckets and pg_policies', async () => {
    const { isSourceFenced, readBucketFenceState } = await import('../../../scripts/storage/storage-bucket-fence.mjs');
    await client.query(`
      ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS public BOOLEAN DEFAULT FALSE;
      ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit BIGINT;
      ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types TEXT[];
    `);
    for (const id of ['saved-images', 'blog-images', 'upscale-inputs']) {
      await client.query('INSERT INTO storage.buckets(id, name) VALUES ($1,$1) ON CONFLICT DO NOTHING', [id]);
    }
    await client.query("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    expect(isSourceFenced(await readBucketFenceState(client))).toBe(false);
    await client.query("UPDATE storage.buckets SET file_size_limit = 1, allowed_mime_types = ARRAY['application/x-miu-storage-frozen']");
    expect(isSourceFenced(await readBucketFenceState(client))).toBe(true);
    await client.query('CREATE POLICY read_all ON storage.objects FOR SELECT TO anon USING (true)');
    expect(isSourceFenced(await readBucketFenceState(client))).toBe(true);
    await client.query('CREATE POLICY anon_insert ON storage.objects FOR INSERT TO anon WITH CHECK (true)');
    expect(isSourceFenced(await readBucketFenceState(client))).toBe(false);
    await client.query('DROP POLICY anon_insert ON storage.objects');
    await client.query('CREATE POLICY pub_all ON storage.objects FOR ALL TO public USING (true)');
    expect(isSourceFenced(await readBucketFenceState(client))).toBe(false);
    await client.query('DROP POLICY pub_all ON storage.objects');
    expect(isSourceFenced(await readBucketFenceState(client))).toBe(true);
    await client.query("UPDATE storage.buckets SET file_size_limit = 2 WHERE id = 'blog-images'");
    expect(isSourceFenced(await readBucketFenceState(client))).toBe(false);
  }, 120_000);

});
