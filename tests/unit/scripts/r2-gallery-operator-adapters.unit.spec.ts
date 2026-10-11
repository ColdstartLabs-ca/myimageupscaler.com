import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AwsV4Signer } from 'aws4fetch';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as adaptersModule from '../../../scripts/storage/r2-gallery-operator-adapters.mjs';
import { loadBackupIdentity } from '../../../scripts/storage/backup-verification.mjs';
import { runGalleryBackupRegistration } from '../../../scripts/storage/register-gallery-backups.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  createR2GalleryAdapters,
  loadR2OperatorConfig,
  PROJECT_REF,
  GALLERY_BUCKET,
} = adaptersModule as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

type AnyRow = Record<string, any>;

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const SIGNING = { endpoint: ENDPOINT, accessKeyId: 'test-key', secretAccessKey: 'test-secret' };
const RUN_ID = 'backup-run-2026-10-13';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';
const GALLERY_PATH = `${USER_ID}/${IMAGE_ID}.png`;
const NOW_ISO = '2026-10-13T12:00:00.000Z';
const CREATED = '2026-10-01T00:00:00.123456+00:00';
const SRC_ETAG = '"src-etag-1"';
const SRC_BYTES = Buffer.from('the real gallery bytes');

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceKey(objectPath = GALLERY_PATH): string {
  return `/miu-private/saved/${objectPath}`;
}

function archiveKeyOf(pixelSha: string): string {
  return `/miu-private/archive/gallery/${IMAGE_ID}/${pixelSha}`;
}

class FakeR2 {
  store = new Map<string, Buffer>();
  etags = new Map<string, string>();
  puts: AnyRow[] = [];
  heads: string[] = [];
  headUrls: string[] = [];
  gets: string[] = [];
  getHeaders: AnyRow[] = [];
  putStatus = 200;
  headLengthOverride: number | null = null;
  getEtagOverride: string | null = null;
  getBodyOverride: Buffer | null = null;
  getContentLengthOverride: number | null = null;

  seed(pathname: string, body: Buffer, etag = SRC_ETAG): void {
    this.store.set(pathname, body);
    this.etags.set(pathname, etag);
  }

  fetch = async (url: string, init: AnyRow = {}): Promise<Response> => {
    const method = init.method ?? 'GET';
    const pathname = new URL(url).pathname;
    if (method === 'PUT') {
      this.puts.push({ pathname, url, headers: init.headers });
      const chunks: Buffer[] = [];
      for await (const part of init.body) chunks.push(Buffer.from(part));
      if (this.putStatus !== 200) return new Response('precondition failed', { status: this.putStatus });
      const body = Buffer.concat(chunks);
      this.store.set(pathname, body);
      this.etags.set(pathname, '"archive-etag-1"');
      return new Response(null, { status: 200, headers: { etag: '"archive-etag-1"' } });
    }
    if (method === 'HEAD') {
      this.heads.push(pathname);
      this.headUrls.push(url);
      const body = this.store.get(pathname);
      if (!body) return new Response('missing', { status: 404 });
      const length = this.headLengthOverride ?? body.length;
      return new Response(null, {
        status: 200,
        headers: {
          'content-length': String(length),
          etag: this.etags.get(pathname) ?? SRC_ETAG,
          'last-modified': 'Mon, 05 Oct 2026 00:00:00 GMT',
        },
      });
    }
    if (method === 'GET') {
      this.gets.push(pathname);
      this.getHeaders.push(init.headers);
      const body = this.store.get(pathname);
      if (!body) return new Response('missing', { status: 404 });
      const payload = this.getBodyOverride
        ? this.getBodyOverride
        : this.getEtagOverride === 'corrupt-bytes'
          ? Buffer.from('tampered bytes')
          : body;
      const etag = this.getEtagOverride === null ? (this.etags.get(pathname) ?? SRC_ETAG) : this.getEtagOverride;
      const length = this.getContentLengthOverride ?? payload.length;
      return new Response(new Uint8Array(payload), {
        status: 200,
        headers: { etag, 'content-length': String(length) },
      });
    }
    return new Response('bad', { status: 400 });
  };
}

function makeSavedRow(overrides: AnyRow = {}): AnyRow {
  return {
    id: IMAGE_ID,
    user_id: USER_ID,
    storage_path: GALLERY_PATH,
    storage_backend: 'r2',
    file_size_bytes: SRC_BYTES.length,
    created_at: CREATED,
    ...overrides,
  };
}

