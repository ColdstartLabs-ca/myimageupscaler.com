import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as verificationModule from '../../../scripts/storage/backup-verification.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  INPUT_BUCKET,
  GALLERY_BUCKET,
  loadBackupIdentity,
  loadFrozenPlan,
  verifyFrozenArtifacts,
  buildBatchChecksumInput,
  verifyRemoteBatch,
  parseSourceETag,
  createETagHasher,
} = verificationModule as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

type AnyRow = Record<string, any>;

const RUN_ID = 'backup-run-2026-10-12';
const CREATED = '2026-10-01T00:00:00.000Z';
const UPDATED = '2026-10-02T00:00:00.000Z';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ROW_ID = '22222222-2222-4222-8222-222222222222';

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writeArtifact(
  runDir: string,
  bucket: string,
  objectPath: string,
  content: string | Buffer
): string {
  const target = path.join(runDir, bucket, objectPath);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, content);
  return target;
}

function makeObject(
  bucket: string,
  objectPath: string,
  content: string
): { row: AnyRow; buffer: Buffer } {
  const buffer = Buffer.from(content);
  return {
    row: {
      bucket,
      path: objectPath,
      bytes: buffer.length,
      sha256: sha256(buffer),
      created_at: CREATED,
      updated_at: UPDATED,
      db_reference: false,
    },
    buffer,
  };
}

/**
 * Build a real on-disk backup run: raw manifest.jsonl, raw manifest.sha256,
 * backup-verification.json and every artifact file.
 */
function makeBackupRun(root: string, objects: Array<{ row: AnyRow; buffer: Buffer }>) {
  const runDir = path.join(root, RUN_ID);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const rows = [];
  for (const { row, buffer } of objects) {
    writeArtifact(runDir, row.bucket, row.path, buffer);
    rows.push(row);
  }
  const rawManifest = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
  const rawChecksum = rows.map(row => `${row.sha256}  ${row.bucket}/${row.path}`).join('\n') + '\n';
  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  const receipt = {
    run_id: RUN_ID,
    object_count: rows.length,
    total_bytes: totalBytes,
    manifest_sha256: sha256(rawManifest),
    checksum_list_sha256: sha256(rawChecksum),
    remote: `joao@192.168.1.126:~/backups/miu-storage/${RUN_ID}/`,
    verified_at: CREATED,
  };
  fs.writeFileSync(path.join(runDir, 'manifest.jsonl'), rawManifest);
  fs.writeFileSync(path.join(runDir, 'manifest.sha256'), rawChecksum);
  fs.writeFileSync(path.join(runDir, 'backup-verification.json'), JSON.stringify(receipt, null, 2));
  return { runDir, rows, rawManifest, rawChecksum, receipt };
}

function writePlan(runDir: string, planFile: string, digestFile: string, rows: AnyRow[]): string {
  const raw = rows.map((row: AnyRow) => JSON.stringify(row)).join('\n') + '\n';
  fs.writeFileSync(path.join(runDir, planFile), raw);
  fs.writeFileSync(path.join(runDir, digestFile), sha256(raw) + '\n');
  return raw;
}

function purgeRow(backupRow: AnyRow): AnyRow {
  return {
    bucket: backupRow.bucket,
    path: backupRow.path,
    bytes: backupRow.bytes,
    sha256: backupRow.sha256,
    object_created_at: backupRow.created_at,
    object_updated_at: backupRow.updated_at,
  };
}

function expireRow(backupRow: AnyRow): AnyRow {
  return {
    id: ROW_ID,
    user_id: USER_ID,
    bucket: backupRow.bucket,
    path: backupRow.path,
    original_filename: 'photo.png',
    file_size_bytes: backupRow.bytes,
    width: 1024,
    height: 768,
    model_used: 'model-x',
    processing_mode: 'upscale',
    created_at: backupRow.created_at,
    bytes: backupRow.bytes,
    sha256: backupRow.sha256,
    object_created_at: backupRow.created_at,
    object_updated_at: backupRow.updated_at,
  };
}

