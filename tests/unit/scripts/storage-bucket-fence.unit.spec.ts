import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as fence from '../../../scripts/storage/storage-bucket-fence.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  FENCED_BUCKETS,
  FROZEN_MIME_TYPES,
  BUCKET_FENCE_SQL,
  deriveBucketFence,
  isSourceFenced,
  readBucketFenceState,
  captureBucketSnapshot,
  writeBucketSnapshotFile,
  loadBucketSnapshotFile,
  runBucketSnapshot,
  runBucketFreeze,
  runBucketRestore,
  runBucketStatus,
  runBucketFenceCli,
} = fence as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

type Bucket = { public: boolean; file_size_limit: number | null; allowed_mime_types: string[] | null };
const BASE = 'https://project.supabase.co';
const FROZEN = { file_size_limit: 1, allowed_mime_types: ['application/x-miu-storage-frozen'] };

const originals = (): Record<string, Bucket> => ({
  'saved-images': { public: false, file_size_limit: null, allowed_mime_types: null },
  'blog-images': { public: true, file_size_limit: 10485760, allowed_mime_types: ['image/webp', 'image/png'] },
  'upscale-inputs': { public: false, file_size_limit: 52428800, allowed_mime_types: null },
});

/** In-memory Storage bucket API plus the catalog read the gate uses. */
function makeWorld(options: { policies?: any[]; failPutOn?: number; ignorePutFor?: string; pending?: Record<string, number> } = {}) {
  const buckets: Record<string, Bucket> = originals();
  const calls: { method: string; id: string; body?: any }[] = [];
  let puts = 0;
  const fetchFn = async (url: string, init: any = {}) => {
    const match = /\/storage\/v1\/bucket\/([^/?]+)$/.exec(url);
    if (!match) throw new Error(`unexpected URL ${url}`);
    const id = match[1];
    expect(init.headers.Authorization).toBe('Bearer service-key');
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    calls.push({ method, id, body });
    if (!buckets[id]) return new Response('{"error":"not found"}', { status: 404 });
    if (method === 'GET') return new Response(JSON.stringify({ id, name: id, ...buckets[id], created_at: 'x' }));
    puts += 1;
    if (options.failPutOn === puts) return new Response('{"error":"boom"}', { status: 500 });
    if (id !== options.ignorePutFor) Object.assign(buckets[id], body);
    return new Response('{"message":"Successfully updated"}');
  };
  const db = {
    sql: [] as string[],
    pending: options.pending as Record<string, number> | undefined,
    async query(text: string) {
      this.sql.push(text);
      if (/to_regclass/.test(text)) return { rows: [{ present: this.pending !== undefined }] };
      if (/s3_multipart_uploads/.test(text)) return { rows: Object.entries(this.pending ?? {}).map(([bucket_id, n]) => ({ bucket_id, n })) };
      return { rows: [{ state: { buckets: JSON.parse(JSON.stringify(buckets)), policies: options.policies ?? [] } }] };
    },
  };
  return { buckets, calls, fetchFn, db, api: { baseUrl: BASE, serviceKey: 'service-key', fetchFn } };
}

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

