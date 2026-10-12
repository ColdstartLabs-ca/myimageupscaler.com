import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as executionModule from '../../../scripts/storage/backup-and-purge.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  runSourceDelete,
  loadSourceDeletePlan,
  isSourceDeleteEligible,
  classifySourceDelta,
  loadFencedSourceRows,
  makeNativeVersionStorageActions,
  withDatabaseBatch,
  SOURCE_RECHECK_SQL,
  INPUT_BUCKET,
  GALLERY_BUCKET,
  BLOG_BUCKET,
} = executionModule as any;

type AnyRow = Record<string, any>;

const RUN_ID = 'run-2026-10-12';
const OLD = '2000-01-01T00:00:00.000Z';
const VERSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const sha256 = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const md5 = (value: Buffer) => crypto.createHash('md5').update(value).digest('hex');
const idFor = (index: number) => `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`;

function artifact(bucket: string, objectPath: string, content: string): AnyRow {
  const buffer = Buffer.from(content);
  return { bucket, path: objectPath, bytes: buffer.length, sha256: sha256(buffer), created_at: OLD, updated_at: OLD, buffer };
}

/** A complete frozen run: manifest, receipt, source proof and the R2 copy receipt. */
function makeRun(root: string, objects: AnyRow[], options: { receipt?: (rows: AnyRow[]) => AnyRow[]; withReceipt?: boolean } = {}) {
  const runDir = path.join(root, RUN_ID);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const rows = objects.map(object => {
    const target = path.join(runDir, object.bucket, object.path);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, object.buffer);
    return { bucket: object.bucket, path: object.path, bytes: object.bytes, sha256: object.sha256, created_at: OLD, updated_at: OLD, db_reference: false };
  });
  const rawManifest = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
  const rawChecksum = rows.map(row => `${row.sha256}  ${row.bucket}/${row.path}`).join('\n') + '\n';
  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  fs.writeFileSync(path.join(runDir, 'manifest.jsonl'), rawManifest);
  fs.writeFileSync(path.join(runDir, 'manifest.sha256'), rawChecksum);
  fs.writeFileSync(path.join(runDir, 'backup-verification.json'), JSON.stringify({
    run_id: RUN_ID, object_count: rows.length, total_bytes: totalBytes, manifest_sha256: sha256(rawManifest),
    checksum_list_sha256: sha256(rawChecksum), verified_at: OLD,
  }));
  const downloaded: AnyRow = {};
  const proofObjects = objects.map((object, index) => {
    const key = `${object.bucket}::${object.path}`;
    downloaded[key] = { version: idFor(index), created_at: OLD, updated_at: OLD };
    return {
      bucket: object.bucket, path: object.path,
      source: {
        id: idFor(index), bucket_id: object.bucket, name: object.path, version: VERSION, created_at: OLD, updated_at: OLD,
        archived_at: null, is_versioned: false, is_delete_marker: false,
        metadata: { size: object.bytes, eTag: md5(object.buffer) },
      },
    };
  });
  fs.writeFileSync(path.join(runDir, 'backup-checkpoint.json'), JSON.stringify({ downloaded }));
  const rawProof = JSON.stringify({ manifest_sha256: sha256(rawManifest), captured_at: OLD, objects: proofObjects });
  fs.writeFileSync(path.join(runDir, 'source-object-proof.json'), rawProof);
  fs.writeFileSync(path.join(runDir, 'source-object-proof.digest'), `${sha256(rawProof)}\n`);
  if (options.withReceipt !== false) {
    const receiptObjects = rows.map(row => ({
      source_bucket: row.bucket, source_path: row.path,
      target_bucket: row.bucket === BLOG_BUCKET ? 'miu-public' : 'miu-private', target_key: row.path,
      sha256: row.sha256, bytes: row.bytes,
    }));
    fs.writeFileSync(path.join(runDir, 'r2-migration-receipt.json'), JSON.stringify({
      run_id: RUN_ID, manifest_sha256: sha256(rawManifest), plan_sha256: 'f'.repeat(64),
      object_count: rows.length, total_bytes: totalBytes,
      objects: (options.receipt ?? (x => x))(receiptObjects), completed_at: OLD,
    }));
  }
  return { runDir, rows, proofObjects };
}