describe('backup-verification: loadBackupIdentity', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-verify-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('binds raw manifest, checksum list, count and bytes into a frozen identity', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input bytes');
    const b = makeObject(GALLERY_BUCKET, 'saved/bbb.png', 'gallery bytes');
    const { runDir, receipt } = makeBackupRun(root, [a, b]);

    const identity = await loadBackupIdentity(runDir);

    expect(identity.runBasename).toBe(RUN_ID);
    expect(identity.objectCount).toBe(2);
    expect(identity.totalBytes).toBe(a.buffer.length + b.buffer.length);
    expect(identity.manifestSha256).toBe(receipt.manifest_sha256);
    expect(identity.checksumListSha256).toBe(receipt.checksum_list_sha256);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.manifest)).toBe(true);
    expect(Object.isFrozen(identity.manifest[0])).toBe(true);
  });

  it('treats a legacy receipt without source_store as supabase and rejects an unknown store', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input bytes');
    const { runDir } = makeBackupRun(root, [a]);
    const identity = await loadBackupIdentity(runDir);
    expect(identity.sourceStore).toBe('supabase');

    const { runDir: r2Dir, receipt: r2Receipt } = makeBackupRun(path.join(root, 'r2'), [a]);
    fs.writeFileSync(
      path.join(r2Dir, 'backup-verification.json'),
      JSON.stringify({ ...r2Receipt, source_store: 'r2' }, null, 2)
    );
    expect((await loadBackupIdentity(r2Dir)).sourceStore).toBe('r2');

    const { runDir: badDir, receipt: badReceipt } = makeBackupRun(path.join(root, 'bad'), [a]);
    fs.writeFileSync(
      path.join(badDir, 'backup-verification.json'),
      JSON.stringify({ ...badReceipt, source_store: 's3' }, null, 2)
    );
    await expect(loadBackupIdentity(badDir)).rejects.toThrow(/Unknown source_store/);
  });

  it('rejects a missing receipt', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input bytes');
    const { runDir } = makeBackupRun(root, [a]);
    fs.rmSync(path.join(runDir, 'backup-verification.json'));
    await expect(loadBackupIdentity(runDir)).rejects.toThrow(/Missing expected file/);
  });

  it('rejects invalid bytes or hash in the raw manifest', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input bytes');
    const { runDir, rows } = makeBackupRun(root, [a]);
    const badBytes = rows.map(row => ({ ...row, bytes: -1 }));
    fs.writeFileSync(
      path.join(runDir, 'manifest.jsonl'),
      badBytes.map(r => JSON.stringify(r)).join('\n') + '\n'
    );
    await expect(loadBackupIdentity(runDir)).rejects.toThrow(/Invalid byte count/);

    const { runDir: runDir2 } = makeBackupRun(path.join(root, 'second'), [a]);
    const badHash = [{ ...a.row, sha256: 'z'.repeat(64) }];
    fs.writeFileSync(
      path.join(runDir2, 'manifest.jsonl'),
      badHash.map(r => JSON.stringify(r)).join('\n') + '\n'
    );
    await expect(loadBackupIdentity(runDir2)).rejects.toThrow(/Invalid SHA256/);
  });

  it('rejects a checksum list with an extra, forged or missing line', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input bytes');
    const b = makeObject(INPUT_BUCKET, 'user/bbb.png', 'more bytes');
    const { runDir } = makeBackupRun(root, [a, b]);

    fs.writeFileSync(
      path.join(runDir, 'manifest.sha256'),
      `${a.row.sha256}  ${INPUT_BUCKET}/user/aaa.png\n${b.row.sha256}  ${INPUT_BUCKET}/user/bbb.png\n${'0'.repeat(64)}  ${INPUT_BUCKET}/user/ccc.png\n`
    );
    await expect(loadBackupIdentity(runDir)).rejects.toThrow(/Extra checksum entry/);

    const { runDir: runDir2 } = makeBackupRun(path.join(root, 'second'), [a, b]);
    fs.writeFileSync(
      path.join(runDir2, 'manifest.sha256'),
      `${'1'.repeat(64)}  ${INPUT_BUCKET}/user/aaa.png\n${b.row.sha256}  ${INPUT_BUCKET}/user/bbb.png\n`
    );
    await expect(loadBackupIdentity(runDir2)).rejects.toThrow(/Checksum digest mismatch/);

    const { runDir: runDir3 } = makeBackupRun(path.join(root, 'third'), [a, b]);
    fs.writeFileSync(
      path.join(runDir3, 'manifest.sha256'),
      `${a.row.sha256}  ${INPUT_BUCKET}/user/aaa.png\n`
    );
    await expect(loadBackupIdentity(runDir3)).rejects.toThrow(/does not cover manifest/);
  });

  it('rejects a receipt whose count or byte sum does not match', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input bytes');
    const { runDir, receipt } = makeBackupRun(root, [a]);
    fs.writeFileSync(
      path.join(runDir, 'backup-verification.json'),
      JSON.stringify({ ...receipt, object_count: 5 }, null, 2)
    );
    await expect(loadBackupIdentity(runDir)).rejects.toThrow(/object_count mismatch/);
  });

  it('rejects an unsafe run directory basename for SSH', async () => {
    const unsafeRoot = path.join(root, 'bad name;rm -rf');
    fs.mkdirSync(unsafeRoot, { recursive: true });
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input bytes');
    writeArtifact(unsafeRoot, a.row.bucket, a.row.path, a.buffer);
    const raw = JSON.stringify(a.row) + '\n';
    fs.writeFileSync(path.join(unsafeRoot, 'manifest.jsonl'), raw);
    fs.writeFileSync(
      path.join(unsafeRoot, 'manifest.sha256'),
      `${a.row.sha256}  ${INPUT_BUCKET}/user/aaa.png\n`
    );
    fs.writeFileSync(
      path.join(unsafeRoot, 'backup-verification.json'),
      JSON.stringify({
        object_count: 1,
        total_bytes: a.buffer.length,
        manifest_sha256: sha256(raw),
        checksum_list_sha256: sha256(`${a.row.sha256}  ${INPUT_BUCKET}/user/aaa.png\n`),
      })
    );
    await expect(loadBackupIdentity(unsafeRoot)).rejects.toThrow(/Unsafe run directory basename/);
  });
});

