import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import * as migration from '../../../scripts/storage/migrate-r2.mjs';
import { presignGetUrl } from '../../../server/services/r2-presign.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  SAVED_BUCKET,
  BLOG_BUCKET,
  INPUT_BUCKET,
  buildMigrationPlan,
  loadFrozenMigrationPlan,
  writeFrozenMigrationPlan,
  runMigrationCopy,
  runMigrateCli,
  objectUrl,
} = migration as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

type AnyRow = Record<string, any>;

const RUN_ID = 'backup-run-2026-10-13';
const CREATED = '2026-10-01T00:00:00.000Z';
const UPDATED = '2026-10-02T00:00:00.000Z';
const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const SIGNING = { endpoint: ENDPOINT, accessKeyId: 'test-key', secretAccessKey: 'test-secret' };

function sha256(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makeObject(bucket: string, objectPath: string, content: string) {
  const buffer = Buffer.from(content);
  return {
    buffer,
    row: { bucket, path: objectPath, bytes: buffer.length, sha256: sha256(buffer), created_at: CREATED, updated_at: UPDATED, db_reference: false },
  };
}

function writeArtifact(runDir: string, bucket: string, objectPath: string, content: Buffer) {
  const target = path.join(runDir, bucket, objectPath);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, content);
  return target;
}

function makeBackupRun(root: string, objects: Array<{ row: AnyRow; buffer: Buffer }>) {
  const runDir = path.join(root, RUN_ID);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const rows: AnyRow[] = [];
  for (const { row, buffer } of objects) {
    writeArtifact(runDir, row.bucket, row.path, buffer);
    rows.push(row);
  }
  const rawManifest = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
  const rawChecksum = rows.map(row => `${row.sha256}  ${row.bucket}/${row.path}`).join('\n') + '\n';
  const receipt = {
    run_id: RUN_ID,
    object_count: rows.length,
    total_bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    manifest_sha256: sha256(rawManifest),
    checksum_list_sha256: sha256(rawChecksum),
    verified_at: CREATED,
  };
  fs.writeFileSync(path.join(runDir, 'manifest.jsonl'), rawManifest);
  fs.writeFileSync(path.join(runDir, 'manifest.sha256'), rawChecksum);
  fs.writeFileSync(path.join(runDir, 'backup-verification.json'), JSON.stringify(receipt, null, 2));
  return { runDir, rows, rawManifest, receipt };
}

function targetPathname(bucket: string, key: string): string {
  return `/${bucket}/${key}`;
}

/** In-memory R2 that drains PUT bodies and serves GET read-backs. */
class FakeR2 {
  store = new Map<string, Buffer>();
  puts: Array<{ url: string; headers: any; method: string }> = [];
  gets: string[] = [];
  private putCount = 0;
  failPutAt: number | null = null;
  corruptReads = false;

  get putUrls(): string[] {
    return this.puts.map(p => p.url);
  }

  fetch = async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET';
    const pathname = new URL(url).pathname;
    if (method === 'PUT') {
      this.putCount += 1;
      this.puts.push({ url, headers: init.headers, method });
      const chunks: Buffer[] = [];
      for await (const part of init.body) chunks.push(Buffer.from(part));
      const body = Buffer.concat(chunks);
      if (this.failPutAt !== null && this.putCount === this.failPutAt) {
        return new Response('boom', { status: 501 });
      }
      if (this.store.has(pathname)) return new Response('precondition failed', { status: 412 });
      this.store.set(pathname, body);
      return new Response(null, { status: 200 });
    }
    if (method === 'GET') {
      this.gets.push(pathname);
      const stored = this.store.get(pathname);
      if (!stored) return new Response('missing', { status: 404 });
      const payload = this.corruptReads ? Buffer.from('tampered-read-back!!') : stored;
      return new Response(new Uint8Array(payload), { status: 200 });
    }
    return new Response('bad', { status: 400 });
  };
}

