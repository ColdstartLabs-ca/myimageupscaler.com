import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as registrationModule from '../../../scripts/storage/register-gallery-backups.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  runGalleryBackupRegistration,
  runRegisterCommand,
  parseRegisterFlags,
  main,
  MAX_REGISTRATION_BATCH,
} = registrationModule as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

type AnyRow = Record<string, any>;

const RUN_ID = 'backup-run-2026-10-13';
const CREATED = '2026-10-01T00:00:00.000Z';
const UPDATED = '2026-10-02T00:00:00.000Z';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';
const GALLERY_PATH = `${USER_ID}/${IMAGE_ID}.png`;
const GALLERY_BUCKET = 'saved-images';
const NOW_ISO = '2026-10-13T12:00:00.000Z';

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writeArtifact(
  runDir: string,
  bucket: string,
  objectPath: string,
  content: string | Buffer
): void {
  const target = path.join(runDir, bucket, objectPath);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, content);
}

function makeObject(bucket: string, objectPath: string, content: string) {
  const buffer = Buffer.from(content);
  return {
    row: {
      bucket,
      path: objectPath,
      bytes: buffer.length,
      sha256: sha256(buffer),
      created_at: CREATED,
      updated_at: UPDATED,
      db_reference: true,
    },
    buffer,
  };
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

function makeSavedRow(row: AnyRow): AnyRow {
  return {
    id: IMAGE_ID,
    user_id: USER_ID,
    storage_path: row.path,
    storage_backend: 'r2',
    original_filename: 'photo.png',
    file_size_bytes: row.bytes,
    width: 1024,
    height: 768,
    model_used: 'model-x',
    processing_mode: 'upscale',
    created_at: '2026-10-01T00:00:00.123456+00:00',
  };
}

function makeRunner(identity: AnyRow, mode = 'ok') {
  const calls: Array<{ command: string; args: string[]; options: any }> = [];
  const runner: any = async (command: string, args: string[], options: any = {}) => {
    calls.push({ command, args, options });
    if (command !== 'ssh') return '';
    if (args[1].includes('sha256sum -c -')) {
      if (mode === 'throw') throw new Error('remote connection failed');
      if (mode === 'failed-output') return `${GALLERY_BUCKET}/${GALLERY_PATH}: FAILED\n`;
      if (mode === 'empty') return '';
      return (options.input ?? '')
        .split('\n')
        .filter(Boolean)
        .map((line: string) => `${line.replace(/^[0-9a-f]{64} {2}/, '')}: OK`)
        .join('\n');
    }
    if (args[1].includes('manifest.jsonl')) {
      return `${identity.manifestSha256}  manifest.jsonl\n`;
    }
    return '';
  };
  runner.calls = calls;
  return runner;
}

function makeVerifySource(row: AnyRow, sequence?: AnyRow[]) {
  const calls: any[] = [];
  let index = 0;
  const source = sequence ?? [{ etag: '"src-etag-1"', sha256: row.sha256, bytes: row.bytes }];
  const fn: any = async (arg: any) => {
    calls.push(arg);
    const proof = source[Math.min(index, source.length - 1)];
    index += 1;
    return proof;
  };
  fn.calls = calls;
  return fn;
}

function makeArchiveAndVerify(row: AnyRow, overrides: AnyRow = {}) {
  const calls: any[] = [];
  const fn: any = async (arg: any) => {
    calls.push(arg);
    return { etag: '"arc-etag-1"', sha256: row.sha256, bytes: row.bytes, ...overrides };
  };
  fn.calls = calls;
  return fn;
}

function makePersistSnapshotProof(overrides: AnyRow = {}, events?: string[]) {
  const calls: any[] = [];
  const fn: any = async (arg: any) => {
    calls.push(arg);
    events?.push('persist');
    return { localSha256: arg.sha256, remoteSha256: arg.sha256, ...overrides };
  };
  fn.calls = calls;
  return fn;
}

function makeInsertProof(events?: string[]) {
  const calls: any[] = [];
  const fn: any = async (payload: any) => {
    calls.push(payload);
    events?.push('insert');
  };
  fn.calls = calls;
  return fn;
}

function makeLoadSavedRow(row: AnyRow, sequence?: AnyRow[]) {
  const calls: string[] = [];
  let index = 0;
  const rows = sequence ?? [makeSavedRow(row)];
  const fn: any = async (objectPath: string) => {
    calls.push(objectPath);
    const value = rows[Math.min(index, rows.length - 1)];
    index += 1;
    return value;
  };
  fn.calls = calls;
  return fn;
}

describe('gallery-backup registration: runGalleryBackupRegistration', () => {
  let root: string;
  let run: ReturnType<typeof makeBackupRun>;
  let object: ReturnType<typeof makeObject>;
  let identity: AnyRow;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-register-'));
    object = makeObject(GALLERY_BUCKET, GALLERY_PATH, 'the real gallery bytes');
    run = makeBackupRun(root, [object]);
    const { loadBackupIdentity } = await import('../../../scripts/storage/backup-verification.mjs');
    identity = await (loadBackupIdentity as any)(run.runDir);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function baseDeps(overrides: AnyRow = {}) {
    return {
      identity,
      rows: [run.rows[0]],
      loadSavedRow: makeLoadSavedRow(run.rows[0]),
      verifySource: makeVerifySource(run.rows[0]),
      archiveAndVerify: makeArchiveAndVerify(run.rows[0]),
      persistSnapshotProof: makePersistSnapshotProof(),
      insertProof: makeInsertProof(),
      runner: makeRunner(identity),
      now: () => new Date(NOW_ISO),
      ...overrides,
    };
  }

  it('inserts the exact proof only after every recheck, with no source writes', async () => {
    const deps = baseDeps();
    const result = await runGalleryBackupRegistration(deps);

    expect(result.status).toBe('ok');
    expect(result.count).toBe(1);

    expect(deps.insertProof.calls).toHaveLength(1);
    expect(deps.insertProof.calls[0]).toEqual({
      image_id: IMAGE_ID,
      user_id: USER_ID,
      storage_path: GALLERY_PATH,
      saved_row: makeSavedRow(run.rows[0]),
      sha256: object.row.sha256,
      size_bytes: object.buffer.length,
      source_etag: '"src-etag-1"',
      archive_key: `archive/gallery/${IMAGE_ID}/${object.row.sha256}`,
      archive_etag: '"arc-etag-1"',
      backup_run_id: RUN_ID,
      manifest_sha256: run.receipt.manifest_sha256,
      local_verified_at: NOW_ISO,
      remote_verified_at: NOW_ISO,
    });
    expect(deps.insertProof.calls[0].local_verified_at).not.toBe(run.receipt.verified_at);
    expect(deps.persistSnapshotProof.calls).toHaveLength(1);

    expect(deps.verifySource.calls).toHaveLength(2);
    for (const call of deps.verifySource.calls) {
      expect(Object.keys(call).sort()).toEqual(['bytes', 'key', 'sha256']);
      expect(call.key).toBe(`saved/${GALLERY_PATH}`);
      expect(call.sha256).toBe(object.row.sha256);
    }
    expect(deps.archiveAndVerify.calls).toHaveLength(1);
    expect(Object.keys(deps.archiveAndVerify.calls[0]).sort()).toEqual([
      'archiveKey',
      'bytes',
      'localPath',
      'sha256',
      'verifyExisting',
    ]);
    expect(deps.archiveAndVerify.calls[0].archiveKey).toBe(
      `archive/gallery/${IMAGE_ID}/${object.row.sha256}`
    );
  });

  it('stops before the archive when local bytes are tampered', async () => {
    fs.writeFileSync(path.join(run.runDir, GALLERY_BUCKET, GALLERY_PATH), 'tampered!!');
    const deps = baseDeps();
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(/SHA256 mismatch/);
    expect(deps.archiveAndVerify.calls).toHaveLength(0);
    expect(deps.insertProof.calls).toHaveLength(0);
  });

  it('stops before the archive when the laptop proof fails', async () => {
    const deps = baseDeps({ runner: makeRunner(identity, 'failed-output') });
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(
      /Remote checksum verification failed/
    );
    expect(deps.archiveAndVerify.calls).toHaveLength(0);
    expect(deps.insertProof.calls).toHaveLength(0);
  });

  it('stops when the source ETag changes after the archive write', async () => {
    const deps = baseDeps({
      verifySource: makeVerifySource(run.rows[0], [
        { etag: '"src-etag-1"', sha256: object.row.sha256, bytes: object.row.bytes },
        { etag: '"src-etag-2"', sha256: object.row.sha256, bytes: object.row.bytes },
      ]),
    });
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(/Source ETag changed/);
    expect(deps.archiveAndVerify.calls).toHaveLength(1);
    expect(deps.insertProof.calls).toHaveLength(0);
  });

  it('stops when the saved row changes before insert', async () => {
    const deps = baseDeps({
      loadSavedRow: makeLoadSavedRow(run.rows[0], [
        makeSavedRow(run.rows[0]),
        { ...makeSavedRow(run.rows[0]), width: 2048 },
      ]),
    });
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(/Saved row changed/);
    expect(deps.insertProof.calls).toHaveLength(0);
  });

  it('stops when the archive proof hash does not match', async () => {
    const deps = baseDeps({
      archiveAndVerify: makeArchiveAndVerify(run.rows[0], { sha256: 'a'.repeat(64) }),
    });
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(/Archive proof SHA256 mismatch/);
    expect(deps.insertProof.calls).toHaveLength(0);
  });

  it('rejects a saved row without a usable image id or matching path', async () => {
    const deps = baseDeps({
      loadSavedRow: makeLoadSavedRow(run.rows[0], [{ ...makeSavedRow(run.rows[0]), id: 'nope' }]),
    });
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(/image id is not a UUID/);
    expect(deps.archiveAndVerify.calls).toHaveLength(0);

    const deps2 = baseDeps({
      loadSavedRow: makeLoadSavedRow(run.rows[0], [
        { ...makeSavedRow(run.rows[0]), storage_path: 'someone/else.png' },
      ]),
    });
    await expect(runGalleryBackupRegistration(deps2)).rejects.toThrow(/path mismatch/);
    expect(deps2.insertProof.calls).toHaveLength(0);
  });

  it('refuses a batch larger than the bounded maximum', async () => {
    const many = Array.from({ length: MAX_REGISTRATION_BATCH + 1 }, () => run.rows[0]);
    const deps = baseDeps({ rows: many });
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(/exceeds the 50 row limit/);
  });

  it('rejects a run without the required snapshot-proof callback', async () => {
    const deps = baseDeps({ persistSnapshotProof: undefined });
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(
      /requires persistSnapshotProof/
    );
    expect(deps.archiveAndVerify.calls).toHaveLength(0);
    expect(deps.insertProof.calls).toHaveLength(0);
  });

  it('stops before insert when the snapshot proof copies disagree', async () => {
    const deps = baseDeps({
      persistSnapshotProof: makePersistSnapshotProof({ localSha256: 'a'.repeat(64) }),
    });
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(
      /Snapshot proof two-copy SHA256 mismatch/
    );
    expect(deps.persistSnapshotProof.calls).toHaveLength(1);
    expect(deps.insertProof.calls).toHaveLength(0);
  });

  it('stops before insert when the snapshot proof callback throws', async () => {
    const throwing: any = async () => {
      throw new Error('laptop upload failed');
    };
    throwing.calls = [];
    const deps = baseDeps({ persistSnapshotProof: throwing });
    await expect(runGalleryBackupRegistration(deps)).rejects.toThrow(/laptop upload failed/);
    expect(deps.insertProof.calls).toHaveLength(0);
  });

  it('copies the exact native row and timestamps into the proof before insert', async () => {
    const events: string[] = [];
    const persistSnapshotProof = makePersistSnapshotProof({}, events);
    const insertProof = makeInsertProof(events);
    const deps = baseDeps({ persistSnapshotProof, insertProof });
    await runGalleryBackupRegistration(deps);

    const call = persistSnapshotProof.calls[0];
    const rawJson: string = call.rawJson;
    expect(rawJson).toContain('2026-10-01T00:00:00.123456+00:00');
    expect(sha256(rawJson)).toBe(call.sha256);
    expect(call.filename).toBe(`gallery-proofs/${IMAGE_ID}-${call.sha256}.json`);

    const metadata = JSON.parse(rawJson);
    expect(metadata.saved_row).toEqual(makeSavedRow(run.rows[0]));
    expect(metadata.image_id).toBe(IMAGE_ID);
    expect(metadata.user_id).toBe(USER_ID);
    expect(metadata.storage_path).toBe(GALLERY_PATH);
    expect(metadata.source_etag).toBe('"src-etag-1"');
    expect(metadata.archive_etag).toBe('"arc-etag-1"');
    expect(metadata.archive_key).toBe(`archive/gallery/${IMAGE_ID}/${object.row.sha256}`);
    expect(metadata.backup_manifest_sha256).toBe(run.receipt.manifest_sha256);
    expect(metadata.run).toBe(RUN_ID);

    expect(events).toEqual(['persist', 'insert']);
    expect(insertProof.calls[0].saved_row).toEqual(makeSavedRow(run.rows[0]));
    expect(insertProof.calls[0].local_verified_at).toBe(NOW_ISO);
    expect(insertProof.calls[0].remote_verified_at).toBe(NOW_ISO);
  });

  it('rejects a legacy backend row or a zero-byte row before archiving', async () => {
    const legacy = baseDeps({
      loadSavedRow: makeLoadSavedRow(run.rows[0], [
        { ...makeSavedRow(run.rows[0]), storage_backend: 'supabase' },
      ]),
    });
    await expect(runGalleryBackupRegistration(legacy)).rejects.toThrow(/not R2-backed/);
    expect(legacy.archiveAndVerify.calls).toHaveLength(0);
    expect(legacy.insertProof.calls).toHaveLength(0);

    const zero = baseDeps({
      loadSavedRow: makeLoadSavedRow(run.rows[0], [
        { ...makeSavedRow(run.rows[0]), file_size_bytes: 0 },
      ]),
    });
    await expect(runGalleryBackupRegistration(zero)).rejects.toThrow(
      /not a positive safe integer/
    );
    expect(zero.archiveAndVerify.calls).toHaveLength(0);
    expect(zero.insertProof.calls).toHaveLength(0);
  });
});

describe('gallery-backup registration: CLI', () => {
  let root: string;
  let run: ReturnType<typeof makeBackupRun>;
  let object: ReturnType<typeof makeObject>;
  let identity: AnyRow;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-register-cli-'));
    object = makeObject(GALLERY_BUCKET, GALLERY_PATH, 'the real gallery bytes');
    run = makeBackupRun(root, [object]);
    const { loadBackupIdentity } = await import('../../../scripts/storage/backup-verification.mjs');
    identity = await (loadBackupIdentity as any)(run.runDir);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeIo() {
    const out: { chunks: string[]; write: (v: string) => void } = {
      chunks: [],
      write(value: string) {
        this.chunks.push(value);
      },
    };
    const err = { chunks: [] as string[], write(value: string) { this.chunks.push(value); } };
    return { out, err };
  }

  function makeDb() {
    let endCalls = 0;
    const db = {
      query: async () => ({ rows: [], rowCount: 1 }),
      end: async () => {
        endCalls += 1;
      },
    };
    return { db, get endCalls() { return endCalls; } };
  }

  function makeAdapters(overrides: AnyRow = {}) {
    const insertCalls: AnyRow[] = [];
    const factory: any = () => ({
      loadSavedRow: makeLoadSavedRow(run.rows[0]),
      verifySource: makeVerifySource(run.rows[0]),
      archiveAndVerify: makeArchiveAndVerify(run.rows[0]),
      persistSnapshotProof: makePersistSnapshotProof(),
      insertProof: async (payload: AnyRow) => {
        insertCalls.push(payload);
      },
      ...overrides,
    });
    factory.insertCalls = insertCalls;
    return factory;
  }

  function baseDeps(overrides: AnyRow = {}) {
    const handle = makeDb();
    return {
      run: run.runDir,
      offset: 0,
      limit: 1,
      confirm: true,
      config: {
        signing: { endpoint: 'https://x.r2.cloudflarestorage.com', accessKeyId: 'a', secretAccessKey: 'b' },
        dbConfig: {},
      },
      createDb: async () => handle.db,
      freshBackup: async () => ({
        stem: '2026-10-13_12-00-00',
        schemaPath: '/x/schema.sql.gz',
        dataPath: '/x/data.sql.gz',
        schemaSha256: 'a'.repeat(64),
        dataSha256: 'b'.repeat(64),
        verifiedAt: NOW_ISO,
      }),
      adapters: makeAdapters(),
      runner: makeRunner(identity),
      now: () => new Date(NOW_ISO),
      _dbHandle: handle,
      ...overrides,
    };
  }

  it('fails before credentials, process or database work without --confirm', async () => {
    let createDbCalls = 0;
    let freshCalls = 0;
    let adapterCalls = 0;
    const deps = baseDeps({
      confirm: false,
      createDb: async () => {
        createDbCalls += 1;
        return {};
      },
      freshBackup: async () => {
        freshCalls += 1;
      },
      adapters: () => {
        adapterCalls += 1;
        return {};
      },
    });
    await expect(runRegisterCommand(deps)).rejects.toThrow(/--confirm/);
    expect(createDbCalls).toBe(0);
    expect(freshCalls).toBe(0);
    expect(adapterCalls).toBe(0);
  });

  it('stops before any proof insert when the fresh database backup fails', async () => {
    const deps = baseDeps({
      freshBackup: async () => {
        throw new Error('backup export failed');
      },
    });
    await expect(runRegisterCommand(deps)).rejects.toThrow(/backup export failed/);
    expect(deps.adapters.insertCalls).toHaveLength(0);
    expect(deps._dbHandle.endCalls).toBe(1);
  });

  it('inserts the proof once and closes the database on success', async () => {
    const deps = baseDeps();
    const result = await runRegisterCommand(deps);
    expect(result.status).toBe('ok');
    expect(result.count).toBe(1);
    expect(deps.adapters.insertCalls).toHaveLength(1);
    expect(deps._dbHandle.endCalls).toBe(1);
  });

  it('closes the database even when the proof insert fails', async () => {
    const adapters = makeAdapters({
      insertProof: async () => {
        throw new Error('insert failed');
      },
    });
    const deps = baseDeps({ adapters });
    await expect(runRegisterCommand(deps)).rejects.toThrow(/insert failed/);
    expect(deps._dbHandle.endCalls).toBe(1);
  });

  it('enforces the offset and limit bounds before any work', async () => {
    await expect(runRegisterCommand(baseDeps({ limit: 0 }))).rejects.toThrow(/limit/);
    await expect(runRegisterCommand(baseDeps({ limit: 51 }))).rejects.toThrow(/limit/);
    await expect(runRegisterCommand(baseDeps({ offset: -1 }))).rejects.toThrow(/offset/);
    await expect(runRegisterCommand(baseDeps({ offset: 5, limit: 1 }))).rejects.toThrow(
      /No saved-images rows/
    );
  });

  it('rejects unknown, duplicate and unsafe flags without reading credentials', async () => {
    const unknown = makeIo();
    expect(
      await main(['register', '--run', 'x', '--limit', '1', '--confirm', '--bogus'], unknown)
    ).toBe(1);
    expect(unknown.err.chunks.join('')).toContain('Unknown flag');

    const duplicate = makeIo();
    expect(
      await main(['register', '--run', 'x', '--run', 'y', '--limit', '1', '--confirm'], duplicate)
    ).toBe(1);
    expect(duplicate.err.chunks.join('')).toContain('Duplicate flag');

    const unsafe = makeIo();
    expect(
      await main(['register', '--run', 'bad\npath', '--limit', '1', '--confirm'], unsafe)
    ).toBe(1);
    expect(unsafe.err.chunks.join('')).toContain('safe --run');
  });

  it('refuses register without --confirm before reading credentials', async () => {
    const io = makeIo();
    expect(await main(['register', '--run', 'x', '--limit', '1'], io)).toBe(1);
    expect(io.err.chunks.join('')).toContain('--confirm');
  });

  it('allows --help and no command without running anything', async () => {
    const help = makeIo();
    expect(await main(['--help'], help)).toBe(0);
    expect(help.out.chunks.join('')).toContain('Usage:');
    expect(await main(['register', '--help'], help)).toBe(0);
    expect(await main([], help)).toBe(1);
  });

  it('parses register flags strictly', () => {
    expect(parseRegisterFlags(['--run', 'x', '--offset', '2', '--limit', '3', '--confirm'])).toEqual({
      run: 'x',
      offset: '2',
      limit: '3',
      confirm: true,
    });
    expect(() => parseRegisterFlags(['--run'])).toThrow(/Missing value/);
    expect(() => parseRegisterFlags(['--confirm', '--confirm'])).toThrow(/Duplicate/);
  });
});