describe('backup-verification: loadFrozenPlan', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-plan-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function inputBackup() {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input a');
    const b = makeObject(INPUT_BUCKET, 'user/bbb.png', 'input b');
    const g = makeObject(GALLERY_BUCKET, 'saved/ccc.png', 'gallery c');
    return { a, b, g, run: makeBackupRun(root, [a, b, g]) };
  }

  it('loads a valid purge plan whose raw digest binds all fields', async () => {
    const { a, b, run } = inputBackup();
    const rows = [purgeRow(a.row), purgeRow(b.row)];
    const raw = writePlan(run.runDir, 'purge-manifest.jsonl', 'purge-manifest.digest', rows);

    const plan = await loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' });
    expect(plan.rows).toHaveLength(2);
    expect(plan.planSha256).toBe(sha256(raw));
    expect(plan.identity.manifestSha256).toBe(run.receipt.manifest_sha256);
    expect(Object.isFrozen(plan.rows)).toBe(true);
  });

  it('keeps gallery row creation separate from the backed-up object creation', async () => {
    const { g, run } = inputBackup();
    const row = { ...expireRow(g.row), created_at: '2026-10-01T00:00:01.000Z' };
    writePlan(run.runDir, 'expire-rows.jsonl', 'expire-rows.digest', [row]);
    await expect(
      loadFrozenPlan({ backupRunDir: run.runDir, kind: 'expire' })
    ).resolves.toBeTruthy();
  });

  it('rejects a plan without backed-up source timestamps', async () => {
    const { a, run } = inputBackup();
    const row = purgeRow(a.row);
    delete row.object_updated_at;
    writePlan(run.runDir, 'purge-manifest.jsonl', 'purge-manifest.digest', [row]);
    await expect(loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' })).rejects.toThrow(
      /object_updated_at/
    );
  });

  it('binds the gallery row ID through the raw plan digest', async () => {
    const { g, run } = inputBackup();
    writePlan(run.runDir, 'expire-rows.jsonl', 'expire-rows.digest', [expireRow(g.row)]);
    await expect(
      loadFrozenPlan({ backupRunDir: run.runDir, kind: 'expire' })
    ).resolves.toBeTruthy();

    const changed = [{ ...expireRow(g.row), id: '33333333-3333-4333-8333-333333333333' }];
    fs.writeFileSync(
      path.join(run.runDir, 'expire-rows.jsonl'),
      changed.map(r => JSON.stringify(r)).join('\n') + '\n'
    );
    await expect(loadFrozenPlan({ backupRunDir: run.runDir, kind: 'expire' })).rejects.toThrow(
      /Plan digest mismatch/
    );
  });

  it('requires the plan digest file', async () => {
    const { a, run } = inputBackup();
    writePlan(run.runDir, 'purge-manifest.jsonl', 'purge-manifest.digest', [purgeRow(a.row)]);
    fs.rmSync(path.join(run.runDir, 'purge-manifest.digest'));
    await expect(loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' })).rejects.toThrow(
      /Missing expected file/
    );
  });

  it('never falls back to path-only matching across buckets', async () => {
    const { a, run } = inputBackup();
    const crossBucket = {
      ...expireRow(a.row),
      bucket: GALLERY_BUCKET,
    };
    writePlan(run.runDir, 'expire-rows.jsonl', 'expire-rows.digest', [crossBucket]);
    await expect(loadFrozenPlan({ backupRunDir: run.runDir, kind: 'expire' })).rejects.toThrow(
      /not in the backup manifest/
    );
  });

  it('rejects a plan that targets the wrong bucket for its kind', async () => {
    const { g, run } = inputBackup();
    const wrong = {
      bucket: GALLERY_BUCKET,
      path: g.row.path,
      bytes: g.row.bytes,
      sha256: g.row.sha256,
    };
    writePlan(run.runDir, 'purge-manifest.jsonl', 'purge-manifest.digest', [wrong]);
    await expect(loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' })).rejects.toThrow(
      /may only target upscale-inputs/
    );
  });

  it('rejects duplicate gallery row IDs and missing restoration fields', async () => {
    const { g, run } = inputBackup();
    const row = expireRow(g.row);
    writePlan(run.runDir, 'expire-rows.jsonl', 'expire-rows.digest', [
      row,
      { ...row, path: row.path },
    ]);
    await expect(loadFrozenPlan({ backupRunDir: run.runDir, kind: 'expire' })).rejects.toThrow(
      /Duplicate plan object/
    );

    const { g: g2, run: run2 } = inputBackup();
    const missing = expireRow(g2.row);
    delete missing.model_used;
    writePlan(run2.runDir, 'expire-rows.jsonl', 'expire-rows.digest', [missing]);
    await expect(loadFrozenPlan({ backupRunDir: run2.runDir, kind: 'expire' })).rejects.toThrow(
      /Missing gallery field model_used/
    );
  });
});