describe('storage-bucket-fence: gate derivation', () => {
  const frozenState = (patch: Record<string, Partial<Bucket>> = {}, policies: any[] = []) => ({
    buckets: Object.fromEntries(FENCED_BUCKETS.map((id: string) => [id, { public: false, ...FROZEN, ...(patch[id] ?? {}) }])),
    policies,
  });

  it('is fenced only when all three buckets carry the exact frozen limits', () => {
    expect(FENCED_BUCKETS).toEqual(['saved-images', 'blog-images', 'upscale-inputs']);
    expect(deriveBucketFence(frozenState()).fenced).toBe(true);
    expect(deriveBucketFence(frozenState({}, [{ name: 'read', cmd: 'SELECT', roles: ['public'] }])).fenced).toBe(true);
    expect(deriveBucketFence(frozenState({}, [{ name: 'svc', cmd: 'INSERT', roles: ['service_role'] }])).fenced).toBe(true);
  });

  it.each([
    ['size 2', { 'blog-images': { file_size_limit: 2 } }],
    ['no size', { 'saved-images': { file_size_limit: null } }],
    ['no mime list', { 'upscale-inputs': { allowed_mime_types: null } }],
    ['extra mime', { 'blog-images': { allowed_mime_types: ['application/x-miu-storage-frozen', 'image/png'] } }],
    ['other mime', { 'blog-images': { allowed_mime_types: ['image/png'] } }],
  ])('is not fenced when a bucket has %s', (_label, patch) => {
    expect(deriveBucketFence(frozenState(patch as any)).fenced).toBe(false);
  });

  it('is not fenced with a missing bucket', () => {
    const state: any = frozenState();
    delete state.buckets['blog-images'];
    expect(deriveBucketFence(state).fenced).toBe(false);
  });

  it.each([
    ['INSERT', ['anon']], ['UPDATE', ['authenticated']], ['ALL', ['public']], ['INSERT', ['anon', 'service_role']],
  ])('is not fenced by a %s policy for %j', (cmd, roles) => {
    const result = deriveBucketFence(frozenState({}, [{ name: 'p', cmd, roles }]));
    expect(result.fenced).toBe(false);
    expect(result.policyViolations).toHaveLength(1);
  });

  it('fails closed on a missing or malformed state', () => {
    expect(() => deriveBucketFence(undefined)).toThrow();
    expect(() => deriveBucketFence({ buckets: {}, policies: 'x' })).toThrow();
    expect(isSourceFenced(null)).toBe(false);
    expect(isSourceFenced({})).toBe(false);
    expect(isSourceFenced(frozenState())).toBe(true);
  });

  it('reads the state with one read-only query', async () => {
    const world = makeWorld();
    expect((await readBucketFenceState(world.db)).buckets['blog-images'].file_size_limit).toBe(10485760);
    expect(world.db.sql).toHaveLength(1);
    expect(BUCKET_FENCE_SQL).toContain('storage.buckets');
    expect(BUCKET_FENCE_SQL).toContain('pg_policies');
    expect(world.db.sql[0]).toMatch(/^SELECT/);
  });
});