function makeDb(savedRow = makeSavedRow(), overrides: AnyRow = {}) {
  const calls: AnyRow[] = [];
  const db: AnyRow = {
    query: async (sql: string, params: AnyRow[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('gallery_expiry_backups')) return { rowCount: 1, rows: [{ image_id: IMAGE_ID }] };
      if (sql.includes('si.storage_path = $1')) return { rows: [{ row: savedRow }] };
      if (sql.includes("storage_backend = 'r2'")) return { rows: [{ row: savedRow }] };
      return { rows: [] };
    },
  };
  db.calls = calls;
  return Object.assign(db, overrides);
}

function makeRunner(identity: AnyRow) {
  const calls: AnyRow[] = [];
  const runner: any = async (command: string, args: string[], options: AnyRow = {}) => {
    calls.push({ command, args, options });
    if (command === 'rsync') return '';
    if (command === 'ssh') {
      const remote = args[1];
      if (remote.includes('mkdir -p')) return '';
      if (remote.includes('sha256sum -c -')) {
        if (options.mode === 'failed') return 'FAILED\n';
        return (options.input ?? '')
          .split('\n')
          .filter(Boolean)
          .map((line: string) => `${line.replace(/^[0-9a-f]{64}\s+/, '')}: OK`)
          .join('\n');
      }
      if (remote.includes('manifest.jsonl')) return `${identity.manifestSha256}  manifest.jsonl\n`;
    }
    return '';
  };
  runner.calls = calls;
  return runner;
}

describe('r2-gallery-operator-adapters: loadR2OperatorConfig', () => {
  const dotenv = [
    `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID}`,
    'R2_ACCESS_KEY_ID=key-id',
    'R2_SECRET_ACCESS_KEY=secret-key',
    'SUPABASE_DB_PASSWORD=db-pass',
    'SUPABASE_DB_REGION=us-east-1',
    'IGNORED=value',
  ].join('\n');

  it('reads the single API secret and derives signing and pooler config', () => {
    const calls: AnyRow[] = [];
    const exec = (command: string, args: string[]) => {
      calls.push({ command, args });
      return dotenv;
    };
    const config = loadR2OperatorConfig({ exec });
    expect(config.signing).toEqual({
      endpoint: ENDPOINT,
      accessKeyId: 'key-id',
      secretAccessKey: 'secret-key',
    });
    expect(config.dbConfig).toEqual({
      dbHost: 'aws-0-us-east-1.pooler.supabase.com',
      dbUser: `postgres.${PROJECT_REF}`,
      dbPassword: 'db-pass',
    });
    expect(calls[0].command).toBe('gcloud');
    expect(calls[0].args).toContain('--secret=myimageupscaler-api-prod');
    expect(calls[0].args).toContain('--project=myimageupscaler-auth');
    expect(JSON.stringify(config)).not.toContain('CLIENT');
  });

  it('rejects a malformed account id, region or missing secret', () => {
    const base: Record<string, string> = {
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
      R2_ACCESS_KEY_ID: 'key-id',
      R2_SECRET_ACCESS_KEY: 'secret-key',
      SUPABASE_DB_PASSWORD: 'db-pass',
      SUPABASE_DB_REGION: 'us-east-1',
    };
    const build = (over: Record<string, string>) => {
      const text = Object.entries({ ...base, ...over })
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      return () => loadR2OperatorConfig({ exec: () => text });
    };
    expect(build({ CLOUDFLARE_ACCOUNT_ID: 'NOTHEX' })).toThrow(/32 lowercase hex/);
    expect(build({ SUPABASE_DB_REGION: 'US_EAST' })).toThrow(/lowercase letters/);
    expect(build({ R2_ACCESS_KEY_ID: '' })).toThrow(/Missing required secret/);
  });
});