describe('backup-verification: verifyFrozenArtifacts', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-artifacts-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('streams and verifies the whole selected batch of real files', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input a');
    const b = makeObject(GALLERY_BUCKET, 'saved/bbb.png', 'gallery b');
    const { runDir, rows } = makeBackupRun(root, [a, b]);

    const result = await verifyFrozenArtifacts({ runDir, rows });
    expect(result.verified).toBe(2);
    expect(result.totalBytes).toBe(a.buffer.length + b.buffer.length);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects a corrupt or truncated artifact', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'the real bytes');
    const { runDir, rows } = makeBackupRun(root, [a]);
    fs.writeFileSync(path.join(runDir, INPUT_BUCKET, 'user/aaa.png'), 'tampered!!');
    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(/SHA256 mismatch/);
  });

  it('rejects a missing artifact and a symlinked artifact', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'bytes');
    const { runDir, rows } = makeBackupRun(root, [a]);
    fs.rmSync(path.join(runDir, INPUT_BUCKET, 'user/aaa.png'));
    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(/Missing expected file/);

    const { runDir: runDir2, rows: rows2 } = makeBackupRun(path.join(root, 'second'), [a]);
    const target = path.join(runDir2, INPUT_BUCKET, 'user/aaa.png');
    fs.rmSync(target);
    fs.symlinkSync(path.join(root, 'outside'), target);
    await expect(verifyFrozenArtifacts({ runDir: runDir2, rows: rows2 })).rejects.toThrow(
      /Symlink escape/
    );
  });

  it('rejects a symlinked bucket parent that escapes the run directory', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'bytes');
    const runDir = path.join(root, 'run');
    fs.mkdirSync(runDir, { recursive: true });
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(runDir, INPUT_BUCKET));
    fs.writeFileSync(path.join(outside, 'aaa.png'), a.buffer);
    await expect(verifyFrozenArtifacts({ runDir, rows: [a.row] })).rejects.toThrow(
      /Symlink escape/
    );
  });
});

const PART_BYTES = 5 * 1024 * 1024;