function makeRunner(mode = 'ok') {
  return vi.fn(async (command: string, args: string[], options: AnyRow = {}) => {
    if (command === 'ssh' && args[1].includes('sha256sum -c -')) {
      if (mode === 'failed') return 'FAILED\n';
      return (options.input ?? '').split('\n').filter(Boolean)
        .map((line: string) => `${line.replace(/^[0-9a-f]{64} {2}/, '')}: OK`).join('\n');
    }
    if (command === 'ssh' && args[1].includes('manifest.jsonl')) return `${mode === 'mismatch' ? '0'.repeat(64) : (runner as AnyRow).manifest}  manifest.jsonl\n`;
    return '';
  });
}
const runner: AnyRow = { manifest: '' };

describe('source-delete: plan from the frozen manifest and the R2 copy receipt', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-srcdel-plan-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('lists every manifest object of all three buckets whose R2 hash matched', async () => {
    const run = makeRun(root, [
      artifact(INPUT_BUCKET, 'u/a.png', 'a'), artifact(GALLERY_BUCKET, 'u/b.png', 'bb'), artifact(BLOG_BUCKET, '2026/c.webp', 'ccc'),
    ]);
    const plan = await loadSourceDeletePlan({ backupRunDir: run.runDir });
    expect(plan.kind).toBe('source-delete');
    expect(plan.rows.map((row: AnyRow) => `${row.bucket}/${row.path}`)).toEqual(['upscale-inputs/u/a.png', 'saved-images/u/b.png', 'blog-images/2026/c.webp']);
    expect(Object.isFrozen(plan.rows)).toBe(true);
    expect(plan.planSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(['hash', 'bytes', 'missing', 'extra'])('fails closed when the R2 receipt differs (%s)', async mode => {
    const run = makeRun(root, [artifact(GALLERY_BUCKET, 'u/b.png', 'bb')], {
      receipt: rows => {
        if (mode === 'hash') return [{ ...rows[0], sha256: '0'.repeat(64) }];
        if (mode === 'bytes') return [{ ...rows[0], bytes: 99 }];
        if (mode === 'missing') return [];
        return [...rows, { ...rows[0], source_path: 'u/other.png' }];
      },
    });
    await expect(loadSourceDeletePlan({ backupRunDir: run.runDir })).rejects.toThrow(/receipt|R2/i);
  });

  it('fails when the run has no R2 copy receipt', async () => {
    const run = makeRun(root, [artifact(GALLERY_BUCKET, 'u/b.png', 'bb')], { withReceipt: false });
    await expect(loadSourceDeletePlan({ backupRunDir: run.runDir })).rejects.toThrow();
  });
});

describe('source-delete: eligibility', () => {
  it('uses the input rules for inputs and the source-reference flag elsewhere', () => {
    const idle = { gallery_reference: false, nonterminal_reservation_reference: false, nonterminal_job_reference: false, reservation_output_reference: false, job_output_reference: false };
    expect(isSourceDeleteEligible(INPUT_BUCKET, { ...idle, created_at: OLD, updated_at: OLD })).toBe(true);
    expect(isSourceDeleteEligible(INPUT_BUCKET, { ...idle, created_at: new Date().toISOString(), updated_at: OLD })).toBe(false);
    expect(isSourceDeleteEligible(GALLERY_BUCKET, { source_reference: false })).toBe(true);
    expect(isSourceDeleteEligible(GALLERY_BUCKET, { source_reference: true })).toBe(false);
    expect(isSourceDeleteEligible(BLOG_BUCKET, { source_reference: false })).toBe(true);
    expect(isSourceDeleteEligible(BLOG_BUCKET, {})).toBe(false);
    expect(isSourceDeleteEligible('other-bucket', { source_reference: false })).toBe(false);
  });
});

describe('source-delete: runSourceDelete', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-srcdel-run-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  async function setup(objects: AnyRow[]) {
    const run = makeRun(root, objects);
    const plan = await loadSourceDeletePlan({ backupRunDir: run.runDir });
    runner.manifest = plan.identity.manifestSha256;
    const present = new Set(objects.map(object => `${object.bucket}::${object.path}`));
    const calls: string[] = [];
    const deps = {
      plan, confirm: true, runner: makeRunner(),
      checkFence: vi.fn(async () => true),
      withLockedBatch: vi.fn(async (fn: any) => { calls.push('lock'); return fn(); }),
      listExisting: vi.fn(async (bucket: string, paths: string[]) => paths.filter(p => present.has(`${bucket}::${p}`))),
      checkStillEligible: vi.fn(async (bucket: string, paths: string[]) => paths.map(p => ({ path: p, source_reference: false, created_at: OLD, updated_at: OLD }))),
      removeObjects: vi.fn(async (bucket: string, paths: string[]) => { calls.push(`remove:${bucket}:${paths.length}`); for (const p of paths) present.delete(`${bucket}::${p}`); }),
    };
    return { run, plan, deps, calls, present };
  }

  it('refuses without --confirm and touches nothing', async () => {
    const { deps } = await setup([artifact(GALLERY_BUCKET, 'u/a.png', 'a')]);
    const result = await runSourceDelete({ ...deps, confirm: false });
    expect(result.status).toBe('refused');
    expect(deps.checkFence).not.toHaveBeenCalled();
    expect(deps.removeObjects).not.toHaveBeenCalled();
    expect(deps.withLockedBatch).not.toHaveBeenCalled();
  });

  it('refuses a batch when the live fence is not held, before any listing or delete', async () => {
    const { deps } = await setup([artifact(GALLERY_BUCKET, 'u/a.png', 'a')]);
    deps.checkFence.mockResolvedValue(false);
    const result = await runSourceDelete(deps);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/fence/i);
    expect(deps.listExisting).not.toHaveBeenCalled();
    expect(deps.removeObjects).not.toHaveBeenCalled();
  });

  it('treats a throwing fence check as unfenced', async () => {
    const { deps } = await setup([artifact(GALLERY_BUCKET, 'u/a.png', 'a')]);
    deps.checkFence.mockRejectedValue(new Error('catalog unreadable'));
    const result = await runSourceDelete(deps);
    expect(result.status).toBe('error');
    expect(deps.removeObjects).not.toHaveBeenCalled();
  });

  it('deletes all three buckets in batches of at most 50 and checks the fence at the start of each batch', async () => {
    const objects = [
      ...Array.from({ length: 51 }, (_, index) => artifact(GALLERY_BUCKET, `u/${index}.png`, `g${index}`)),
      artifact(BLOG_BUCKET, '2026/c.webp', 'c'),
      artifact(INPUT_BUCKET, `${idFor(1)}/${idFor(2)}.png`, 'i'),
    ];
    const { deps, calls } = await setup(objects);
    const result = await runSourceDelete(deps);
    expect(result.status).toBe('ok');
    expect(result.deleted).toHaveLength(53);
    expect(result.batches).toBe(4);
    expect(deps.checkFence).toHaveBeenCalledTimes(4);
    expect(calls.filter(call => call.startsWith('remove'))).toEqual([
      'remove:upscale-inputs:1', 'remove:saved-images:50', 'remove:saved-images:1', 'remove:blog-images:1',
    ]);
    expect(deps.removeObjects.mock.calls.every(([, paths]: any) => paths.length <= 50)).toBe(true);
  });

  it('keeps objects that are still referenced from the source or have no live row', async () => {
    const { deps, present } = await setup([artifact(GALLERY_BUCKET, 'u/ref.png', 'a'), artifact(GALLERY_BUCKET, 'u/free.png', 'b'), artifact(BLOG_BUCKET, 'x.webp', 'c')]);
    deps.checkStillEligible.mockImplementation(async (bucket: string, paths: string[]) => paths
      .filter(p => p !== 'x.webp')
      .map(p => ({ path: p, source_reference: p === 'u/ref.png' })));
    const result = await runSourceDelete(deps);
    expect(result.status).toBe('ok');
    expect(result.deleted).toEqual(['saved-images::u/free.png']);
    expect(result.dropped.sort()).toEqual(['blog-images::x.webp', 'saved-images::u/ref.png']);
    expect(present.has('saved-images::u/ref.png')).toBe(true);
    expect(present.has('blog-images::x.webp')).toBe(true);
  });

  it('stops at the first failed batch and never starts the next', async () => {
    const objects = Array.from({ length: 60 }, (_, index) => artifact(GALLERY_BUCKET, `u/${index}.png`, `g${index}`));
    const { deps } = await setup(objects);
    deps.removeObjects.mockRejectedValue(new Error('Native source changed after backup proof'));
    const result = await runSourceDelete(deps);
    expect(result.status).toBe('error');
    expect(result.batches).toBe(1);
    expect(deps.removeObjects).toHaveBeenCalledTimes(1);
  });

  it('stops when the fence is lost before the second batch', async () => {
    const objects = Array.from({ length: 60 }, (_, index) => artifact(GALLERY_BUCKET, `u/${index}.png`, `g${index}`));
    const { deps } = await setup(objects);
    deps.checkFence.mockResolvedValueOnce(true).mockResolvedValue(false);
    const result = await runSourceDelete(deps);
    expect(result.status).toBe('error');
    expect(result.deleted).toHaveLength(50);
    expect(deps.removeObjects).toHaveBeenCalledTimes(1);
  });

  it('never deletes when the local backup bytes changed', async () => {
    const { run, deps } = await setup([artifact(GALLERY_BUCKET, 'u/a.png', 'a')]);
    fs.writeFileSync(path.join(run.runDir, GALLERY_BUCKET, 'u/a.png'), 'tampered');
    const result = await runSourceDelete(deps);
    expect(result.status).toBe('error');
    expect(deps.removeObjects).not.toHaveBeenCalled();
  });

  it('never deletes when the laptop proof fails', async () => {
    const { deps } = await setup([artifact(GALLERY_BUCKET, 'u/a.png', 'a')]);
    const result = await runSourceDelete({ ...deps, runner: makeRunner('failed') });
    expect(result.status).toBe('error');
    expect(deps.removeObjects).not.toHaveBeenCalled();
  });

  it('errors when an object is still present after the delete', async () => {
    const { deps } = await setup([artifact(GALLERY_BUCKET, 'u/a.png', 'a')]);
    deps.listExisting.mockImplementation(async (_bucket: string, paths: string[]) => paths);
    const result = await runSourceDelete(deps);
    expect(result.status).toBe('error');
    expect(result.stillPresent).toEqual(['saved-images::u/a.png']);
    expect(result.deleted).toEqual([]);
  });

  it('resumes from its checkpoint and skips what was already deleted', async () => {
    const objects = Array.from({ length: 60 }, (_, index) => artifact(GALLERY_BUCKET, `u/${index}.png`, `g${index}`));
    const { deps } = await setup(objects);
    const original = deps.removeObjects.getMockImplementation()!;
    deps.removeObjects.mockImplementationOnce(original).mockRejectedValueOnce(new Error('boom'));
    const first = await runSourceDelete(deps);
    expect(first.status).toBe('error');
    expect(first.deleted).toHaveLength(50);
    deps.removeObjects.mockClear();
    const second = await runSourceDelete(deps);
    expect(second.status).toBe('ok');
    expect(second.deleted).toHaveLength(60);
    expect(deps.removeObjects).toHaveBeenCalledTimes(1);
    expect(deps.removeObjects.mock.calls[0][1]).toHaveLength(10);
  });
});