describe('storage-bucket-fence: snapshot, freeze, restore', () => {
  let root: string;
  let file: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-bucket-fence-')); file = path.join(root, 'buckets.json'); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  async function snapshotOf(world: ReturnType<typeof makeWorld>) {
    return writeBucketSnapshotFile(file, await captureBucketSnapshot(world.api, { now: () => new Date('2026-10-12T12:00:00.000Z') }));
  }

  it('captures the three bucket configs with GET only and round-trips as a 0600 wx file', async () => {
    const world = makeWorld();
    const written = await snapshotOf(world);
    expect(world.calls.every(call => call.method === 'GET')).toBe(true);
    expect(world.calls.map(call => call.id)).toEqual(FENCED_BUCKETS);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(written.sha256).toBe(sha256(fs.readFileSync(file, 'utf8')));
    await expect(writeBucketSnapshotFile(file, (await loadBucketSnapshotFile(file)).snapshot)).rejects.toThrow(/EEXIST/);
    const loaded = await loadBucketSnapshotFile(file, written.sha256);
    expect(loaded.snapshot.buckets['blog-images']).toEqual(originals()['blog-images']);
    expect(loaded.snapshot.captured_at).toBe('2026-10-12T12:00:00.000Z');
    await expect(loadBucketSnapshotFile(file, 'f'.repeat(64))).rejects.toThrow(/sha256/);
  });

  it('runBucketSnapshot writes the file and reports the sha256 without any PUT', async () => {
    const world = makeWorld();
    const result = await runBucketSnapshot({ api: world.api, out: file });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(world.calls.some(call => call.method === 'PUT')).toBe(false);
  });

  it('refuses a snapshot of buckets that are already frozen', async () => {
    const world = makeWorld();
    Object.assign(world.buckets['saved-images'], FROZEN);
    await expect(runBucketSnapshot({ api: world.api, out: file })).rejects.toThrow(/already frozen/);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('refuses to freeze without --confirm, before any request', async () => {
    const world = makeWorld();
    const { sha256: digest } = await snapshotOf(world);
    world.calls.length = 0;
    await expect(runBucketFreeze({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: false })).rejects.toThrow(/--confirm/);
    expect(world.calls).toHaveLength(0);
  });

  it('freezes each bucket with only the size limit and the mime list and verifies the result', async () => {
    const world = makeWorld();
    const { sha256: digest } = await snapshotOf(world);
    const result = await runBucketFreeze({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true });
    expect(result.fenced).toBe(true);
    expect(result.snapshot_sha256).toBe(digest);
    const puts = world.calls.filter(call => call.method === 'PUT');
    expect(puts.map(call => call.id)).toEqual(FENCED_BUCKETS);
    for (const put of puts) expect(put.body).toEqual({ file_size_limit: 1, allowed_mime_types: [...FROZEN_MIME_TYPES] });
    expect(world.buckets['blog-images'].public).toBe(true);
    expect(isSourceFenced(await readBucketFenceState(world.db))).toBe(true);
  });

  it('refuses a stale snapshot, a wrong sha256 and a policy that allows direct writes, before any PUT', async () => {
    const world = makeWorld();
    const { sha256: digest } = await snapshotOf(world);
    world.calls.length = 0;
    world.buckets['saved-images'].file_size_limit = 5;
    await expect(runBucketFreeze({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true })).rejects.toThrow(/stale/);
    world.buckets['saved-images'].file_size_limit = null;
    await expect(runBucketFreeze({ ...world, snapshotPath: file, snapshotSha256: 'f'.repeat(64), confirm: true })).rejects.toThrow(/sha256/);
    const policyWorld = makeWorld({ policies: [{ name: 'open', cmd: 'INSERT', roles: ['authenticated'] }] });
    const second = await runBucketSnapshot({ api: policyWorld.api, out: path.join(root, 'p.json') });
    await expect(runBucketFreeze({ ...policyWorld, snapshotPath: path.join(root, 'p.json'), snapshotSha256: second.sha256, confirm: true })).rejects.toThrow(/policy/);
    expect(world.calls.concat(policyWorld.calls).some(call => call.method === 'PUT')).toBe(false);
  });

  it('puts back the exact originals when a later PUT fails', async () => {
    const world = makeWorld({ failPutOn: 2 });
    const { sha256: digest } = await snapshotOf(world);
    await expect(runBucketFreeze({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true })).rejects.toThrow(/rolled back|HTTP 500/);
    expect(world.buckets).toEqual(originals());
  });

  it('restores the exact snapshot, including null limits, and verifies equality', async () => {
    const world = makeWorld();
    const { sha256: digest } = await snapshotOf(world);
    await runBucketFreeze({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true });
    world.calls.length = 0;
    const result = await runBucketRestore({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true });
    expect(result.restored).toBe(true);
    expect(world.buckets).toEqual(originals());
    expect(world.calls.filter(call => call.method === 'PUT').find(call => call.id === 'saved-images')!.body)
      .toEqual({ public: false, file_size_limit: null, allowed_mime_types: null });
  });

  it('refuses to restore unless the live buckets are frozen or already original, and never touches others', async () => {
    const world = makeWorld();
    const { sha256: digest } = await snapshotOf(world);
    world.calls.length = 0;
    await expect(runBucketRestore({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true })).rejects.toThrow(/not frozen/);
    await runBucketFreeze({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true });
    world.buckets['blog-images'].file_size_limit = 7;
    world.calls.length = 0;
    await expect(runBucketRestore({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true })).rejects.toThrow(/changed since the freeze/);
    expect(world.calls.some(call => call.method === 'PUT')).toBe(false);
    world.buckets['blog-images'].public = false;
    world.buckets['blog-images'].file_size_limit = 1;
    world.buckets['blog-images'].allowed_mime_types = [...FROZEN_MIME_TYPES];
    await expect(runBucketRestore({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true })).rejects.toThrow(/changed since the freeze/);
  });

  it('restores a partly restored set and refuses a frozen snapshot', async () => {
    const world = makeWorld();
    const { sha256: digest } = await snapshotOf(world);
    await runBucketFreeze({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true });
    Object.assign(world.buckets['saved-images'], originals()['saved-images']);
    expect((await runBucketRestore({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true })).restored).toBe(true);
    expect(world.buckets).toEqual(originals());

    const frozenFile = path.join(root, 'frozen.json');
    const frozenSnapshot = await captureBucketSnapshot(world.api);
    for (const id of FENCED_BUCKETS) Object.assign(frozenSnapshot.buckets[id], FROZEN);
    const written = await writeBucketSnapshotFile(frozenFile, frozenSnapshot);
    await expect(runBucketRestore({ ...world, snapshotPath: frozenFile, snapshotSha256: written.sha256, confirm: true })).rejects.toThrow(/frozen snapshot/);
  });

  it('fails loudly when a restore does not take effect', async () => {
    const world = makeWorld();
    const { sha256: digest } = await snapshotOf(world);
    await runBucketFreeze({ ...world, snapshotPath: file, snapshotSha256: digest, confirm: true });
    const stubborn = makeWorld({ ignorePutFor: 'blog-images' });
    Object.assign(stubborn.buckets, JSON.parse(JSON.stringify(world.buckets)));
    await expect(runBucketRestore({ ...stubborn, snapshotPath: file, snapshotSha256: digest, confirm: true })).rejects.toThrow(/does not match the snapshot/);
  });

  it('reports in-progress multipart uploads, which the bucket fence cannot stop', async () => {
    const quiet = makeWorld({ pending: {} });
    expect((await runBucketStatus({ db: quiet.db })).pendingUploads).toMatchObject({ available: true, count: 0 });
    const busy = makeWorld({ pending: { 'saved-images': 2, 'blog-images': 1 } });
    expect((await runBucketStatus({ db: busy.db })).pendingUploads).toMatchObject({ count: 3, buckets: { 'saved-images': 2, 'blog-images': 1 } });
    expect((await runBucketStatus({ db: makeWorld().db })).pendingUploads).toMatchObject({ available: false, count: null });

    const logs: string[] = [];
    const { sha256: digest } = await snapshotOf(busy);
    const result = await runBucketFreeze({ ...busy, snapshotPath: file, snapshotSha256: digest, confirm: true, log: (line: string) => logs.push(line) });
    expect(result.pendingUploads.count).toBe(3);
    expect(logs.join('\n')).toMatch(/WARNING pending S3 multipart uploads=3/);
  });

  it('status reads the gate state without any request to the API', async () => {
    const world = makeWorld();
    expect((await runBucketStatus({ db: world.db })).fenced).toBe(false);
    expect(world.calls).toHaveLength(0);
  });
});

describe('storage-bucket-fence: CLI', () => {
  it('refuses mutating commands without --confirm before reading credentials', async () => {
    let loaded = 0;
    const deps = { loadConfig: () => { loaded += 1; return {}; }, createDb: async () => makeWorld().db };
    for (const argv of [['freeze', '--snapshot', 'x', '--snapshot-sha256', 'a'], ['restore', '--snapshot', 'x', '--snapshot-sha256', 'a']]) {
      await expect(runBucketFenceCli(argv, deps)).rejects.toThrow(/--confirm/);
    }
    expect(loaded).toBe(0);
  });

  it('rejects unknown flags, missing values, a missing or malformed sha256 and an untrusted origin', async () => {
    const deps = { loadConfig: () => ({ supabaseUrl: BASE, serviceRoleKey: 'k' }), createDb: async () => makeWorld().db };
    await expect(runBucketFenceCli(['status', '--bogus'], deps)).rejects.toThrow(/Unknown flag/);
    await expect(runBucketFenceCli(['freeze', '--confirm', '--snapshot'], deps)).rejects.toThrow(/Missing value/);
    await expect(runBucketFenceCli(['freeze', '--confirm'], deps)).rejects.toThrow(/--snapshot/);
    for (const command of ['freeze', 'restore']) {
      await expect(runBucketFenceCli([command, '--confirm', '--snapshot', 'x'], deps)).rejects.toThrow(/--snapshot-sha256/);
      await expect(runBucketFenceCli([command, '--confirm', '--snapshot', 'x', '--snapshot-sha256', 'nothex'], deps)).rejects.toThrow(/64 hex/);
    }
    await expect(runBucketFenceCli(['snapshot', '--out', '/x'], { ...deps, loadConfig: () => ({ supabaseUrl: 'http://evil.example', serviceRoleKey: 'k' }) })).rejects.toThrow(/trusted HTTPS/);
  });

  it('status closes the database and prints fenced=false', async () => {
    const world = makeWorld();
    let ended = 0;
    const db = { query: world.db.query.bind(world.db), end: async () => { ended += 1; } };
    const lines: string[] = [];
    await runBucketFenceCli(['status'], { loadConfig: () => ({ supabaseUrl: BASE, serviceRoleKey: 'service-key' }), createDb: async () => db, log: (line: string) => lines.push(line) });
    expect(ended).toBe(1);
    expect(lines.join('\n')).toContain('fenced=false');
  });
});