function md5Hex(value: Buffer): string {
  return crypto.createHash('md5').update(value).digest('hex');
}

/** S3-style multipart eTag: MD5 of the concatenated binary part MD5s plus the part count. */
function multipartEtag(value: Buffer, partBytes = PART_BYTES): string {
  const digests: Buffer[] = [];
  for (let offset = 0; offset < value.length; offset += partBytes) {
    digests.push(
      crypto.createHash('md5').update(value.subarray(offset, offset + partBytes)).digest()
    );
  }
  return `${md5Hex(Buffer.concat(digests))}-${digests.length}`;
}

function patterned(size: number, seed: number): Buffer {
  const buffer = Buffer.alloc(size);
  for (let index = 0; index < size; index += 1) buffer[index] = (index * 31 + seed) & 0xff;
  return buffer;
}

describe('backup-verification: source eTag parsing and streaming digest', () => {
  const HEX = 'a'.repeat(32);

  it.each([
    [`"${HEX}"`, { md5: HEX, parts: null }],
    [HEX, { md5: HEX, parts: null }],
    [`"${HEX}-1"`, { md5: HEX, parts: 1 }],
    [`${HEX}-37`, { md5: HEX, parts: 37 }],
    [`"${HEX}-10000"`, { md5: HEX, parts: 10000 }],
  ])('parses supported eTag %j', (etag, expected) => {
    expect(parseSourceETag(etag)).toMatchObject(expected);
  });

  it.each([
    null,
    undefined,
    '',
    '""',
    '"abc"',
    `W/"${HEX}"`,
    `"${'A'.repeat(32)}"`,
    `"${'a'.repeat(31)}"`,
    `"${HEX}-0"`,
    `"${HEX}-01"`,
    `"${HEX}-10001"`,
    `"${HEX}-2-3"`,
    `"${HEX}-"`,
    ` "${HEX}"`,
  ])('rejects unsupported eTag %j', etag => {
    expect(parseSourceETag(etag)).toBeNull();
  });

  it('rejects a multipart count that cannot come from the 5 MiB layout of the expected size', () => {
    expect(parseSourceETag(`"${HEX}-2"`, PART_BYTES + 1)).not.toBeNull();
    expect(parseSourceETag(`"${HEX}-2"`, 2 * PART_BYTES)).not.toBeNull();
    expect(parseSourceETag(`"${HEX}-1"`, 1)).not.toBeNull();
    expect(parseSourceETag(`"${HEX}-1"`, PART_BYTES)).not.toBeNull();
    expect(parseSourceETag(`"${HEX}-2"`, PART_BYTES)).toBeNull();
    expect(parseSourceETag(`"${HEX}-3"`, 2 * PART_BYTES)).toBeNull();
    expect(parseSourceETag(`"${HEX}-1"`, 0)).toBeNull();
    // A single-part eTag has no layout and an unknown size skips the check.
    expect(parseSourceETag(`"${HEX}"`, 2 * PART_BYTES)).not.toBeNull();
    expect(parseSourceETag(`"${HEX}-9"`)).not.toBeNull();
  });

  it.each([
    ['one byte', 1],
    ['just under one part', PART_BYTES - 1],
    ['exactly one part', PART_BYTES],
    ['one part plus one byte', PART_BYTES + 1],
    ['exactly two parts', 2 * PART_BYTES],
    ['two parts and a remainder', 2 * PART_BYTES + 17],
  ])('streams the whole MD5 and the multipart eTag for %s regardless of chunking', (_label, size) => {
    const payload = patterned(size, size % 251);
    for (const chunkSize of [1_000_003, 65_536, size]) {
      const hasher = createETagHasher();
      for (let offset = 0; offset < payload.length; offset += chunkSize) {
        hasher.update(payload.subarray(offset, offset + chunkSize));
      }
      expect(hasher.digest()).toEqual({
        md5: md5Hex(payload),
        multipartEtag: multipartEtag(payload),
      });
    }
  });
});