describe('source-delete: native version delete across buckets', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-srcdel-native-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  async function native(mode: string) {
    const run = makeRun(root, [artifact(GALLERY_BUCKET, 'same/path.png', 'one'), artifact(BLOG_BUCKET, 'same/path.png', 'two')]);
    const plan = await loadSourceDeletePlan({ backupRunDir: run.runDir });
    const sources: AnyRow = Object.fromEntries(run.proofObjects.map((item: AnyRow) => [`${item.bucket}::${item.path}`, { ...item.source }]));
    const current: AnyRow = { ...sources };
    const db = {
      query: async (sql: string, params: any[]) => {
        if (sql.includes('versioning_status')) return { rows: [{ versioning_status: mode === 'enabled-history' && params[0] === BLOG_BUCKET ? 'ENABLED' : 'DISABLED' }] };
        if (sql.includes('ANY')) return { rows: Object.keys(current).filter(key => key.startsWith(`${params[0]}::`) && params[1].includes(key.split('::')[1])).map(key => ({ path: key.split('::')[1] })) };
        const row = current[`${params[0]}::${params[1]}`];
        return { rows: row ? [{ row: { ...row, version: mode === 'changed-before' ? idFor(8) : row.version } }] : [] };
      },
    };
    const fetchFn = vi.fn(async (url: string, init: AnyRow = {}) => {
      if (url.endsWith('/storage/v1/version')) return new Response('1.80.2');
      expect(init.method).toBe('DELETE');
      expect(new URL(url).searchParams.get('versionId')).toBe(VERSION);
      const match = /\/object\/([^/]+)\/(.+)\?/.exec(url)!;
      delete current[`${match[1]}::${match[2]}`];
      return new Response('{}');
    });
    const actions = await makeNativeVersionStorageActions({ plan, db, config: { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'test-only' }, fetchFn });
    return { actions, fetchFn, current };
  }

  it('deletes the frozen version of each bucket independently, even with the same path', async () => {
    const { actions, fetchFn, current } = await native('valid');
    await actions.removeObjects(GALLERY_BUCKET, ['same/path.png']);
    expect(Object.keys(current)).toEqual([`${BLOG_BUCKET}::same/path.png`]);
    await actions.removeObjects(BLOG_BUCKET, ['same/path.png']);
    expect(Object.keys(current)).toEqual([]);
    expect(fetchFn.mock.calls.filter(([, init]: any) => init?.method === 'DELETE')).toHaveLength(2);
  });

  it('rejects a path or bucket outside the plan and a bucket with version history', async () => {
    const { actions, fetchFn } = await native('enabled-history');
    await expect(actions.removeObjects(INPUT_BUCKET, ['same/path.png'])).rejects.toThrow(/planned/);
    await expect(actions.removeObjects(GALLERY_BUCKET, ['unplanned.png'])).rejects.toThrow(/planned/);
    await expect(actions.removeObjects(BLOG_BUCKET, ['same/path.png'])).rejects.toThrow(/version history/);
    expect(fetchFn.mock.calls.filter(([, init]: any) => init?.method === 'DELETE')).toHaveLength(0);
  });

  it('refuses a native row that changed after the proof', async () => {
    const { actions, fetchFn } = await native('changed-before');
    await expect(actions.removeObjects(GALLERY_BUCKET, ['same/path.png'])).rejects.toThrow(/changed after backup proof/);
    expect(fetchFn.mock.calls.filter(([, init]: any) => init?.method === 'DELETE')).toHaveLength(0);
  });
});

