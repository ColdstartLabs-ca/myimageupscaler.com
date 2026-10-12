import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as engine from '../../../scripts/storage/verify-r2-references.mjs';
import { presignGetUrl } from '../../../server/services/r2-presign.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  DEFAULT_PUBLIC_BASE,
  SOURCE_SUPABASE_ORIGIN,
  PLAN_FILE,
  collectR2References,
  classifySourceUrl,
  extractBodyUrls,
  replaceVerifiedBlogUrls,
  verifyR2References,
  writeReferencePlan,
  runVerifyReferencesCli,
} = engine as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

type AnyRow = Record<string, any>;

const RUN_ID = 'backup-run-2026-10-13';
const CREATED = '2026-10-01T00:00:00.000Z';
const UPDATED = '2026-10-02T00:00:00.000Z';
const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const SIGNING = { endpoint: ENDPOINT, accessKeyId: 'test-key', secretAccessKey: 'test-secret' };
const SUPABASE = `${SOURCE_SUPABASE_ORIGIN}/storage/v1/object/public/blog-images`;
const KNOWN_MISSING_BLOG = '2026/01/1769887240667-tools-inline-1.webp';

function sha256(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makeObject(bucket: string, objectPath: string, content: string) {
  const buffer = Buffer.from(content);
  return {
    buffer,
    row: { bucket, path: objectPath, bytes: buffer.length, sha256: sha256(buffer), created_at: CREATED, updated_at: UPDATED, db_reference: true },
  };
}

function writeArtifact(runDir: string, bucket: string, objectPath: string, content: Buffer) {
  const target = path.join(runDir, bucket, objectPath);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, content);
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
  return { runDir, rows };
}

async function loadIdentity(runDir: string): Promise<AnyRow> {
  const { loadBackupIdentity } = await import('../../../scripts/storage/backup-verification.mjs');
  return (loadBackupIdentity as any)(runDir);
}

/** In-memory R2 that serves full-GET read-backs keyed by URL pathname. */
class FakeR2 {
  store = new Map<string, Buffer>();
  gets: string[] = [];
  calls: Array<{ url: string; pathname: string; init: any }> = [];
  corruptReads = false;
  redirects = new Set<string>();
  encodings = new Map<string, string>();

  fetch = async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET';
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    if (method === 'GET') {
      this.gets.push(pathname);
      this.calls.push({ url: parsed.href, pathname, init });
      if (this.redirects.has(pathname)) {
        return new Response('redirect', { status: 302, headers: { location: 'https://login.example.com' } });
      }
      const stored = this.store.get(pathname);
      if (!stored) return new Response('missing', { status: 404 });
      const headers = new Headers();
      const encoding = this.encodings.get(pathname);
      if (encoding) headers.set('content-encoding', encoding);
      const payload = this.corruptReads ? Buffer.from('tampered-read-back!!') : stored;
      return new Response(new Uint8Array(payload), { status: 200, headers });
    }
    return new Response('bad', { status: 400 });
  };
}