function makeRunner(identity: AnyRow, mode = 'ok') {
  return async (command: string, args: string[], options: { input?: string } = {}) => {
    if (command === 'ssh' && args[1].includes('sha256sum -c -')) {
      if (mode === 'failed') return `${INPUT_BUCKET}/x.png: FAILED\n`;
      return (options.input ?? '')
        .split('\n')
        .filter(Boolean)
        .map(line => `${line.replace(/^[0-9a-f]{64} {2}/, '')}: OK`)
        .join('\n');
    }
    if (command === 'ssh' && args[1].includes('manifest.jsonl')) {
      return `${identity.manifestSha256}  manifest.jsonl\n`;
    }
    return '';
  };
}

async function loadIdentity(runDir: string): Promise<AnyRow> {
  const { loadBackupIdentity } = await import('../../../scripts/storage/backup-verification.mjs');
  return (loadBackupIdentity as any)(runDir);
}

function threeBucketBackup(root: string) {
  const saved = makeObject(SAVED_BUCKET, 'user/aaa.png', 'saved bytes');
  const blog = makeObject(BLOG_BUCKET, 'posts/bbb.jpg', 'blog bytes');
  const input = makeObject(INPUT_BUCKET, '22222222-2222-4222-8222-222222222222/ccc.webp', 'input bytes');
  const run = makeBackupRun(root, [saved, blog, input]);
  return { saved, blog, input, run };
}

describe('r2-migration: plan mapping', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-r2plan-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('maps each bucket to its exact target key and MIME, with no blog prefix', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const plan = buildMigrationPlan(identity);

    expect(plan.manifest_sha256).toBe(identity.manifestSha256);
    expect(plan.manifest_object_count).toBe(3);
    const bySource = new Map(plan.mapping.map((e: AnyRow) => [`${e.sourceBucket}/${e.sourcePath}`, e]));

    const saved = bySource.get(`${SAVED_BUCKET}/user/aaa.png`) as AnyRow;
    expect(saved.targetBucket).toBe('miu-private');
    expect(saved.targetKey).toBe('saved/user/aaa.png');
    expect(saved.contentType).toBe('image/png');

    const input = bySource.get(`${INPUT_BUCKET}/22222222-2222-4222-8222-222222222222/ccc.webp`) as AnyRow;
    expect(input.targetBucket).toBe('miu-private');
    expect(input.targetKey).toBe('inputs/22222222-2222-4222-8222-222222222222/ccc.webp');
    expect(input.contentType).toBe('image/webp');

    const blog = bySource.get(`${BLOG_BUCKET}/posts/bbb.jpg`) as AnyRow;
    expect(blog.targetBucket).toBe('miu-public');
    expect(blog.targetKey).toBe('posts/bbb.jpg');
    expect(blog.contentType).toBe('image/jpeg');
  });

  it('prefers manifest metadata over the extension table', async () => {
    const buffer = Buffer.from('saved bytes');
    const savedObj = {
      buffer,
      row: {
        bucket: SAVED_BUCKET, path: 'user/aaa.png', bytes: buffer.length, sha256: sha256(buffer),
        created_at: CREATED, updated_at: UPDATED, db_reference: false, content_type: 'image/gif',
      } as AnyRow,
    };
    const run = makeBackupRun(root, [savedObj]);
    const identity = await loadIdentity(run.runDir);
    const plan = buildMigrationPlan(identity);
    const savedEntry = plan.mapping.find((e: AnyRow) => e.sourceBucket === SAVED_BUCKET) as AnyRow;
    expect(savedEntry.contentType).toBe('image/gif');
  });

  it('fails an unknown extension and never falls back to octet-stream', () => {
    const base = { bucket: SAVED_BUCKET, bytes: 3, sha256: 'a'.repeat(64) };
    const unknown = { manifestSha256: 'b'.repeat(64), objectCount: 1, totalBytes: 3, manifest: [{ ...base, path: 'file.bin' }] };
    expect(() => buildMigrationPlan(unknown)).toThrow(/Unknown content type extension/);

    const octet = {
      manifestSha256: 'b'.repeat(64),
      objectCount: 1,
      totalBytes: 3,
      manifest: [{ ...base, path: 'file.bin', content_type: 'application/octet-stream' }],
    };
    expect(() => buildMigrationPlan(octet)).toThrow(/octet-stream/);
  });

  it('refuses duplicate target mappings and unsafe paths', () => {
    const row = { bucket: SAVED_BUCKET, path: 'user/x.png', bytes: 3, sha256: 'a'.repeat(64) };
    const identity = { manifestSha256: 'b'.repeat(64), objectCount: 2, totalBytes: 6, manifest: [row, { ...row }] };
    expect(() => buildMigrationPlan(identity)).toThrow(/Duplicate target mapping/);

    const unsafe = { bucket: SAVED_BUCKET, path: '../escape.png', bytes: 3, sha256: 'a'.repeat(64) };
    const badIdentity = { manifestSha256: 'b'.repeat(64), objectCount: 1, totalBytes: 3, manifest: [unsafe] };
    expect(() => buildMigrationPlan(badIdentity)).toThrow(/Unsafe object path/);

    const badBucket = { bucket: 'unknown-bucket', path: 'ok.png', bytes: 3, sha256: 'a'.repeat(64) };
    const bucketIdentity = { manifestSha256: 'b'.repeat(64), objectCount: 1, totalBytes: 3, manifest: [badBucket] };
    expect(() => buildMigrationPlan(bucketIdentity)).toThrow(/Unknown source bucket/);
  });
});