describe('r2-gallery-operator-adapters: adapters', () => {
  let root: string;
  let runDir: string;
  let r2: FakeR2;
  let runner: any;
  let db: any;
  let adapters: AnyRow;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-adapters-'));
    runDir = path.join(root, RUN_ID);
    fs.mkdirSync(path.join(runDir, GALLERY_BUCKET, USER_ID), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(runDir, GALLERY_BUCKET, GALLERY_PATH), SRC_BYTES);
    r2 = new FakeR2();
    r2.seed(sourceKey(), SRC_BYTES);
    runner = makeRunner({ manifestSha256: 'a'.repeat(64) });
    db = makeDb();
    adapters = createR2GalleryAdapters({ db, signing: SIGNING, runDir, runner, fetchFn: r2.fetch });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists the R2 gallery with an exact bounded HEAD and a native row timestamp', async () => {
    const objects = await adapters.listObjects(GALLERY_BUCKET);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toEqual({
      path: GALLERY_PATH,
      id: IMAGE_ID,
      version: SRC_ETAG,
      bytes: SRC_BYTES.length,
      created_at: CREATED,
      updated_at: '2026-10-05T00:00:00.000Z',
    });
    expect(r2.heads).toEqual([sourceKey()]);
    await expect(adapters.listObjects('blog-images')).rejects.toThrow(/Unknown bucket/);
  });

  it('rejects a bounded HEAD whose length does not match the DB size', async () => {
    r2.headLengthOverride = SRC_BYTES.length + 1;
    await expect(adapters.listObjects(GALLERY_BUCKET)).rejects.toThrow(/size mismatch/);
  });

  it('signs the HEAD inventory request with the HEAD method, not GET', async () => {
    await adapters.listObjects(GALLERY_BUCKET);
    const signed = new URL(r2.headUrls[0]);
    const datetime = signed.searchParams.get('X-Amz-Date');
    const original = signed.searchParams.get('X-Amz-Signature');
    signed.searchParams.delete('X-Amz-Signature');
    const resign = async (method: string) => {
      const signer = new AwsV4Signer({
        accessKeyId: SIGNING.accessKeyId,
        secretAccessKey: SIGNING.secretAccessKey,
        method,
        url: signed.toString(),
        signQuery: true,
        service: 's3',
        region: 'auto',
        datetime: datetime ?? undefined,
      });
      return (await signer.sign()).url.searchParams.get('X-Amz-Signature');
    };
    expect(await resign('HEAD')).toBe(original);
    expect(await resign('GET')).not.toBe(original);
  });

  it('reads the source back in full and returns its strong ETag', async () => {
    const proof = await adapters.verifySource({
      key: `saved/${GALLERY_PATH}`,
      sha256: sha256(SRC_BYTES),
      bytes: SRC_BYTES.length,
    });
    expect(proof).toEqual({ sha256: sha256(SRC_BYTES), bytes: SRC_BYTES.length, etag: SRC_ETAG });
  });

  it('rejects a changed source hash or a weak ETag', async () => {
    await expect(
      adapters.verifySource({ key: `saved/${GALLERY_PATH}`, sha256: 'b'.repeat(64), bytes: SRC_BYTES.length })
    ).rejects.toThrow(/Read-back/);
    r2.getEtagOverride = 'W/"weak"';
    await expect(
      adapters.verifySource({ key: `saved/${GALLERY_PATH}`, sha256: sha256(SRC_BYTES), bytes: SRC_BYTES.length })
    ).rejects.toThrow(/strong quoted ETag/);
    await expect(adapters.verifySource({ key: 'blog/x.png', sha256: 'b'.repeat(64), bytes: 1 })).rejects.toThrow(
      /must start with saved/
    );
  });

  it('downloads the listed source with an If-Match guard and exact bytes', async () => {
    await adapters.listObjects(GALLERY_BUCKET);
    const targetPath = path.join(runDir, 'download.png');
    const result = await adapters.downloadObject({
      bucket: GALLERY_BUCKET,
      path: GALLERY_PATH,
      targetPath,
      expectedBytes: SRC_BYTES.length,
    });
    expect(result).toEqual({
      sha256: sha256(SRC_BYTES),
      md5: crypto.createHash('md5').update(SRC_BYTES).digest('hex'),
      bytes: SRC_BYTES.length,
    });
    expect(fs.readFileSync(targetPath)).toEqual(SRC_BYTES);
    expect(r2.gets).toContain(sourceKey());
    expect(r2.getHeaders.at(-1)?.['if-match']).toBe(SRC_ETAG);
  });

  it('rejects a download without a positive expected length or a listed version', async () => {
    const targetPath = path.join(runDir, 'guard.png');
    await expect(
      adapters.downloadObject({ bucket: GALLERY_BUCKET, path: GALLERY_PATH, targetPath, expectedBytes: 0 })
    ).rejects.toThrow(/positive expected length/);
    await expect(
      adapters.downloadObject({
        bucket: GALLERY_BUCKET,
        path: GALLERY_PATH,
        targetPath,
        expectedBytes: SRC_BYTES.length,
      })
    ).rejects.toThrow(/listed conditional version/);
  });

  it('rejects a download whose response ETag differs from the listed version', async () => {
    await adapters.listObjects(GALLERY_BUCKET);
    r2.getEtagOverride = '"changed-etag"';
    const targetPath = path.join(runDir, 'etag.png');
    await expect(
      adapters.downloadObject({
        bucket: GALLERY_BUCKET,
        path: GALLERY_PATH,
        targetPath,
        expectedBytes: SRC_BYTES.length,
      })
    ).rejects.toThrow(/ETag mismatch/);
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it('rejects a short stream that declares the full content-length', async () => {
    await adapters.listObjects(GALLERY_BUCKET);
    r2.getBodyOverride = SRC_BYTES.subarray(0, 5);
    r2.getContentLengthOverride = SRC_BYTES.length;
    const targetPath = path.join(runDir, 'short.png');
    await expect(
      adapters.downloadObject({
        bucket: GALLERY_BUCKET,
        path: GALLERY_PATH,
        targetPath,
        expectedBytes: SRC_BYTES.length,
      })
    ).rejects.toThrow(/Byte size mismatch/);
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it('never PUTs the original and signs an explicit content-length for the archive', async () => {
    const pixelSha = sha256(SRC_BYTES);
    const proof = await adapters.archiveAndVerify({
      archiveKey: `archive/gallery/${IMAGE_ID}/${pixelSha}`,
      localPath: path.join(runDir, GALLERY_BUCKET, GALLERY_PATH),
      sha256: pixelSha,
      bytes: SRC_BYTES.length,
      verifyExisting: () => true,
    });
    expect(proof.etag).toBe('"archive-etag-1"');
    expect(r2.puts).toHaveLength(1);
    const put = r2.puts[0];
    expect(put.pathname).toBe(archiveKeyOf(pixelSha));
    expect(put.pathname).not.toContain('/saved/');
    expect(put.headers['content-length']).toBe(String(SRC_BYTES.length));
    const signed = decodeURIComponent(new URL(put.url).searchParams.get('X-Amz-SignedHeaders') ?? '');
    expect(signed).toContain('content-length');
    expect(signed).toContain('if-none-match');
    expect(r2.store.get(archiveKeyOf(pixelSha))).toEqual(SRC_BYTES);
  });

  it('accepts a 412 only when the existing archive proves the verified source', async () => {
    const pixelSha = sha256(SRC_BYTES);
    r2.seed(archiveKeyOf(pixelSha), SRC_BYTES);
    r2.putStatus = 412;
    const accepted = await adapters.archiveAndVerify({
      archiveKey: `archive/gallery/${IMAGE_ID}/${pixelSha}`,
      localPath: path.join(runDir, GALLERY_BUCKET, GALLERY_PATH),
      sha256: pixelSha,
      bytes: SRC_BYTES.length,
      verifyExisting: () => true,
    });
    expect(accepted.sha256).toBe(pixelSha);

    await expect(
      adapters.archiveAndVerify({
        archiveKey: `archive/gallery/${IMAGE_ID}/${pixelSha}`,
        localPath: path.join(runDir, GALLERY_BUCKET, GALLERY_PATH),
        sha256: pixelSha,
        bytes: SRC_BYTES.length,
        verifyExisting: () => false,
      })
    ).rejects.toThrow(/does not match the verified source/);
  });

  it('rejects an existing archive whose full GET bytes differ', async () => {
    const pixelSha = sha256(SRC_BYTES);
    r2.seed(archiveKeyOf(pixelSha), Buffer.from('different archive bytes'), SRC_ETAG);
    r2.putStatus = 412;
    await expect(
      adapters.archiveAndVerify({
        archiveKey: `archive/gallery/${IMAGE_ID}/${pixelSha}`,
        localPath: path.join(runDir, GALLERY_BUCKET, GALLERY_PATH),
        sha256: pixelSha,
        bytes: SRC_BYTES.length,
        verifyExisting: () => true,
      })
    ).rejects.toThrow(/Read-back/);
  });

  it('rejects an unsafe archive key, a traversal local path and a symlinked file', async () => {
    const base = { sha256: sha256(SRC_BYTES), bytes: SRC_BYTES.length, verifyExisting: () => true };
    await expect(adapters.archiveAndVerify({ ...base, archiveKey: '../evil', localPath: 'x' })).rejects.toThrow(
      /Unsafe archive key/
    );
    await expect(
      adapters.archiveAndVerify({ ...base, archiveKey: `archive/gallery/${IMAGE_ID}/${sha256(SRC_BYTES)}`, localPath: path.join(root, 'outside.png') })
    ).rejects.toThrow(/traversal|Missing expected file/);
    const link = path.join(runDir, GALLERY_BUCKET, 'link.png');
    fs.symlinkSync(path.join(runDir, GALLERY_BUCKET, GALLERY_PATH), link);
    await expect(
      adapters.archiveAndVerify({
        ...base,
        archiveKey: `archive/gallery/${IMAGE_ID}/${sha256(SRC_BYTES)}`,
        localPath: link,
      })
    ).rejects.toThrow(/Symlink escape/);
  });

  it('loads exactly one native r2 saved row without coercing its timestamp', async () => {
    const row = await adapters.loadSavedRow(GALLERY_PATH);
    expect(row).toEqual(makeSavedRow());
    expect(row.created_at).toBe(CREATED);
    const empty = createR2GalleryAdapters({
      db: makeDb(makeSavedRow(), { query: async () => ({ rows: [] }) }),
      signing: SIGNING,
      runDir,
      runner,
      fetchFn: r2.fetch,
    });
    await expect(empty.loadSavedRow(GALLERY_PATH)).rejects.toThrow(/exactly one/);
  });

  it('persists the snapshot to disk and laptop and proves both hashes', async () => {
    const rawJson = JSON.stringify(makeSavedRow());
    const metaSha = sha256(rawJson);
    const result = await adapters.persistSnapshotProof({
      rawJson,
      sha256: metaSha,
      filename: `gallery-proofs/${IMAGE_ID}-${metaSha}.json`,
    });
    expect(result).toEqual({ localSha256: metaSha, remoteSha256: metaSha });
    expect(fs.readFileSync(path.join(runDir, `gallery-proofs/${IMAGE_ID}-${metaSha}.json`), 'utf8')).toBe(rawJson);
    const rsync = runner.calls.find((c: AnyRow) => c.command === 'rsync');
    expect(rsync.args[3]).toMatch(new RegExp(`^${'joao@192.168.1.126'}:.*/gallery-proofs/$`));
  });

  it('rejects a symlinked proof directory before writing the snapshot', async () => {
    const rawJson = JSON.stringify(makeSavedRow());
    const metaSha = sha256(rawJson);
    const outside = path.join(root, 'proof-outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(runDir, 'gallery-proofs'));
    await expect(
      adapters.persistSnapshotProof({
        rawJson,
        sha256: metaSha,
        filename: `gallery-proofs/${IMAGE_ID}-${metaSha}.json`,
      })
    ).rejects.toThrow(/Symlink escape/);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('rejects an existing symlinked proof file before reading it', async () => {
    const rawJson = JSON.stringify(makeSavedRow());
    const metaSha = sha256(rawJson);
    const filename = `gallery-proofs/${IMAGE_ID}-${metaSha}.json`;
    fs.mkdirSync(path.join(runDir, 'gallery-proofs'), { recursive: true });
    const outside = path.join(root, 'secret.json');
    fs.writeFileSync(outside, rawJson);
    fs.symlinkSync(outside, path.join(runDir, filename));
    await expect(adapters.persistSnapshotProof({ rawJson, sha256: metaSha, filename })).rejects.toThrow(
      /symlink/i
    );
  });

  it('rejects a bad snapshot hash, a traversal path and a remote hash failure', async () => {
    const rawJson = '{"a":1}';
    const metaSha = sha256(rawJson);
    await expect(
      adapters.persistSnapshotProof({ rawJson, sha256: 'c'.repeat(64), filename: `gallery-proofs/${IMAGE_ID}-${'c'.repeat(64)}.json` })
    ).rejects.toThrow(/sha256 mismatch/);
    await expect(
      adapters.persistSnapshotProof({ rawJson, sha256: metaSha, filename: `gallery-proofs/${IMAGE_ID}-${metaSha}.json/../../x` })
    ).rejects.toThrow(/Unsafe snapshot filename/);

    const failing = makeRunner({ manifestSha256: 'a'.repeat(64) });
    const base = failing;
    const runnerFail = async (command: string, args: string[], options: AnyRow = {}) => {
      if (command === 'ssh' && args[1].includes('sha256sum -c -')) return 'gallery-proofs/x.json: FAILED\n';
      return base(command, args, options);
    };
    const failAdapters = createR2GalleryAdapters({ db, signing: SIGNING, runDir, runner: runnerFail, fetchFn: r2.fetch });
    await expect(
      failAdapters.persistSnapshotProof({ rawJson, sha256: metaSha, filename: `gallery-proofs/${IMAGE_ID}-${metaSha}.json` })
    ).rejects.toThrow(/remote sha256 verification failed/);
  });

  it('records the proof with a ready-only upsert and rejects a zero-row update', async () => {
    const proof = {
      image_id: IMAGE_ID,
      user_id: USER_ID,
      storage_path: GALLERY_PATH,
      saved_row: makeSavedRow(),
      sha256: 'd'.repeat(64),
      size_bytes: SRC_BYTES.length,
      source_etag: SRC_ETAG,
      archive_key: `archive/gallery/${IMAGE_ID}/${'d'.repeat(64)}`,
      archive_etag: '"archive-etag-1"',
      backup_run_id: RUN_ID,
      manifest_sha256: 'a'.repeat(64),
      local_verified_at: NOW_ISO,
      remote_verified_at: NOW_ISO,
    };
    await adapters.insertProof(proof);
    const insert = db.calls.find((c: AnyRow) => c.sql.includes('gallery_expiry_backups'));
    expect(insert.sql).toContain('ON CONFLICT (image_id)');
    expect(insert.sql).toContain("state = 'ready'");
    expect(insert.params[3]).toBe(JSON.stringify(makeSavedRow()));
    expect(insert.params[12]).toBe(NOW_ISO);

    const zero = createR2GalleryAdapters({
      db: makeDb(makeSavedRow(), { query: async () => ({ rowCount: 0 }) }),
      signing: SIGNING,
      runDir,
      runner,
      fetchFn: r2.fetch,
    });
    await expect(zero.insertProof(proof)).rejects.toThrow(/affected 0 rows/);
  });
});

describe('r2-gallery-operator-adapters: engine integration', () => {
  let root: string;
  let runDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-adapters-engine-'));
    runDir = path.join(root, RUN_ID);
    fs.mkdirSync(path.join(runDir, GALLERY_BUCKET, USER_ID), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(runDir, GALLERY_BUCKET, GALLERY_PATH), SRC_BYTES);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('satisfies every runGalleryBackupRegistration callback end to end', async () => {
    const row = {
      bucket: GALLERY_BUCKET,
      path: GALLERY_PATH,
      bytes: SRC_BYTES.length,
      sha256: sha256(SRC_BYTES),
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-02T00:00:00.000Z',
      db_reference: true,
    };
    const rawManifest = `${JSON.stringify(row)}\n`;
    const rawChecksum = `${row.sha256}  ${GALLERY_BUCKET}/${GALLERY_PATH}\n`;
    fs.writeFileSync(path.join(runDir, 'manifest.jsonl'), rawManifest);
    fs.writeFileSync(path.join(runDir, 'manifest.sha256'), rawChecksum);
    fs.writeFileSync(
      path.join(runDir, 'backup-verification.json'),
      JSON.stringify({
        run_id: RUN_ID,
        object_count: 1,
        total_bytes: SRC_BYTES.length,
        manifest_sha256: sha256(rawManifest),
        checksum_list_sha256: sha256(rawChecksum),
      })
    );
    const identity = await loadBackupIdentity(runDir);

    const r2 = new FakeR2();
    r2.seed(sourceKey(), SRC_BYTES);
    const runner = makeRunner(identity);
    const db = makeDb();
    const adapters = createR2GalleryAdapters({ db, signing: SIGNING, runDir, runner, fetchFn: r2.fetch });

    const result = await runGalleryBackupRegistration({
      identity,
      rows: [row],
      ...adapters,
      runner,
      now: () => new Date(NOW_ISO),
    });

    expect(result.status).toBe('ok');
    expect(result.count).toBe(1);
    expect(r2.puts.every(p => p.pathname.startsWith('/miu-private/archive/gallery/'))).toBe(true);
    const insert = db.calls.find((c: AnyRow) => c.sql.includes('gallery_expiry_backups'));
    expect(insert.params[0]).toBe(IMAGE_ID);
    expect(insert.params[12]).toBe(NOW_ISO);
    const snapshot = fs.readdirSync(path.join(runDir, 'gallery-proofs'));
    expect(snapshot).toHaveLength(1);
  });
});