function makeRunner(identity: AnyRow, mode = 'ok') {
  return async (command: string, args: string[], options: { input?: string } = {}) => {
    if (command === 'ssh' && args[1].includes('sha256sum -c -')) {
      if (mode === 'failed') return 'saved-images/x.png: FAILED\n';
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

function seed(r2: FakeR2, saved: { buffer: Buffer }, blog: { buffer: Buffer }) {
  r2.store.set('/miu-private/saved/user/aaa.png', saved.buffer);
  r2.store.set('/miu-public/posts/bbb.jpg', blog.buffer);
  r2.store.set('/posts/bbb.jpg', blog.buffer);
}

function referenceFixture(root: string) {
  const saved = makeObject('saved-images', 'user/aaa.png', 'saved bytes');
  const blog = makeObject('blog-images', 'posts/bbb.jpg', 'blog bytes');
  const run = makeBackupRun(root, [saved, blog]);
  const savedRows = [
    { id: 's1', user_id: 'u1', storage_path: 'user/aaa.png', storage_backend: 'supabase', original_filename: 'a.png', file_size_bytes: 11 },
  ];
  const blogRows = [
    { id: 'b1', storage_path: 'posts/bbb.jpg', url: `${SUPABASE}/posts/bbb.jpg`, alt_text: 'hello' },
  ];
  const postRows = [
    {
      id: 'p1',
      featured_image_url: `${SUPABASE}/posts/bbb.jpg`,
      content: `Body ![x](${SUPABASE}/posts/bbb.jpg) keeps 12.5 and café.`,
      title: 'Unrelated',
    },
  ];
  return { saved, blog, run, savedRows, blogRows, postRows };
}

async function runEngine(root: string, r2: FakeR2, overrides: AnyRow = {}) {
  const { run, savedRows, blogRows, postRows } = referenceFixture(root);
  const identity = await loadIdentity(run.runDir);
  return verifyR2References({
    identity,
    savedRows,
    blogRows,
    postRows,
    signing: SIGNING,
    presignGet: presignGetUrl,
    fetchFn: r2.fetch,
    runner: makeRunner(identity),
    ...overrides,
  });
}

describe('r2-references: pure URL classification', () => {
  it('classifies supabase, assets-domain, ambiguous, unknown and external URLs', () => {
    expect(classifySourceUrl(`${SUPABASE}/a/b.png`).path).toBe('a/b.png');
    expect(classifySourceUrl(`${DEFAULT_PUBLIC_BASE}/a/b.png`).path).toBe('a/b.png');
    expect(classifySourceUrl('https://example.com/a.png').kind).toBe('none');
    expect(classifySourceUrl('https://proj.supabase.co/storage/v1/object/public/other/x.png').kind).toBe('unknown');
    expect(classifySourceUrl('https://proj.supabase.co/storage/v1/object/sign/blog-images/x.png').kind).toBe('unknown');
    expect(classifySourceUrl(`${DEFAULT_PUBLIC_BASE}/storage/v1/object/public/blog-images/a.png`).kind).toBe('ambiguous');
  });

  it('replaces only verified paths and preserves trailing punctuation and other content', () => {
    const verified = new Set(['a/b.png']);
    const content = `![ok](${SUPABASE}/a/b.png). ![no](${SUPABASE}/c/d.png) 12.5`;
    const out = replaceVerifiedBlogUrls(content, verified, DEFAULT_PUBLIC_BASE);
    expect(out).toContain(`![ok](${DEFAULT_PUBLIC_BASE}/a/b.png).`);
    expect(out).toContain(`${SUPABASE}/c/d.png`);
    expect(out).toContain('12.5');
    expect(out).not.toContain('tampered');
  });

  it('leaves a foreign host collision byte-unchanged and never treats it as a path', () => {
    const foreign = 'https://evil.example.com/storage/v1/object/public/blog-images/posts/bbb.jpg';
    const content = `![x](${foreign}) keeps 12.5`;
    const out = replaceVerifiedBlogUrls(content, new Set(['posts/bbb.jpg']), DEFAULT_PUBLIC_BASE);
    expect(out).toBe(content);
    expect(classifySourceUrl(foreign).kind).not.toBe('path');
  });

  it('collects each absolute URL from a Markdown and HTML body', () => {
    const content = `![a](${DEFAULT_PUBLIC_BASE}/posts/bbb.jpg) <img src="${DEFAULT_PUBLIC_BASE}/posts/ccc.jpg" alt="x">`;
    expect(extractBodyUrls(content)).toEqual([
      `${DEFAULT_PUBLIC_BASE}/posts/bbb.jpg`,
      `${DEFAULT_PUBLIC_BASE}/posts/ccc.jpg`,
    ]);
  });
});

describe('r2-references: verifyR2References', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-refs-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('verifies every reference with local + laptop + R2 GET proof and emits a frozen plan', async () => {
    const r2 = new FakeR2();
    const { run, saved } = referenceFixture(root);
    const { blog } = referenceFixture(root);
    seed(r2, saved, blog);

    const result = await runEngine(root, r2);

    expect(result.ok).toBe(true);
    expect(result.missing_count).toBe(0);
    expect(result.source_etag_unbound).toBe(2);
    expect(result.verified_count).toBeGreaterThan(0);
    expect(r2.gets).toContain('/miu-private/saved/user/aaa.png');
    expect(r2.gets).toContain('/miu-public/posts/bbb.jpg');
    expect(r2.gets).toContain('/posts/bbb.jpg');

    const gallery = result.plan.gallery.find((e: AnyRow) => e.id === 's1');
    expect(gallery.target_bucket).toBe('miu-private');
    expect(gallery.target_key).toBe('saved/user/aaa.png');
    expect(gallery.before.storage_backend).toBe('supabase');
    expect(gallery.after.storage_backend).toBe('r2');
    expect(gallery.user_id).toBe('u1');
    expect(gallery.before.original_filename).toBe('a.png');

    const blogImage = result.plan.blog.find((e: AnyRow) => e.table === 'blog_images');
    expect(blogImage.after.url).toBe(`${DEFAULT_PUBLIC_BASE}/posts/bbb.jpg`);

    const post = result.plan.blog.find((e: AnyRow) => e.table === 'blog_posts');
    expect(post.after.featured_image_url).toBe(`${DEFAULT_PUBLIC_BASE}/posts/bbb.jpg`);
    expect(post.after.content).toContain(`${DEFAULT_PUBLIC_BASE}/posts/bbb.jpg`);
    expect(post.after.content).toContain('12.5');
    expect(post.after.content).toContain('café');
    expect(post.after.title).toBe('Unrelated');
    expect(result.plan_sha256).toMatch(/^[0-9a-f]{64}$/);

    fs.writeFileSync(path.join(run.runDir, 'x'), 'x');
    const direct = await loadIdentity(run.runDir);
    expect(direct.manifestSha256).toBe(result.manifest_sha256);
  });

  describe('live native fence', () => {
    const frozen = { public: false, file_size_limit: 1, allowed_mime_types: ['application/x-miu-storage-frozen'] };
    const state = (patch: AnyRow = {}, policies: AnyRow[] = []) => ({
      buckets: Object.fromEntries(['saved-images', 'blog-images', 'upscale-inputs'].map(id => [id, { ...frozen, ...(patch[id] ?? {}) }])),
      policies,
    });
    const fenceOf = async (fenceState?: unknown) => {
      const r2 = new FakeR2();
      const { saved, blog } = referenceFixture(root);
      seed(r2, saved, blog);
      return (await runEngine(root, r2, { fenceState })).source_native_fenced;
    };

    it('is false without a live state, as before', async () => {
      expect(await fenceOf(undefined)).toBe(false);
      expect(await fenceOf(null)).toBe(false);
      expect(await fenceOf({})).toBe(false);
    });

    it('is true only when all three buckets are frozen and no direct-write policy exists', async () => {
      expect(await fenceOf(state())).toBe(true);
      expect(await fenceOf(state({}, [{ name: 'r', cmd: 'SELECT', roles: ['public'] }]))).toBe(true);
      expect(await fenceOf(state({ 'blog-images': { file_size_limit: null } }))).toBe(false);
      expect(await fenceOf(state({ 'upscale-inputs': { allowed_mime_types: null } }))).toBe(false);
      expect(await fenceOf(state({}, [{ name: 'w', cmd: 'INSERT', roles: ['authenticated'] }]))).toBe(false);
    });
  });

  it('does not rewrite a saved row already on the r2 backend', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    const result = await verifyR2References({
      identity,
      savedRows: [{ ...fx.savedRows[0], storage_backend: 'r2', storage_path: 'new-r2-only/no-legacy-source.png' }],
      blogRows: [], postRows: [],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });
    expect(result.plan.gallery).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.reference_count).toBe(0);
    expect(result.excluded_r2_saved_count).toBe(1);
    expect(r2.gets).toHaveLength(0);
  });

  it('fails closed on an unknown saved-image backend', () => {
    const result = collectR2References({ savedRows: [{ id: 'unknown', storage_path: 'x.png', storage_backend: 'other' }] });
    expect(result.references).toHaveLength(0);
    expect(result.failures).toEqual([{ sourceId: 'saved_images:unknown', reason: 'unknown_storage_backend' }]);
  });

  it('reports a missing current reference as missing and never verified', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    const result = await verifyR2References({
      identity,
      savedRows: [fx.savedRows[0], { id: 's9', user_id: 'u1', storage_path: 'user/missing.png', storage_backend: 'supabase' }],
      blogRows: [], postRows: [],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });
    expect(result.ok).toBe(false);
    const miss = result.missing.find((m: AnyRow) => m.sourceId === 'saved_images:s9');
    expect(miss.reason).toBe('missing_manifest');
    expect(result.verified.some((v: AnyRow) => v.sourceId === 'saved_images:s9')).toBe(false);
  });

  it('stops on an R2 byte or hash mismatch', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    r2.corruptReads = true;
    await expect(runEngine(root, r2)).rejects.toThrow(/Read-back/);
  });

  it('stops on a laptop proof failure before any plan is published', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    await expect(
      verifyR2References({
        identity,
        savedRows: fx.savedRows, blogRows: fx.blogRows, postRows: fx.postRows,
        signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity, 'failed'),
      })
    ).rejects.toThrow(/Remote checksum verification failed/);
    expect(r2.gets).toHaveLength(0);
    expect(fs.existsSync(path.join(fx.run.runDir, PLAN_FILE))).toBe(false);
  });

  it('refuses a synthetic identity that does not match the verified run', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    await expect(
      verifyR2References({
        identity: { ...identity, manifestSha256: 'f'.repeat(64) },
        savedRows: fx.savedRows, blogRows: [], postRows: [],
        signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
      })
    ).rejects.toThrow(/does not match the verified backup run/);
  });

  it('flags an unknown storage URL and preserves it in the plan', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    const result = await verifyR2References({
      identity,
      savedRows: [],
      blogRows: [{ id: 'b2', storage_path: 'other/x.png', url: 'https://proj.supabase.co/storage/v1/object/public/other/x.png' }],
      postRows: [],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });
    expect(result.ok).toBe(false);
    expect(result.missing.find((m: AnyRow) => m.sourceId === 'blog_images:b2').reason).toBe('unknown_url');
    expect(result.plan.blog).toHaveLength(0);
  });

  it('keeps a known pre-existing missing blog reference as an explicit blocker', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    const result = await verifyR2References({
      identity,
      savedRows: [], blogRows: [],
      postRows: [{ id: 'p2', featured_image_url: `${SUPABASE}/${KNOWN_MISSING_BLOG}`, content: `![x](${SUPABASE}/${KNOWN_MISSING_BLOG})` }],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });
    expect(result.ok).toBe(false);
    const miss = result.missing.find((m: AnyRow) => m.sourceId === 'blog_posts:p2' && m.source === KNOWN_MISSING_BLOG);
    expect(miss.reason).toBe('missing_manifest');
    expect(result.plan.blog).toHaveLength(0);
  });

  it.each(['content', 'featured_image_url', 'other-post', 'other-path'])(
    'accepts only the exact original missing body image (%s)', async mode => {
      const fx = referenceFixture(root);
      const identity = await loadIdentity(fx.run.runDir);
      const original = `${SUPABASE}/${KNOWN_MISSING_BLOG}`;
      const url = mode === 'other-path' ? `${original}.other` : original;
      const id = mode === 'other-post' ? 'another-post' : 'b26a2f86-ec30-40d0-8a33-bca21bfb7417';
      const result = await verifyR2References({
        identity, savedRows: [], blogRows: [],
        postRows: [{ id, ...(mode === 'featured_image_url' ? { featured_image_url: url } : { content: `![x](${url})` }) }],
        signing: SIGNING, presignGet: presignGetUrl, fetchFn: new FakeR2().fetch, runner: makeRunner(identity),
      });
      expect(result.ok).toBe(mode === 'content');
      expect(result.missing_count).toBe(1);
      expect(result.plan.blog).toHaveLength(0);
    }
  );

  it('supports a new assets-domain blog URL with the same path', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    const result = await verifyR2References({
      identity,
      savedRows: [],
      blogRows: [{ id: 'b3', storage_path: 'posts/bbb.jpg', url: `${DEFAULT_PUBLIC_BASE}/posts/bbb.jpg` }],
      postRows: [],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });
    expect(result.ok).toBe(true);
    // Already on the assets domain: verified, no rewrite needed.
    expect(result.plan.blog).toHaveLength(0);
  });

  it('reports a missing assets-domain target referenced in a post body', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    const result = await verifyR2References({
      identity,
      savedRows: [], blogRows: [],
      postRows: [{ id: 'pa', content: `![x](${DEFAULT_PUBLIC_BASE}/posts/missing.jpg)` }],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });
    expect(result.ok).toBe(false);
    const miss = result.missing.find((m: AnyRow) => m.sourceId === 'blog_posts:pa' && m.source === 'posts/missing.jpg');
    expect(miss.reason).toBe('missing_manifest');
  });

  it('validates each assets-domain body reference separately', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    const result = await verifyR2References({
      identity,
      savedRows: [], blogRows: [],
      postRows: [{ id: 'pb', content: `![a](${DEFAULT_PUBLIC_BASE}/posts/bbb.jpg) ![b](${DEFAULT_PUBLIC_BASE}/posts/missing.jpg)` }],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });
    expect(result.verified.some((v: AnyRow) => v.sourceId === 'blog_posts:pb' && v.path === 'posts/bbb.jpg')).toBe(true);
    const miss = result.missing.find((m: AnyRow) => m.sourceId === 'blog_posts:pb' && m.source === 'posts/missing.jpg');
    expect(miss.reason).toBe('missing_manifest');
  });

  it('verifies an assets-domain target inside an HTML img src', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    const result = await verifyR2References({
      identity,
      savedRows: [], blogRows: [],
      postRows: [{ id: 'ph', content: `<p>hi</p><img src="${DEFAULT_PUBLIC_BASE}/posts/bbb.jpg" alt="x">` }],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });
    expect(result.ok).toBe(true);
    expect(result.verified.some((v: AnyRow) => v.sourceId === 'blog_posts:ph' && v.path === 'posts/bbb.jpg')).toBe(true);
  });

  it('flags an unsupported trusted storage URL in the body as unknown', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    const identity = await loadIdentity(fx.run.runDir);
    const result = await verifyR2References({
      identity,
      savedRows: [], blogRows: [],
      postRows: [{ id: 'pu', content: `![x](${SOURCE_SUPABASE_ORIGIN}/storage/v1/object/public/other/x.png)` }],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });
    expect(result.ok).toBe(false);
    expect(result.missing.find((m: AnyRow) => m.sourceId === 'blog_posts:pu').reason).toBe('unknown_url');
  });

  it('fails closed on a noncanonical publicBase before any IO', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    const identity = await loadIdentity(fx.run.runDir);
    await expect(
      verifyR2References({
        identity,
        savedRows: fx.savedRows, blogRows: fx.blogRows, postRows: fx.postRows,
        signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
        publicBase: 'https://evil.example.com',
      })
    ).rejects.toThrow(/canonical/);
    expect(r2.gets).toHaveLength(0);
  });

  it('rejects a non-R2 signing endpoint before any network', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    const identity = await loadIdentity(fx.run.runDir);
    await expect(
      verifyR2References({
        identity,
        savedRows: fx.savedRows, blogRows: [], postRows: [],
        signing: { ...SIGNING, endpoint: 'https://evil.example.com' },
        presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
      })
    ).rejects.toThrow(/Cloudflare R2 account endpoint/);
    expect(r2.gets).toHaveLength(0);
  });

  it('proves the public assets-domain GET for each unique blog target with no-store', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);

    const result = await runEngine(root, r2);

    expect(result.ok).toBe(true);
    const publicCall = r2.calls.find(c => c.pathname === '/posts/bbb.jpg');
    expect(publicCall).toBeTruthy();
    expect(publicCall!.url).toBe(`${DEFAULT_PUBLIC_BASE}/posts/bbb.jpg`);
    expect(publicCall!.init.redirect).toBe('error');
    expect(publicCall!.init.cache).toBe('no-store');
    // Gallery objects stay private: no public GET for the saved image.
    expect(r2.calls.some(c => c.pathname === '/user/aaa.png' || c.pathname === '/saved/user/aaa.png')).toBe(false);
  });

  it('fails when the S3 proof passes but the public bytes differ', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    r2.store.set('/posts/bbb.jpg', Buffer.from('different public bytes!!'));

    await expect(runEngine(root, r2)).rejects.toThrow(/Read-back/);
    expect(r2.gets).toContain('/miu-public/posts/bbb.jpg');
    expect(r2.gets).toContain('/posts/bbb.jpg');
  });

  it('fails when the public assets-domain GET returns 404', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    r2.store.delete('/posts/bbb.jpg');

    await expect(runEngine(root, r2)).rejects.toThrow(/Read-back/);
  });

  it('fails when the public assets-domain GET redirects', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    r2.redirects.add('/posts/bbb.jpg');

    await expect(runEngine(root, r2)).rejects.toThrow(/Read-back/);
  });

  it('rejects a non-identity content-encoding on the public proof', async () => {
    const r2 = new FakeR2();
    const fx = referenceFixture(root);
    seed(r2, fx.saved, fx.blog);
    r2.encodings.set('/posts/bbb.jpg', 'gzip');

    await expect(runEngine(root, r2)).rejects.toThrow(/content encoding/);
  });

  it('preserves slashes and encodes each segment of a mixed blog path', async () => {
    const r2 = new FakeR2();
    const nestedPath = '2026/01/1234-image.webp';
    const saved = makeObject('saved-images', 'user/aaa.png', 'saved bytes');
    const blog = makeObject('blog-images', nestedPath, 'nested blog bytes');
    const run = makeBackupRun(root, [saved, blog]);
    const identity = await loadIdentity(run.runDir);
    r2.store.set('/miu-private/saved/user/aaa.png', saved.buffer);
    r2.store.set(`/miu-public/${nestedPath}`, blog.buffer);
    r2.store.set(`/${nestedPath}`, blog.buffer);

    const result = await verifyR2References({
      identity,
      savedRows: [],
      blogRows: [{ id: 'b4', storage_path: nestedPath, url: `${SUPABASE}/${nestedPath}` }],
      postRows: [],
      signing: SIGNING, presignGet: presignGetUrl, fetchFn: r2.fetch, runner: makeRunner(identity),
    });

    expect(result.ok).toBe(true);
    const publicCall = r2.calls.find(c => c.pathname === `/${nestedPath}`);
    expect(publicCall!.url).toBe(`${DEFAULT_PUBLIC_BASE}/${nestedPath}`);
  });
});