describe('r2-migration: frozen plan binding', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-r2bind-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reloads a plan bound to the raw manifest and rejects a tampered plan', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    await writeFrozenMigrationPlan(run.runDir, buildMigrationPlan(identity));

    const loaded = await loadFrozenMigrationPlan({ backupRunDir: run.runDir });
    expect(loaded.plan.manifest_sha256).toBe(identity.manifestSha256);
    expect(loaded.plan.mapping).toHaveLength(3);

    const planPath = path.join(run.runDir, 'r2-migration-plan.json');
    const tampered = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    tampered.mapping[0].targetKey = 'saved/evil.png';
    fs.chmodSync(planPath, 0o600);
    fs.writeFileSync(planPath, JSON.stringify(tampered));
    await expect(loadFrozenMigrationPlan({ backupRunDir: run.runDir })).rejects.toThrow(/digest does not bind/);
  });

  it('rejects a plan whose manifest binding does not match the verified backup', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const plan = buildMigrationPlan(identity);
    const foreign = { ...plan, manifest_sha256: 'f'.repeat(64) };
    await writeFrozenMigrationPlan(run.runDir, foreign);
    await expect(loadFrozenMigrationPlan({ backupRunDir: run.runDir })).rejects.toThrow(/different manifest/);
  });
});

describe('r2-migration: signing endpoint and object URL', () => {
  it('percent-encodes every key segment so the path stays exact, never query or fragment', () => {
    const url = new URL(objectUrl(ENDPOINT, 'miu-private', 'saved/a b#c?d%e.png'));
    expect(url.pathname).toBe('/miu-private/saved/a%20b%23c%3Fd%25e.png');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  it('rejects a non-R2, insecure or malformed signing endpoint before any network', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-r2endpoint-'));
    try {
      const { run } = threeBucketBackup(root);
      const identity = await loadIdentity(run.runDir);
      const r2 = new FakeR2();
      const badEndpoints = [
        'https://evil.example.com',
        `http://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
        `https://user:pass@${ACCOUNT_ID}.r2.cloudflarestorage.com`,
        `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/some/path`,
        `https://${ACCOUNT_ID}.r2.cloudflarestorage.com?a=1`,
        `https://${ACCOUNT_ID}.r2.cloudflarestorage.com#frag`,
        'https://nothex.r2.cloudflarestorage.com',
      ];
      for (const endpoint of badEndpoints) {
        await expect(
          runMigrationCopy({
            identity, runDir: run.runDir, signing: { ...SIGNING, endpoint },
            fetchFn: r2.fetch, runner: makeRunner(identity),
          })
        ).rejects.toThrow();
      }
      expect(r2.puts).toHaveLength(0);
      expect(r2.gets).toHaveLength(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('r2-migration: readback signed URL expiry', () => {
  it.each([
    { label: 'omitted', overrides: {}, expected: 900 },
    { label: 'undefined', overrides: { expiresSeconds: undefined }, expected: 900 },
    { label: 'explicit', overrides: { expiresSeconds: 300 }, expected: 300 },
  ])('uses a bounded real presigned GET expiry when $label', async ({ overrides, expected }) => {
    const body = Buffer.from('exact readback bytes');
    const fetchFn = vi.fn(async (url: string) => {
      const signed = new URL(url);
      expect(signed.searchParams.get('X-Amz-Expires')).toBe(String(expected));
      expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
      return new Response(body);
    });
    const result = await (migration as any).readbackVerify({
      presignGet: presignGetUrl,
      signing: { ...SIGNING, ...overrides },
      fetchFn,
      targetBucket: 'miu-private',
      targetKey: 'archive/gallery/owned/fixture',
      expectedSha256: sha256(body),
      expectedBytes: body.length,
    });
    expect(result).toEqual({ sha256: sha256(body), bytes: body.length });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});

describe('r2-migration: runMigrationCopy', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-r2copy-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function setup(objects: Array<{ row: AnyRow; buffer: Buffer }>) {
    const run = makeBackupRun(root, objects);
    const identity = await loadIdentity(run.runDir);
    return { run, identity };
  }

  it.each([200, 412, 502])('handles HTTP %s while streaming the file upload', async status => {
    const object = makeObject(INPUT_BUCKET, 'user/early.png', 'x'.repeat(8 * 1024 * 1024));
    const { run } = await setup([object]);
    const script = `
      import assert from 'node:assert/strict';
      import { createHash } from 'node:crypto';
      import { createServer } from 'node:http';
      import { readFileSync, rmSync } from 'node:fs';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { setTimeout as delay } from 'node:timers/promises';
      import { runMigrationCopy } from ${JSON.stringify(pathToFileURL(path.resolve('scripts/storage/migrate-r2.mjs')).href)};
      import { loadBackupIdentity } from ${JSON.stringify(pathToFileURL(path.resolve('scripts/storage/backup-verification.mjs')).href)};
      const runDir = ${JSON.stringify(run.runDir)};
      const identity = await loadBackupIdentity(runDir);
      const bytes = readFileSync(${JSON.stringify(path.join(run.runDir, INPUT_BUCKET, object.row.path))});
      const streams = [];
      const createReadStream = fs.createReadStream;
      fs.createReadStream = (...args) => {
        const stream = createReadStream(...args);
        streams.push(stream);
        return stream;
      };
      syncBuiltinESMExports();
      let puts = 0;
      const server = createServer(async (request, response) => {
        if (request.method === 'PUT') {
          puts++;
          assert.equal(request.headers['if-none-match'], '*');
          assert.equal(request.headers['content-length'], String(bytes.length));
          assert.equal(request.headers['content-type'], 'image/png');
          if (${status} === 200) {
            let received = 0;
            const hash = createHash('sha256');
            for await (const chunk of request) { received += chunk.length; hash.update(chunk); }
            assert.equal(received, bytes.length);
            assert.equal(hash.digest('hex'), ${JSON.stringify(object.row.sha256)});
          }
          response.writeHead(${status});
          response.end('early response');
          request.resume();
        } else { response.writeHead(200); response.end(bytes); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const url = 'http://127.0.0.1:' + server.address().port + '/object';
      const runner = async (_command, args, options = {}) => args[1].includes('sha256sum -c -')
        ? options.input.split('\\n').filter(Boolean).map(line => line.replace(/^[0-9a-f]{64} {2}/, '') + ': OK').join('\\n')
        : identity.manifestSha256 + '  manifest.jsonl\\n';
      try {
        for (let index = 0; index < (${status} === 502 ? 2 : 12); index++) {
          const copy = runMigrationCopy({ identity, signing: ${JSON.stringify(SIGNING)}, runner,
            presignPut: async () => url, presignGet: async () => url,
            fetchFn: index === 0 && ${status} !== 200 ? async (_url, init) => {
              if (init.method === 'PUT') { puts++; return new Response('early', { status: ${status} }); }
              return new Response(bytes);
            } : fetch });
          if (${status} === 502) await assert.rejects(copy, /PUT failed.*HTTP 502/);
          else assert.equal((await copy).receipt.object_count, 1);
          await delay(20);
          assert(streams.every(stream => stream.destroyed), 'Early response leaked an open input file stream');
          rmSync(runDir + '/r2-migration-checkpoint.json', { force: true });
        }
        assert.equal(puts, ${status} === 502 ? 6 : 12);
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  }, 35_000);

  it.each(
    [500, 502, 503, 504].flatMap(status => [false, true].map(alwaysFails => ({ status, alwaysFails })))
  )('bounds conditional $status retries (always fails: $alwaysFails)', async ({ status: retryStatus, alwaysFails }) => {
    const object = makeObject(INPUT_BUCKET, 'user/retry.png', 'retry bytes');
    const { run, identity } = await setup([object]);
    const r2 = new FakeR2();
    const streams: Array<fs.ReadStream> = [];
    const statuses: number[] = [];
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback: any, ms: any, ...args: any[]) => {
      if (ms === 1000 || ms === 2000) delays.push(ms);
      return realSetTimeout(callback, ms === 1000 || ms === 2000 ? 0 : ms, ...args);
    });
    const fetchFn = async (url: string, init: any = {}) => {
      if (init.method !== 'PUT') return r2.fetch(url, init);
      streams.push(init.body);
      expect(init.headers).toMatchObject({
        'if-none-match': '*', 'content-length': String(object.buffer.length), 'content-type': 'image/png',
      });
      const response = await r2.fetch(url, init);
      const status = alwaysFails || streams.length === 1 ? retryStatus : response.status;
      statuses.push(status);
      return new Response(null, { status });
    };
    try {
      const copy = runMigrationCopy({ identity, signing: SIGNING, fetchFn, runner: makeRunner(identity) });
      if (alwaysFails) {
        await expect(copy).rejects.toThrow(new RegExp(`PUT failed.*HTTP ${retryStatus}`));
        expect(statuses).toEqual([retryStatus, retryStatus, retryStatus]);
        expect(delays).toEqual([1000, 2000]);
        expect(r2.gets).toHaveLength(0);
        expect(fs.existsSync(path.join(run.runDir, 'r2-migration-receipt.json'))).toBe(false);
      } else {
        expect((await copy).receipt.object_count).toBe(1);
        expect(statuses).toEqual([retryStatus, 412]);
        expect(delays).toEqual([1000]);
        expect(r2.gets).toHaveLength(1);
      }
      expect(new Set(streams).size).toBe(streams.length);
      expect(streams.every(stream => stream.destroyed)).toBe(true);
      expect(r2.store.get(targetPathname('miu-private', 'inputs/user/retry.png'))).toEqual(object.buffer);
    } finally { timer.mockRestore(); }
  });

  it.each([403, 501])('does not retry HTTP %s', async status => {
    const object = makeObject(INPUT_BUCKET, 'user/no-retry.png', 'no retry bytes');
    const { run, identity } = await setup([object]);
    const streams: Array<fs.ReadStream> = [];
    const fetchFn = async (_url: string, init: any) => {
      expect(init.method).toBe('PUT');
      streams.push(init.body);
      await new Response(init.body).arrayBuffer();
      return new Response(null, { status });
    };
    await expect(
      runMigrationCopy({ identity, signing: SIGNING, fetchFn, runner: makeRunner(identity) })
    ).rejects.toThrow(new RegExp(`PUT failed.*HTTP ${status}`));
    expect(streams).toHaveLength(1);
    expect(streams[0].destroyed).toBe(true);
    expect(fs.existsSync(path.join(run.runDir, 'r2-migration-receipt.json'))).toBe(false);
  });

  it('copies every object, read-back verified, and publishes a receipt', async () => {
    const { saved, blog, input, run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();

    const result = await runMigrationCopy({
      identity, runDir: run.runDir, signing: SIGNING,
      fetchFn: r2.fetch, runner: makeRunner(identity),
    });

    expect(result.receipt.object_count).toBe(3);
    expect(result.receipt.total_bytes).toBe(saved.buffer.length + blog.buffer.length + input.buffer.length);
    expect(result.receipt.manifest_sha256).toBe(identity.manifestSha256);
    expect(result.receipt.objects.every((o: AnyRow) => o.target_key && o.sha256)).toBe(true);
    expect(r2.store.get(targetPathname('miu-private', 'saved/user/aaa.png'))).toEqual(saved.buffer);
    expect(r2.store.get(targetPathname('miu-public', 'posts/bbb.jpg'))).toEqual(blog.buffer);
    expect(fs.existsSync(path.join(run.runDir, 'r2-migration-receipt.json'))).toBe(true);
  });

  it('binds content-length, content-type and if-none-match through the production presigner', async () => {
    const { saved, run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();

    await runMigrationCopy({
      identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity),
    });

    const savedPut = r2.puts.find(p => p.url.includes('/miu-private/saved/user/aaa.png'))!;
    expect(savedPut.method).toBe('PUT');
    expect(savedPut.headers['if-none-match']).toBe('*');
    expect(savedPut.headers['content-type']).toBe('image/png');
    expect(savedPut.headers['content-length']).toBe(String(saved.buffer.length));
    const signedHeaders = decodeURIComponent(new URL(savedPut.url).searchParams.get('X-Amz-SignedHeaders') ?? '');
    expect(signedHeaders).toContain('content-length');
    expect(signedHeaders).toContain('content-type');
    expect(signedHeaders).toContain('if-none-match');
    expect(savedPut.url).toContain('X-Amz-Signature=');
    expect(r2.store.get(targetPathname('miu-private', 'saved/user/aaa.png'))).toEqual(saved.buffer);
  });

  it('stops before any PUT when the local artifact bytes changed', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    fs.writeFileSync(path.join(run.runDir, SAVED_BUCKET, 'user/aaa.png'), 'tampered local bytes');
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/SHA256 mismatch|byte count mismatch/);
    expect(r2.puts).toHaveLength(0);
  });

  it('stops before any PUT when a local artifact is missing', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    fs.rmSync(path.join(run.runDir, BLOG_BUCKET, 'posts/bbb.jpg'));
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/Missing expected file/);
    expect(r2.puts).toHaveLength(0);
  });

  it('stops before any PUT when the remote laptop proof fails', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity, 'failed') })
    ).rejects.toThrow(/Remote checksum verification failed/);
    expect(r2.puts).toHaveLength(0);
  });

  it('stops before any PUT when the local artifact is a symlink', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const target = path.join(run.runDir, INPUT_BUCKET, '22222222-2222-4222-8222-222222222222/ccc.webp');
    fs.rmSync(target);
    fs.symlinkSync(path.join(root, 'outside'), target);
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/Symlink escape/);
    expect(r2.puts).toHaveLength(0);
  });

  it('accepts an existing target (412) only when the read-back matches', async () => {
    const { saved, run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();
    r2.store.set(targetPathname('miu-private', 'saved/user/aaa.png'), saved.buffer);

    const result = await runMigrationCopy({
      identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity),
    });

    expect(result.receipt.object_count).toBe(3);
    expect(r2.store.get(targetPathname('miu-private', 'saved/user/aaa.png'))).toEqual(saved.buffer);
  });

  it('fails and preserves the object on 412 with different bytes', async () => {
    const { saved, run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();
    const wrong = Buffer.from(saved.buffer);
    wrong[0] ^= 0xff;
    r2.store.set(targetPathname('miu-private', 'saved/user/aaa.png'), wrong);

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/Read-back sha256 mismatch/);
    expect(r2.store.get(targetPathname('miu-private', 'saved/user/aaa.png'))).toEqual(wrong);
  });

  it('publishes no receipt when a read-back does not match', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();
    r2.corruptReads = true;

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/Read-back/);
    expect(fs.existsSync(path.join(run.runDir, 'r2-migration-receipt.json'))).toBe(false);
  });

  it('refuses a checkpoint bound to a foreign manifest', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    fs.writeFileSync(
      path.join(run.runDir, 'r2-migration-checkpoint.json'),
      JSON.stringify({ manifest_sha256: 'f'.repeat(64), plan_sha256: 'e'.repeat(64), verified: {} })
    );
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/different manifest or plan/);
    expect(r2.puts).toHaveLength(0);
  });

  it('re-reads a completed R2 key on resume and fails when the remote object changed', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    fs.writeFileSync(
      path.join(run.runDir, 'r2-migration-checkpoint.json'),
      JSON.stringify({ manifest_sha256: identity.manifestSha256, plan_sha256: buildMigrationPlanSha(identity), verified: {} })
    );
    const r2 = new FakeR2();

    // First run completes the copy and writes the real checkpoint.
    await runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) });

    // The remote object changes between runs; a resume must re-hash and fail.
    r2.store.set(targetPathname('miu-public', 'posts/bbb.jpg'), Buffer.from('changed remote bytes here'));
    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/Read-back/);
  });

  it('stops future batches after a partial failure', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();
    r2.failPutAt = 1;

    await expect(
      runMigrationCopy({
        identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity), batchSize: 1,
      })
    ).rejects.toThrow(/PUT failed/);
    expect(r2.puts).toHaveLength(1);
    expect(fs.existsSync(path.join(run.runDir, 'r2-migration-receipt.json'))).toBe(false);
  });

  it('fails before any network when a checkpoint entry has a wrong sha', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    writeCheckpointEntries(run.runDir, identity, verified => {
      verified[Object.keys(verified)[0]].sha256 = 'a'.repeat(64);
    });
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/wrong sha256/);
    expect(r2.puts).toHaveLength(0);
    expect(r2.gets).toHaveLength(0);
    expect(fs.existsSync(path.join(run.runDir, 'r2-migration-receipt.json'))).toBe(false);
  });

  it('fails before any network when a checkpoint entry has a wrong source or target', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    writeCheckpointEntries(run.runDir, identity, verified => {
      verified[Object.keys(verified)[0]].source_path = 'evil.png';
    });
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/wrong source_path/);
    expect(r2.puts).toHaveLength(0);
    expect(fs.existsSync(path.join(run.runDir, 'r2-migration-receipt.json'))).toBe(false);
  });

  it('ignores untrusted checkpoint bytes and sums the actual verified bytes', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();
    await runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) });

    const checkpointFile = path.join(run.runDir, 'r2-migration-checkpoint.json');
    const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
    checkpoint.verified[Object.keys(checkpoint.verified)[0]].bytes = 999_999;
    fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint));

    const result = await runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) });
    expect(result.receipt.total_bytes).toBe(identity.totalBytes);
  });

  it('preserves a prior receipt and leaves no live receipt when a resume read-back fails', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();
    await runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) });

    const receiptPath = path.join(run.runDir, 'r2-migration-receipt.json');
    const prior = fs.readFileSync(receiptPath, 'utf8');
    r2.store.set(targetPathname('miu-public', 'posts/bbb.jpg'), Buffer.from('changed remote bytes here'));

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/Read-back/);
    expect(fs.existsSync(receiptPath)).toBe(false);
    const previousPath = path.join(run.runDir, '.previous', `${sha256(prior)}.json`);
    expect(fs.existsSync(previousPath)).toBe(true);
    expect(fs.readFileSync(previousPath, 'utf8')).toBe(prior);
  });

  it('refuses a runDir override that differs from the verified identity', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-r2foreign-'));
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: foreign, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/runDir override/);
    fs.rmSync(foreign, { recursive: true, force: true });
    expect(r2.puts).toHaveLength(0);
  });

  it('rejects a symlinked checkpoint or receipt path before any network', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const outside = path.join(root, 'outside.json');
    fs.writeFileSync(outside, '{}');
    const linkPath = path.join(run.runDir, 'evil-cp.json');
    fs.symlinkSync(outside, linkPath);
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, checkpointPath: linkPath, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/Symlink escape/);
    expect(r2.puts).toHaveLength(0);
    expect(r2.gets).toHaveLength(0);
  });

  it('stops a read-back stream as soon as it exceeds the expected size', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    let pulls = 0;
    let cancelled = false;
    const fetchFn = async (_url: string, init: any = {}) => {
      if ((init.method ?? 'GET') === 'PUT') {
        for await (const part of init.body) void part;
        return new Response(null, { status: 200 });
      }
      const stream = new ReadableStream({
        pull(controller) {
          pulls += 1;
          controller.enqueue(new Uint8Array(1024));
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(stream, { status: 200 });
    };

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn, runner: makeRunner(identity) })
    ).rejects.toThrow(/Read-back overrun/);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(64);
    expect(fs.existsSync(path.join(run.runDir, 'r2-migration-receipt.json'))).toBe(false);
  });

  it('refuses an unsafe declared MIME and a zero-byte image at plan time', async () => {
    const base = { bucket: SAVED_BUCKET, bytes: 3, sha256: 'a'.repeat(64), path: 'user/x.png' };

    const html = {
      manifestSha256: 'b'.repeat(64), objectCount: 1, totalBytes: 3,
      manifest: [{ ...base, content_type: 'text/html' }],
    };
    expect(() => buildMigrationPlan(html)).toThrow(/Unsupported content type/);

    const zero = {
      manifestSha256: 'b'.repeat(64), objectCount: 1, totalBytes: 0,
      manifest: [{ ...base, bytes: 0 }],
    };
    expect(() => buildMigrationPlan(zero)).toThrow(/Invalid byte count/);

    const buffer = Buffer.from('saved bytes');
    const row = {
      bucket: SAVED_BUCKET, path: 'user/aaa.png', bytes: buffer.length, sha256: sha256(buffer),
      created_at: CREATED, updated_at: UPDATED, db_reference: false, content_type: 'text/html',
    };
    const run = makeBackupRun(root, [{ buffer, row }]);
    const identity = await loadIdentity(run.runDir);
    const r2 = new FakeR2();
    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow(/Unsupported content type/);
    expect(r2.puts).toHaveLength(0);
  });

  it('refuses a run dir with no verified receipt before any PUT', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    fs.rmSync(path.join(run.runDir, 'backup-verification.json'));
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow();
    expect(r2.puts).toHaveLength(0);
  });

  it('refuses a synthetic identity that does not match the verified run before any PUT', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const synthetic = { ...identity, manifestSha256: 'f'.repeat(64) };
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity: synthetic, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(synthetic) })
    ).rejects.toThrow(/does not match the verified backup run/);
    expect(r2.puts).toHaveLength(0);
  });

  it('refuses an altered manifest that no longer matches the receipt before any PUT', async () => {
    const { run } = threeBucketBackup(root);
    const identity = await loadIdentity(run.runDir);
    const extra = { bucket: SAVED_BUCKET, path: 'user/extra.png', bytes: 3, sha256: 'a'.repeat(64), created_at: CREATED, updated_at: UPDATED, db_reference: false };
    fs.appendFileSync(path.join(run.runDir, 'manifest.jsonl'), `${JSON.stringify(extra)}\n`);
    const r2 = new FakeR2();

    await expect(
      runMigrationCopy({ identity, runDir: run.runDir, signing: SIGNING, fetchFn: r2.fetch, runner: makeRunner(identity) })
    ).rejects.toThrow();
    expect(r2.puts).toHaveLength(0);
  });
});

function writeCheckpointEntries(runDir: string, identity: AnyRow, mutate?: (verified: AnyRow, plan: AnyRow) => void) {
  const plan = buildMigrationPlan(identity);
  const verified: AnyRow = {};
  for (const entry of plan.mapping) {
    verified[`${entry.targetBucket}::${entry.targetKey}`] = {
      target_bucket: entry.targetBucket,
      target_key: entry.targetKey,
      source_bucket: entry.sourceBucket,
      source_path: entry.sourcePath,
      sha256: entry.sha256,
      bytes: entry.bytes,
    };
  }
  if (mutate) mutate(verified, plan);
  fs.writeFileSync(
    path.join(runDir, 'r2-migration-checkpoint.json'),
    JSON.stringify({ manifest_sha256: identity.manifestSha256, plan_sha256: buildMigrationPlanSha(identity), verified })
  );
}

function buildMigrationPlanSha(identity: AnyRow): string {
  const plan = buildMigrationPlan(identity);
  return crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

describe('r2-migration: CLI', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-r2cli-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('requires --confirm before any credential or process work', async () => {
    await expect(runMigrateCli(['copy'])).rejects.toThrow(/--confirm/);
  });

  it('writes a frozen plan read-only with no credentials', async () => {
    const { run } = threeBucketBackup(root);
    await runMigrateCli(['plan', '--manifest', run.runDir]);
    const planPath = path.join(run.runDir, 'r2-migration-plan.json');
    expect(fs.existsSync(planPath)).toBe(true);
    expect(fs.existsSync(path.join(run.runDir, 'r2-migration-plan.digest'))).toBe(true);
    const loaded = await loadFrozenMigrationPlan({ backupRunDir: run.runDir });
    expect(loaded.plan.mapping).toHaveLength(3);
  });
});