describe('source-delete: delta classification', () => {
  const proof = (extra: AnyRow = {}) => ({
    id: idFor(1), version: VERSION, created_at: OLD, updated_at: OLD, metadata: { size: 3, eTag: 'abc' }, ...extra,
  });
  const live = (bucket: string, name: string, extra: AnyRow = {}) => ({ bucket_id: bucket, name, ...proof(), ...extra });
  const proofObjects = new Map([[`${GALLERY_BUCKET}::a.png`, proof()]]);

  it('finds nothing when every live object equals its frozen identity', () => {
    expect(classifySourceDelta({ proofObjects, liveRows: [live(GALLERY_BUCKET, 'a.png')] })).toEqual({ added: [], changed: [], gone: [] });
  });

  it('reports new objects, changed identity (id, version, eTag, size, timestamps) and missing objects', () => {
    const result = classifySourceDelta({
      proofObjects,
      liveRows: [live(GALLERY_BUCKET, 'new.png'), live(BLOG_BUCKET, 'b.webp')],
    });
    expect(result.added).toEqual([`${BLOG_BUCKET}::b.webp`, `${GALLERY_BUCKET}::new.png`]);
    expect(result.gone).toEqual([`${GALLERY_BUCKET}::a.png`]);
    for (const patch of [{ id: idFor(9) }, { version: idFor(9) }, { metadata: { size: 3, eTag: 'zzz' } }, { metadata: { size: 4, eTag: 'abc' } }, { updated_at: '2000-01-02T00:00:00.000Z' }, { created_at: '2000-01-02T00:00:00.000Z' }]) {
      expect(classifySourceDelta({ proofObjects, liveRows: [live(GALLERY_BUCKET, 'a.png', patch)] }).changed).toEqual([`${GALLERY_BUCKET}::a.png`]);
    }
  });
});