describe('r2-references: collectR2References', () => {
  it('extracts references and structured failures without throwing', () => {
    const { references, failures } = collectR2References({
      savedRows: [{ id: 's1', storage_path: 'user/a.png' }, { id: 's2', storage_path: '../escape.png' }],
      blogRows: [{ id: 'b1', storage_path: 'posts/x.jpg', url: `${SUPABASE}/posts/x.jpg` }],
      postRows: [{ id: 'p1', featured_image_url: 'https://example.com/no.png', content: `![x](${SUPABASE}/posts/x.jpg)` }],
    });
    expect(references.some((r: AnyRow) => r.key === 'saved-images::user/a.png')).toBe(true);
    expect(references.some((r: AnyRow) => r.key === 'blog-images::posts/x.jpg')).toBe(true);
    expect(failures.find((f: AnyRow) => f.sourceId === 'saved_images:s2').reason).toBe('unsafe_path');
  });
});

describe('r2-references: plan write', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-refwrite-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes the canonical plan and digest wx 0400 and never overwrites', async () => {
    const plan = { a: 1, b: [1, 2] };
    const { planPath, digestPath, digest } = await writeReferencePlan(root, plan);
    expect(fs.readFileSync(planPath, 'utf8')).toBe(JSON.stringify(plan));
    expect(sha256(JSON.stringify(plan))).toBe(digest);
    expect(fs.readFileSync(digestPath, 'utf8')).toBe(`${digest}\n`);
    expect(fs.statSync(planPath).mode & 0o777).toBe(0o400);
    await expect(writeReferencePlan(root, plan)).rejects.toThrow(/Refusing to overwrite/);
  });

  it('rejects a symlinked plan path and a traversing path', async () => {
    const outside = path.join(root, 'outside.json');
    fs.writeFileSync(outside, '{}');
    fs.symlinkSync(outside, path.join(root, PLAN_FILE));
    await expect(writeReferencePlan(root, { a: 1 })).rejects.toThrow(/Symlink escape/);

    const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-refclean-'));
    try {
      await expect(
        writeReferencePlan(clean, { a: 1 }, { planPath: path.join(clean, '..', 'evil.json') })
      ).rejects.toThrow(/escapes the backup directory/);
    } finally {
      fs.rmSync(clean, { recursive: true, force: true });
    }
  });
});