describe('backup-verification: verifyFrozenArtifacts source eTag binding', () => {
  let root: string;
  const KEY = (bucket: string, objectPath: string) => `${bucket}::${objectPath}`;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-etag-bind-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeCheckpoint(runDir: string, downloaded: Record<string, AnyRow>, extra: AnyRow = {}) {
    fs.writeFileSync(
      path.join(runDir, 'backup-checkpoint.json'),
      JSON.stringify({ downloaded, retained: {}, ...extra })
    );
  }

  function entryFor(row: AnyRow, extra: AnyRow): AnyRow {
    return { sha256: row.sha256, bytes: row.bytes, created_at: CREATED, updated_at: UPDATED, ...extra };
  }

  function binaryObject(bucket: string, objectPath: string, buffer: Buffer) {
    return {
      row: {
        bucket,
        path: objectPath,
        bytes: buffer.length,
        sha256: sha256(buffer),
        created_at: CREATED,
        updated_at: UPDATED,
        db_reference: false,
      },
      buffer,
    };
  }

  it('accepts bytes whose MD5 equals the checkpoint source_etag', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'bound bytes');
    const { runDir, rows } = makeBackupRun(root, [a]);
    writeCheckpoint(runDir, {
      [KEY(INPUT_BUCKET, 'user/aaa.png')]: entryFor(a.row, { source_etag: `"${md5Hex(a.buffer)}"` }),
    });

    const result = await verifyFrozenArtifacts({ runDir, rows });
    expect(result.verified).toBe(1);
    expect(result.etagBound).toBe(1);
    expect(result.etagUnbound).toBe(0);
  });

  it('rejects equal-length stale bytes even when the manifest SHA-256 was taken from the stale copy', async () => {
    const stale = Buffer.from('stale-bytes-v1');
    const current = Buffer.from('fresh-bytes-v2');
    expect(stale.length).toBe(current.length);
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', stale.toString());
    const { runDir, rows } = makeBackupRun(root, [a]);
    writeCheckpoint(runDir, {
      [KEY(INPUT_BUCKET, 'user/aaa.png')]: entryFor(a.row, { source_etag: `"${md5Hex(current)}"` }),
    });

    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(
      /user\/aaa\.png: Source eTag mismatch/
    );
  });

  it('accepts legitimate 5 MiB multipart bytes and rejects a wrong part digest or count', async () => {
    const multi = binaryObject(GALLERY_BUCKET, 'saved/big.webp', patterned(PART_BYTES + 4096, 7));
    const { runDir, rows } = makeBackupRun(root, [multi]);
    const key = KEY(GALLERY_BUCKET, 'saved/big.webp');

    writeCheckpoint(runDir, {
      [key]: entryFor(multi.row, { source_etag: `"${multipartEtag(multi.buffer)}"` }),
    });
    await expect(verifyFrozenArtifacts({ runDir, rows })).resolves.toMatchObject({
      verified: 1,
      etagBound: 1,
    });

    // Same count, different part boundaries: the part digests differ.
    writeCheckpoint(runDir, {
      [key]: entryFor(multi.row, { source_etag: `"${multipartEtag(multi.buffer, 4 * 1024 * 1024)}"` }),
    });
    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(/Source eTag mismatch/);

    // A count the 5 MiB layout cannot produce is unsupported, never guessed.
    writeCheckpoint(runDir, {
      [key]: entryFor(multi.row, { source_etag: `"${md5Hex(multi.buffer)}-3"` }),
    });
    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(/Unsupported source eTag/);
  });

  it('rejects stale multipart bytes of the same size', async () => {
    const current = patterned(PART_BYTES + 100, 3);
    const stale = patterned(PART_BYTES + 100, 4);
    const multi = binaryObject(GALLERY_BUCKET, 'saved/big.webp', stale);
    const { runDir, rows } = makeBackupRun(root, [multi]);
    writeCheckpoint(runDir, {
      [KEY(GALLERY_BUCKET, 'saved/big.webp')]: entryFor(multi.row, {
        source_etag: `"${multipartEtag(current)}"`,
      }),
    });

    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(/Source eTag mismatch/);
  });

  it('enforces the legacy checkpoint source_version, which holds the metadata eTag', async () => {
    const stale = Buffer.from('stale-legacy-v1');
    const current = Buffer.from('fresh-legacy-v2');
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', stale.toString());
    const { runDir, rows } = makeBackupRun(root, [a]);
    const key = KEY(INPUT_BUCKET, 'user/aaa.png');

    writeCheckpoint(runDir, { [key]: entryFor(a.row, { source_version: `"${md5Hex(current)}"` }) });
    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(/Source eTag mismatch/);

    writeCheckpoint(runDir, { [key]: entryFor(a.row, { source_version: `"${md5Hex(stale)}"` }) });
    await expect(verifyFrozenArtifacts({ runDir, rows })).resolves.toMatchObject({ etagBound: 1 });
  });

  it('fails closed on a frozen eTag that is not a supported shape', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'bytes');
    const { runDir, rows } = makeBackupRun(root, [a]);
    writeCheckpoint(runDir, {
      [KEY(INPUT_BUCKET, 'user/aaa.png')]: entryFor(a.row, {
        source_etag: `W/"${md5Hex(a.buffer)}"`,
      }),
    });

    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(/Unsupported source eTag/);
  });

  it('enforces the digest-bound frozen expire plan eTag for a legacy run without checkpoint eTags', async () => {
    const stale = Buffer.from('stale-gallery-1');
    const current = Buffer.from('fresh-gallery-2');
    const a = makeObject(GALLERY_BUCKET, 'saved/aaa.png', stale.toString());
    const { runDir, rows } = makeBackupRun(root, [a]);
    // The legacy checkpoint predates eTag capture: identity fields only.
    writeCheckpoint(runDir, {
      [KEY(GALLERY_BUCKET, 'saved/aaa.png')]: entryFor(a.row, { version: 'object-id' }),
    });
    writePlan(runDir, 'expire-rows.jsonl', 'expire-rows.digest', [
      {
        ...expireRow(a.row),
        object_metadata: { eTag: `"${md5Hex(current)}"`, size: String(a.row.bytes) },
      },
    ]);
    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(/Source eTag mismatch/);

    writePlan(runDir, 'expire-rows.jsonl', 'expire-rows.digest', [
      {
        ...expireRow(a.row),
        object_metadata: { eTag: `"${md5Hex(stale)}"`, size: String(a.row.bytes) },
      },
    ]);
    await expect(verifyFrozenArtifacts({ runDir, rows })).resolves.toMatchObject({
      verified: 1,
      etagBound: 1,
    });
  });

  it('rejects a frozen expire plan whose digest does not bind its bytes', async () => {
    const a = makeObject(GALLERY_BUCKET, 'saved/aaa.png', 'gallery bytes');
    const { runDir, rows } = makeBackupRun(root, [a]);
    writePlan(runDir, 'expire-rows.jsonl', 'expire-rows.digest', [
      { ...expireRow(a.row), object_metadata: { eTag: `"${md5Hex(a.buffer)}"` } },
    ]);
    fs.writeFileSync(path.join(runDir, 'expire-rows.digest'), `${'0'.repeat(64)}\n`);

    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(/expire plan digest/i);
  });

  it('keeps a legacy run without any frozen eTag verifiable and reports the rows as unbound', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'legacy a');
    const b = makeObject(INPUT_BUCKET, 'user/bbb.png', 'legacy b');
    const { runDir, rows } = makeBackupRun(root, [a, b]);
    writeCheckpoint(runDir, {
      [KEY(INPUT_BUCKET, 'user/aaa.png')]: entryFor(a.row, { version: 'id-a' }),
      [KEY(INPUT_BUCKET, 'user/bbb.png')]: entryFor(b.row, { version: 'id-b' }),
    });

    const result = await verifyFrozenArtifacts({ runDir, rows });
    expect(result).toMatchObject({ verified: 2, etagBound: 0, etagUnbound: 2 });
  });

  it('fails closed on an unbound row once the run captured source eTags', async () => {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'bound a');
    const b = makeObject(INPUT_BUCKET, 'user/bbb.png', 'unbound b');
    const { runDir, rows } = makeBackupRun(root, [a, b]);
    writeCheckpoint(runDir, {
      [KEY(INPUT_BUCKET, 'user/aaa.png')]: entryFor(a.row, { source_etag: `"${md5Hex(a.buffer)}"` }),
      [KEY(INPUT_BUCKET, 'user/bbb.png')]: entryFor(b.row, { source_etag: null }),
    });

    await expect(verifyFrozenArtifacts({ runDir, rows })).rejects.toThrow(
      /user\/bbb\.png: Missing source eTag binding/
    );
  });

  it('leaves the R2 source_store to its If-Match contract and never applies the Supabase eTag layout', async () => {
    const big = binaryObject(GALLERY_BUCKET, 'saved/r2-big.webp', patterned(PART_BYTES + 10, 9));
    const { runDir, rows, receipt } = makeBackupRun(root, [big]);
    fs.writeFileSync(
      path.join(runDir, 'backup-verification.json'),
      JSON.stringify({ ...receipt, source_store: 'r2' }, null, 2)
    );
    // An R2 multipart eTag over 8 MiB parts is not the Supabase 5 MiB layout.
    writeCheckpoint(runDir, {
      [KEY(GALLERY_BUCKET, 'saved/r2-big.webp')]: entryFor(big.row, {
        source_version: `"${md5Hex(big.buffer)}-2"`,
        source_etag: null,
      }),
    });

    const result = await verifyFrozenArtifacts({ runDir, rows });
    expect(result).toMatchObject({ verified: 1, etagBound: 0 });
  });
});