describe('source-delete: delta needs the live fence', () => {
  const state = (limit: number | null) => ({
    buckets: Object.fromEntries(['saved-images', 'blog-images', 'upscale-inputs'].map(id => [id, {
      public: false, file_size_limit: limit, allowed_mime_types: ['application/x-miu-storage-frozen'],
    }])),
    policies: [],
  });
  const makeDb = (fenced: boolean) => {
    const sql: string[] = [];
    return { sql, query: async (text: string) => {
      sql.push(text);
      return /^SELECT to_jsonb\(o\)/.test(text) ? { rows: [{ row: { name: 'a' } }] } : { rows: [{ state: state(fenced ? 1 : null) }] };
    } };
  };

  it('refuses to read the source snapshot while writes are possible', async () => {
    const db = makeDb(false);
    await expect(loadFencedSourceRows(db)).rejects.toThrow(/fence/i);
    expect(db.sql.some(text => /^SELECT to_jsonb\(o\)/.test(text))).toBe(false);
  });

  it('reads the rows once the fence is held', async () => {
    expect(await loadFencedSourceRows(makeDb(true))).toEqual([{ name: 'a' }]);
  });
});

describe('source-delete: CLI', () => {
  function run(args: string[]) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-srcdel-cli-'));
    try {
      return spawnSync(process.execPath, [path.resolve('scripts/storage/backup-and-purge.mjs'), ...args], {
        cwd, env: { PATH: '', HOME: cwd, CLOUDSDK_CONFIG: cwd }, encoding: 'utf8', timeout: 5000,
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }

  it('refuses delete-source without --confirm before loading config or credentials', () => {
    const result = run(['delete-source', '--manifest', '/nonexistent']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('delete-source requires --confirm');
  });

  it('requires a manifest for delete-source and delta', () => {
    expect(run(['delete-source', '--confirm']).stderr).toContain('--manifest');
    expect(run(['delta']).stderr).toContain('--manifest');
  });

  it('keeps purge and expire disabled', () => {
    expect(run(['purge', '--confirm']).stderr).toContain('Deletion disabled');
  });
});

describe('source-delete: database batch lock', () => {
  it('locks the gallery and blog reference tables for a source-delete batch', async () => {
    const sql: string[] = [];
    const db = { query: async (text: string) => { sql.push(text); return { rows: [] }; } };
    await withDatabaseBatch(db, 'source-delete', async () => ({ status: 'ok' }));
    const lock = sql.find(text => text.startsWith('LOCK TABLE'))!;
    for (const table of ['public.saved_images', 'public.blog_images', 'public.blog_posts']) expect(lock).toContain(table);
    expect(sql.at(-1)).toBe('COMMIT');
    await expect(withDatabaseBatch(db, 'bogus', async () => ({ status: 'ok' }))).rejects.toThrow(/Unknown batch kind/);
  });
});

const dockerAvailable = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

describe.runIf(dockerAvailable)('source-delete: reference SQL on real PostgreSQL 17', () => {
  const containerName = `miu-src-delete-${crypto.randomUUID()}`;
  const BASE = 'https://assets.myimageupscaler.com';
  const SUPA = 'https://xqysaylskffsfwunczbd.supabase.co/storage/v1/object/public/blog-images';
  let client: any;

  beforeAll(async () => {
    const { Client } = await import('pg');
    execFileSync('docker', ['run', '--rm', '-d', '--name', containerName, '-e', 'POSTGRES_PASSWORD=test', '-P', 'public.ecr.aws/supabase/postgres:17.6.1.052']);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const health = spawnSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', containerName], { encoding: 'utf8' }).stdout.trim();
      if (health === 'healthy') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const mapping = execFileSync('docker', ['port', containerName, '5432/tcp'], { encoding: 'utf8' }).trim();
    const connectionString = `postgresql://supabase_admin:test@127.0.0.1:${mapping.split(':').at(-1)}/postgres`;
    for (let attempt = 0; attempt < 60 && !client; attempt += 1) {
      const candidate = new Client({ connectionString });
      try { await candidate.connect(); client = candidate; } catch { await candidate.end().catch(() => undefined); await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!client) throw new Error('PostgreSQL test connection failed');
    await client.query(`
      CREATE TABLE public.saved_images (id serial PRIMARY KEY, storage_path text, storage_backend text NOT NULL DEFAULT 'supabase');
      CREATE TABLE public.blog_images (id serial PRIMARY KEY, storage_path text, url text);
      CREATE TABLE public.blog_posts (id serial PRIMARY KEY, content text, featured_image_url text);
      INSERT INTO public.saved_images (storage_path, storage_backend) VALUES ('legacy.png', 'supabase'), ('moved.png', 'r2');
      INSERT INTO public.blog_images (storage_path, url) VALUES ('old.webp', '${SUPA}/old.webp'), ('new.webp', '${BASE}/new.webp');
      INSERT INTO public.blog_posts (content, featured_image_url) VALUES
        ('text ![x](${SUPA}/body.webp) more', NULL), ('plain', '${SUPA}/featured.webp'), ('![y](${BASE}/new.webp)', '${BASE}/new.webp');`);
  }, 240_000);

  afterAll(async () => {
    await client?.end().catch(() => undefined);
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
  });

  const flags = async (bucket: string, paths: string[], params: unknown[]) =>
    Object.fromEntries((await client.query(SOURCE_RECHECK_SQL[bucket], params)).rows.map((row: AnyRow) => [row.path, row.source_reference]));

  it('keeps a saved image still on the supabase backend and frees moved or unreferenced ones', async () => {
    const paths = ['legacy.png', 'moved.png', 'orphan.png'];
    expect(await flags(GALLERY_BUCKET, paths, [paths])).toEqual({ 'legacy.png': true, 'moved.png': false, 'orphan.png': false });
  });

  it('keeps a blog image whose row, body or featured image still points at the source', async () => {
    const paths = ['old.webp', 'new.webp', 'body.webp', 'featured.webp', 'orphan.webp'];
    expect(await flags(BLOG_BUCKET, paths, [paths, BASE])).toEqual({
      'old.webp': true, 'new.webp': false, 'body.webp': true, 'featured.webp': true, 'orphan.webp': false,
    });
  });
});