describe('r2-references: CLI', () => {
  it('renders help and rejects malformed flags before any secret', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await runVerifyReferencesCli(['help']);
      expect(spy).toHaveBeenCalled();
      const printed = spy.mock.calls.map(call => String(call[0])).join('');
      expect(printed).toContain('Usage: node scripts/storage/verify-r2-references.mjs');
    } finally {
      spy.mockRestore();
    }
    await expect(runVerifyReferencesCli(['verify', '--bogus'])).rejects.toThrow(/Unknown flag/);
    await expect(runVerifyReferencesCli(['verify', '--manifest'])).rejects.toThrow(/Missing value/);
    await expect(
      runVerifyReferencesCli(['apply', '--manifest', 'a', '--manifest', 'b', '--confirm'])
    ).rejects.toThrow(/Duplicate flag/);
    await expect(runVerifyReferencesCli(['apply', '--manifest', 'a'])).rejects.toThrow(/--confirm/);
  });
});


describe('source-proof operator', () => {
  it.each(['valid', 'stale-bytes', 'changed-id', 'missing-version'])('captures only verified current source metadata (%s)', async mode => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-source-proof-'));
    try {
      const object = makeObject('saved-images', 'user/aaa.png', 'saved bytes');
      const run = makeBackupRun(root, [object]);
      fs.writeFileSync(path.join(run.runDir, 'backup-checkpoint.json'), JSON.stringify({downloaded: {
        'saved-images::user/aaa.png': {version: 'object-id', created_at: CREATED, updated_at: CREATED},
      }}));
      const native = {
        bucket_id: 'saved-images', name: 'user/aaa.png', id: mode === 'changed-id' ? 'other-id' : 'object-id',
        version: mode === 'missing-version' ? null : 'native-version', created_at: CREATED, updated_at: CREATED,
        metadata: {size: object.buffer.length, eTag: crypto.createHash('md5').update(mode === 'stale-bytes' ? 'other bytes' : object.buffer).digest('hex')},
      };
      const queries: string[] = [];
      const end = vi.fn(async () => {});
      const task = runVerifyReferencesCli(['source-proof', '--manifest', run.runDir], {
        config: {dbConfig: {}}, runner: vi.fn(), log: vi.fn(),
        createDb: async () => ({end, query: async (sql: string) => {
          queries.push(sql); return {rows: sql.startsWith('SELECT') ? [{row: native}] : []};
        }}),
      });
      if (mode === 'valid') {
        const proof = await task;
        expect(proof.objects).toHaveLength(1);
        expect(proof.objects[0].source.version).toBe('native-version');
        const raw = fs.readFileSync(path.join(run.runDir, 'source-object-proof.json'));
        expect(fs.readFileSync(path.join(run.runDir, 'source-object-proof.digest'), 'utf8').trim()).toBe(sha256(raw));
      } else {
        await expect(task).rejects.toThrow(/source|eTag/i);
        expect(fs.existsSync(path.join(run.runDir, 'source-object-proof.json'))).toBe(false);
      }
      expect(queries[0]).toMatch(/READ ONLY/);
      expect(queries.at(-1)).toBe('ROLLBACK');
      expect(end).toHaveBeenCalledOnce();
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
  });
});