describe('backup-verification: remote proof', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-remote-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeRunner(identity: AnyRow, mode = 'ok') {
    const calls: Array<{ command: string; args: string[]; options: { input?: string } }> = [];
    const runner: any = async (
      command: string,
      args: string[],
      options: { input?: string } = {}
    ) => {
      calls.push({ command, args, options });
      if (command === 'ssh' && args[1].includes('sha256sum -c -')) {
        if (mode === 'throw') throw new Error('remote connection failed');
        if (mode === 'failed-output') return `${INPUT_BUCKET}/user/aaa.png: FAILED\n`;
        if (mode === 'empty') return '';
        return (options.input ?? '')
          .split('\n')
          .filter(Boolean)
          .map(line => `${line.replace(/^[0-9a-f]{64} {2}/, '')}: OK`)
          .join('\n');
      }
      if (command === 'ssh' && args[1].includes('manifest.jsonl')) {
        return mode === 'mismatch'
          ? `${'0'.repeat(64)}  manifest.jsonl\n`
          : `${identity.manifestSha256}  manifest.jsonl\n`;
      }
      return '';
    };
    runner.calls = calls;
    return runner;
  }

  async function setup() {
    const a = makeObject(INPUT_BUCKET, 'user/aaa.png', 'input a');
    const b = makeObject(INPUT_BUCKET, 'user/bbb.png', 'input b');
    const run = makeBackupRun(root, [a, b]);
    const identity = await loadBackupIdentity(run.runDir);
    const rows = [purgeRow(a.row), purgeRow(b.row)];
    return { identity, rows };
  }

  it('sends the exact local batch lines and binds the remote manifest digest', async () => {
    const { identity, rows } = await setup();
    const runner = makeRunner(identity);
    const expected = buildBatchChecksumInput(rows);

    const result = await verifyRemoteBatch({
      identity,
      rows,
      runner,
      remoteBase: '~/backups/miu-storage/' + RUN_ID,
    });

    const checkCall = runner.calls.find((call: any) => call.args[1].includes('sha256sum -c -'));
    expect(checkCall.options.input).toBe(expected);
    expect(checkCall.args[1]).toContain(RUN_ID);
    expect(result.verified).toBe(2);
    expect(result.manifestSha256).toBe(identity.manifestSha256);
  });

  it('aborts on a failed, empty or mismatched remote proof', async () => {
    const { identity, rows } = await setup();

    await expect(
      verifyRemoteBatch({ identity, rows, runner: makeRunner(identity, 'throw') })
    ).rejects.toThrow(/remote connection failed/);

    await expect(
      verifyRemoteBatch({ identity, rows, runner: makeRunner(identity, 'failed-output') })
    ).rejects.toThrow(/Remote checksum verification failed/);

    await expect(
      verifyRemoteBatch({ identity, rows, runner: makeRunner(identity, 'empty') })
    ).rejects.toThrow(/Remote proof incomplete/);

    await expect(
      verifyRemoteBatch({ identity, rows, runner: makeRunner(identity, 'mismatch') })
    ).rejects.toThrow(/Remote manifest digest mismatch/);
  });

  it('requires a runner and a bound identity', async () => {
    const { identity, rows } = await setup();
    await expect(verifyRemoteBatch({ identity, rows, runner: undefined })).rejects.toThrow(
      /requires a process runner/
    );
    await expect(verifyRemoteBatch({ identity: undefined, rows })).rejects.toThrow(
      /requires a backup identity/
    );
  });
});
