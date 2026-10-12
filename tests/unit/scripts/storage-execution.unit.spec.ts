import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as executionModule from '../../../scripts/storage/backup-and-purge.mjs';
import * as verificationModule from '../../../scripts/storage/backup-verification.mjs';

// Operator scripts are plain ESM (.mjs); tests are outside the tsc project.
/* eslint-disable @typescript-eslint/no-explicit-any */
const { runPurge, runExpire, writeFrozenPlan, INPUT_BUCKET, GALLERY_BUCKET } =
  executionModule as any;
const { loadFrozenPlan } = verificationModule as any;

type AnyRow = Record<string, any>;

const RUN_ID = 'run-2026-10-12';
const OLD = '2000-01-01T00:00:00.000Z';
const NEWER = '2000-02-01T00:00:00.000Z';

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function artifact(bucket: string, objectPath: string, content: string): AnyRow {
  const buffer = Buffer.from(content);
  return {
    bucket,
    path: objectPath,
    bytes: buffer.length,
    sha256: sha256(buffer),
    created_at: OLD,
    updated_at: OLD,
    db_reference: false,
    buffer,
  };
}

/** Real on-disk backup run: artifacts, raw manifest, raw checksum list, receipt. */
function makeBackupRun(root: string, objects: AnyRow[], runId = RUN_ID) {
  const runDir = path.join(root, runId);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const rows = objects.map(object => {
    const target = path.join(runDir, object.bucket, object.path);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, object.buffer);
    return {
      bucket: object.bucket,
      path: object.path,
      bytes: object.bytes,
      sha256: object.sha256,
      created_at: object.created_at,
      updated_at: object.updated_at,
      db_reference: false,
    };
  });
  const rawManifest = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
  const rawChecksum = rows.map(row => `${row.sha256}  ${row.bucket}/${row.path}`).join('\n') + '\n';
  const receipt = {
    run_id: runId,
    object_count: rows.length,
    total_bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    manifest_sha256: sha256(rawManifest),
    checksum_list_sha256: sha256(rawChecksum),
    remote: `joao@192.168.1.126:~/backups/miu-storage/${runId}/`,
    verified_at: OLD,
  };
  fs.writeFileSync(path.join(runDir, 'manifest.jsonl'), rawManifest);
  fs.writeFileSync(path.join(runDir, 'manifest.sha256'), rawChecksum);
  fs.writeFileSync(path.join(runDir, 'backup-verification.json'), JSON.stringify(receipt, null, 2));
  return { runDir, rows, receipt };
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

function idFor(index: number): string {
  return `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`;
}

function userFor(index: number): string {
  return `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
}

function expireRow(backupRow: AnyRow, index = 0): AnyRow {
  return {
    id: idFor(index),
    user_id: userFor(index),
    bucket: GALLERY_BUCKET,
    path: backupRow.path,
    original_filename: `photo-${index}.png`,
    file_size_bytes: backupRow.bytes,
    width: 1024,
    height: 768,
    model_used: 'model-x',
    processing_mode: 'upscale',
    created_at: OLD,
    bytes: backupRow.bytes,
    sha256: backupRow.sha256,
    object_created_at: backupRow.created_at,
    object_updated_at: backupRow.updated_at,
  };
}

/** Fake SSH runner that answers the exact lines the caller sent, bound to real hashes. */
function makeRunner(identity: AnyRow, mode = 'ok') {
  const events: string[] = [];
  const runner: any = async (command: string, args: string[], options: AnyRow = {}) => {
    events.push(`runner:${command}`);
    if (command === 'ssh' && args[1].includes('sha256sum -c -')) {
      if (mode === 'throw') throw new Error('remote connection failed');
      if (mode === 'failed') return `${INPUT_BUCKET}/user/aaa.png: FAILED\n`;
      return (options.input ?? '')
        .split('\n')
        .filter(Boolean)
        .map((line: string) => `${line.replace(/^[0-9a-f]{64} {2}/, '')}: OK`)
        .join('\n');
    }
    if (command === 'ssh' && args[1].includes('manifest.jsonl')) {
      return mode === 'mismatch'
        ? `${'0'.repeat(64)}  manifest.jsonl\n`
        : `${identity.manifestSha256}  manifest.jsonl\n`;
    }
    return '';
  };
  runner.events = events;
  return runner;
}

function livePurgeRow(object: any, overrides: AnyRow = {}): AnyRow {
  return {
    path: object.path,
    bytes: object.bytes,
    created_at: OLD,
    updated_at: OLD,
    gallery_reference: false,
    nonterminal_reservation_reference: false,
    nonterminal_job_reference: false,
    reservation_output_reference: false,
    job_output_reference: false,
    ...overrides,
  };
}

describe('storage-execution: refusal prerequisites', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-exec-refuse-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function purgePlan() {
    const a = artifact(INPUT_BUCKET, 'user/aaa.png', 'aaa');
    const run = makeBackupRun(root, [a]);
    writeFrozenPlan(run.runDir, 'purge', [purgeRow(a)]);
    return loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' });
  }

  function zeroCallbacks() {
    return { removeObjects: vi.fn(), listExisting: vi.fn(), checkStillEligible: vi.fn() };
  }

  it('refuses a purge with zero callbacks when no plan is supplied', async () => {
    const callbacks = zeroCallbacks();
    const withLockedBatch = vi.fn(async (fn: any) => fn());
    const result = await runPurge({
      confirm: true,
      ...callbacks,
      withLockedBatch,
      runner: vi.fn(),
    });
    expect(result.status).toBe('refused');
    expect(callbacks.removeObjects).not.toHaveBeenCalled();
    expect(callbacks.listExisting).not.toHaveBeenCalled();
    expect(callbacks.checkStillEligible).not.toHaveBeenCalled();
    expect(withLockedBatch).not.toHaveBeenCalled();
  });

  it('refuses without --confirm and touches nothing', async () => {
    const plan = await purgePlan();
    const callbacks = zeroCallbacks();
    const withLockedBatch = vi.fn(async (fn: any) => fn());
    const result = await runPurge({
      plan,
      confirm: false,
      ...callbacks,
      withLockedBatch,
      runner: vi.fn(),
    });
    expect(result.status).toBe('refused');
    expect(callbacks.removeObjects).not.toHaveBeenCalled();
    expect(withLockedBatch).not.toHaveBeenCalled();
  });

  it('refuses a purge with zero callbacks without a locked batch', async () => {
    const plan = await purgePlan();
    const callbacks = zeroCallbacks();
    const result = await runPurge({ plan, confirm: true, ...callbacks, runner: vi.fn() });
    expect(result.status).toBe('refused');
    expect(callbacks.removeObjects).not.toHaveBeenCalled();
  });

  it('refuses a purge with zero callbacks without a remote runner', async () => {
    const plan = await purgePlan();
    const callbacks = zeroCallbacks();
    const withLockedBatch = vi.fn(async (fn: any) => fn());
    const result = await runPurge({ plan, confirm: true, ...callbacks, withLockedBatch });
    expect(result.status).toBe('refused');
    expect(callbacks.removeObjects).not.toHaveBeenCalled();
  });

  it('refuses an expire with zero callbacks without a runner', async () => {
    const g = artifact(GALLERY_BUCKET, 'saved/aaa.png', 'gallery');
    const run = makeBackupRun(root, [g]);
    writeFrozenPlan(run.runDir, 'expire', [expireRow(g)]);
    const plan = await loadFrozenPlan({ backupRunDir: run.runDir, kind: 'expire' });
    const removeObjects = vi.fn();
    const result = await runExpire({
      plan,
      confirm: true,
      removeObjects,
      listExisting: vi.fn(),
      loadCurrentRows: vi.fn(),
      deleteRows: vi.fn(),
      restoreObjects: vi.fn(),
      withLockedBatch: vi.fn(async (fn: any) => fn()),
    });
    expect(result.status).toBe('refused');
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('fails closed on a mismatched or corrupt checkpoint with zero callbacks', async () => {
    const a = artifact(INPUT_BUCKET, 'user/aaa.png', 'aaa');
    const run = makeBackupRun(root, [a]);
    writeFrozenPlan(run.runDir, 'purge', [purgeRow(a)]);
    const plan = await loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' });
    const checkpointPath = path.join(run.runDir, 'purge-checkpoint.json');

    fs.writeFileSync(
      checkpointPath,
      JSON.stringify({
        plan_sha256: 'f'.repeat(64),
        manifest_sha256: 'e'.repeat(64),
        deleted: [],
      })
    );
    const mismatched = zeroCallbacks();
    let result = await runPurge({
      plan,
      confirm: true,
      ...mismatched,
      withLockedBatch: vi.fn(async (fn: any) => fn()),
      runner: vi.fn(),
      checkpointPath,
    });
    expect(result.status).toBe('refused');
    expect(mismatched.removeObjects).not.toHaveBeenCalled();

    fs.writeFileSync(checkpointPath, '{not valid json');
    const corrupt = zeroCallbacks();
    result = await runPurge({
      plan,
      confirm: true,
      ...corrupt,
      withLockedBatch: vi.fn(async (fn: any) => fn()),
      runner: vi.fn(),
      checkpointPath,
    });
    expect(result.status).toBe('refused');
    expect(corrupt.removeObjects).not.toHaveBeenCalled();
  });
});

describe('storage-execution: runPurge', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-exec-purge-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function purgeSetup(count: number) {
    const objects = Array.from({ length: count }, (_, i) =>
      artifact(INPUT_BUCKET, `user/f${i}.png`, `content-${i}`)
    );
    const run = makeBackupRun(root, objects);
    writeFrozenPlan(run.runDir, 'purge', objects.map(purgeRow));
    const plan = await loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' });
    const byPath = new Map(objects.map(object => [object.path, object]));
    return { objects, plan, identity: plan.identity, byPath };
  }

  function store(objects: AnyRow[]) {
    const present = new Set(objects.map(object => `${INPUT_BUCKET}::${object.path}`));
    const order: string[] = [];
    return {
      present,
      order,
      isPresent: (objectPath: string) => present.has(`${INPUT_BUCKET}::${objectPath}`),
      removeObjects: vi.fn(async (bucket: string, paths: string[]) => {
        order.push('remove');
        paths.forEach(objectPath => present.delete(`${bucket}::${objectPath}`));
      }),
      listExisting: vi.fn(async (bucket: string, paths: string[]) =>
        paths.filter(objectPath => present.has(`${bucket}::${objectPath}`))
      ),
    };
  }

  it('proves the batch locally and remotely before the lock, and rechecks inside it', async () => {
    const { objects, plan, identity, byPath } = await purgeSetup(2);
    const order: string[] = [];
    const runner = makeRunner(identity);
    const loggedRunner = async (...args: any[]) => {
      order.push('runner');
      return runner(...args);
    };
    const base = store(objects);
    let inside = false;
    const withLockedBatch = vi.fn(async (fn: any) => {
      order.push('lock');
      inside = true;
      try {
        return await fn();
      } finally {
        inside = false;
      }
    });
    const insideFlags: boolean[] = [];
    const checkStillEligible = vi.fn(async (_bucket: string, paths: string[]) => {
      order.push('eligibility');
      insideFlags.push(inside);
      return paths.map(objectPath => livePurgeRow(byPath.get(objectPath)));
    });

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects: base.removeObjects,
      listExisting: base.listExisting,
      checkStillEligible,
      withLockedBatch,
      runner: loggedRunner,
    });

    expect(order[0]).toBe('runner');
    expect(order.indexOf('runner')).toBeLessThan(order.indexOf('lock'));
    expect(insideFlags).toEqual([true]);
    expect(result.status).toBe('ok');
    expect(result.batches).toBe(1);
    expect(result.deleted).toEqual(objects.map(object => object.path));
  });

  it('executes zero removes when a backed-up artifact is corrupted', async () => {
    const { objects, plan } = await purgeSetup(1);
    fs.writeFileSync(path.join(plan.identity.runDir, INPUT_BUCKET, objects[0].path), 'tampered');
    const removeObjects = vi.fn();
    const withLockedBatch = vi.fn(async (fn: any) => fn());

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects,
      listExisting: vi.fn(),
      checkStillEligible: vi.fn(),
      withLockedBatch,
      runner: makeRunner(plan.identity),
    });

    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Artifact verification failed/);
    expect(removeObjects).not.toHaveBeenCalled();
    expect(withLockedBatch).not.toHaveBeenCalled();
  });

  it('executes zero removes and never locks when the remote proof fails', async () => {
    const { plan } = await purgeSetup(1);
    const removeObjects = vi.fn();
    const withLockedBatch = vi.fn(async (fn: any) => fn());

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects,
      listExisting: vi.fn(),
      checkStillEligible: vi.fn(),
      withLockedBatch,
      runner: makeRunner(plan.identity, 'failed'),
    });

    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Remote checksum verification failed/);
    expect(removeObjects).not.toHaveBeenCalled();
    expect(withLockedBatch).not.toHaveBeenCalled();
  });

  it('drops a path whose object version changed since the backup', async () => {
    const { objects, plan, identity, byPath } = await purgeSetup(1);
    const base = store(objects);
    const removeObjects = vi.fn();

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects,
      listExisting: async (_bucket: string, paths: string[]) => paths,
      checkStillEligible: async (_bucket: string, paths: string[]) =>
        paths.map(objectPath => livePurgeRow(byPath.get(objectPath), { updated_at: NEWER })),
      withLockedBatch: async (fn: any) => fn(),
      runner: makeRunner(identity),
    });

    expect(base.present.size).toBe(1);
    expect(result.status).toBe('ok');
    expect(result.dropped).toEqual([objects[0].path]);
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('treats a one-microsecond difference as a changed version and deletes nothing', async () => {
    const frozen = {
      ...artifact(INPUT_BUCKET, 'user/micro.png', 'micro-content'),
      updated_at: '2000-01-01T00:00:00.123456Z',
    };
    const run = makeBackupRun(root, [frozen]);
    writeFrozenPlan(run.runDir, 'purge', [purgeRow(frozen)]);
    const plan = await loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' });
    const removeObjects = vi.fn();

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects,
      listExisting: async (_bucket: string, paths: string[]) => paths,
      checkStillEligible: async (_bucket: string, paths: string[]) =>
        paths.map(() => livePurgeRow(frozen, { updated_at: '2000-01-01T00:00:00.123457Z' })),
      withLockedBatch: async (fn: any) => fn(),
      runner: makeRunner(plan.identity),
    });

    expect(result.status).toBe('ok');
    expect(result.dropped).toEqual(['user/micro.png']);
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('accepts the same instant expressed with Z and with +00:00', async () => {
    const frozen = {
      ...artifact(INPUT_BUCKET, 'user/offset.png', 'offset-content'),
      updated_at: '2000-01-01T00:00:00.123456Z',
    };
    const run = makeBackupRun(root, [frozen]);
    writeFrozenPlan(run.runDir, 'purge', [purgeRow(frozen)]);
    const plan = await loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' });
    const base = store([frozen]);

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects: base.removeObjects,
      listExisting: base.listExisting,
      checkStillEligible: async (_bucket: string, paths: string[]) =>
        paths.map(() => livePurgeRow(frozen, { updated_at: '2000-01-01T00:00:00.123456+00:00' })),
      withLockedBatch: async (fn: any) => fn(),
      runner: makeRunner(plan.identity),
    });

    expect(result.status).toBe('ok');
    expect(result.deleted).toEqual(['user/offset.png']);
    expect(base.removeObjects).toHaveBeenCalledWith(INPUT_BUCKET, ['user/offset.png']);
  });

  it('fails closed when the live source timestamp is a Date object', async () => {
    const frozen = artifact(INPUT_BUCKET, 'user/datemix.png', 'date-content');
    const run = makeBackupRun(root, [frozen]);
    writeFrozenPlan(run.runDir, 'purge', [purgeRow(frozen)]);
    const plan = await loadFrozenPlan({ backupRunDir: run.runDir, kind: 'purge' });
    const removeObjects = vi.fn();

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects,
      listExisting: async (_bucket: string, paths: string[]) => paths,
      checkStillEligible: async (_bucket: string, paths: string[]) =>
        paths.map(() => livePurgeRow(frozen, { created_at: new Date(OLD) })),
      withLockedBatch: async (fn: any) => fn(),
      runner: makeRunner(plan.identity),
    });

    expect(result.status).toBe('ok');
    expect(result.dropped).toEqual(['user/datemix.png']);
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('drops a path that became newly referenced between plan and purge', async () => {
    const { objects, plan, identity, byPath } = await purgeSetup(1);
    const removeObjects = vi.fn();

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects,
      listExisting: async (_bucket: string, paths: string[]) => paths,
      checkStillEligible: async (_bucket: string, paths: string[]) =>
        paths.map(objectPath => livePurgeRow(byPath.get(objectPath), { gallery_reference: true })),
      withLockedBatch: async (fn: any) => fn(),
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('ok');
    expect(result.dropped).toEqual([objects[0].path]);
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it('never removes more than 50 paths in a batch', async () => {
    const { objects, plan, identity, byPath } = await purgeSetup(120);
    const batchSizes: number[] = [];
    const base = store(objects);
    const removeObjects = vi.fn(async (bucket: string, paths: string[]) => {
      batchSizes.push(paths.length);
      paths.forEach(objectPath => base.present.delete(`${bucket}::${objectPath}`));
    });

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects,
      listExisting: async (_bucket: string, paths: string[]) =>
        paths.filter(objectPath => base.present.has(`${INPUT_BUCKET}::${objectPath}`)),
      checkStillEligible: async (_bucket: string, paths: string[]) =>
        paths.map(objectPath => livePurgeRow(byPath.get(objectPath))),
      withLockedBatch: async (fn: any) => fn(),
      runner: makeRunner(identity),
    });

    expect(batchSizes).toEqual([50, 50, 20]);
    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(50);
    expect(result.deleted).toHaveLength(120);
  });

  it('stops at the first failed batch and keeps only preceding deletions', async () => {
    const { objects, plan, identity, byPath } = await purgeSetup(120);
    const base = store(objects);
    let call = 0;
    const removeObjects = vi.fn(async (bucket: string, paths: string[]) => {
      call += 1;
      if (call === 2) throw new Error('storage unavailable');
      paths.forEach(objectPath => base.present.delete(`${bucket}::${objectPath}`));
    });

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects,
      listExisting: async (_bucket: string, paths: string[]) =>
        paths.filter(objectPath => base.present.has(`${INPUT_BUCKET}::${objectPath}`)),
      checkStillEligible: async (_bucket: string, paths: string[]) =>
        paths.map(objectPath => livePurgeRow(byPath.get(objectPath))),
      withLockedBatch: async (fn: any) => fn(),
      runner: makeRunner(identity),
    });

    expect(removeObjects).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('error');
    expect(result.deleted).toHaveLength(50);
    expect(result.error).toContain('storage unavailable');
  });

  it('classifies already-absent objects and never asks to remove them', async () => {
    const { objects, plan, identity, byPath } = await purgeSetup(2);
    const present = new Set([`${INPUT_BUCKET}::${objects[0].path}`]);
    const removeObjects = vi.fn(async (bucket: string, paths: string[]) => {
      paths.forEach(objectPath => present.delete(`${bucket}::${objectPath}`));
    });
    const checkStillEligible = vi.fn(async (_bucket: string, paths: string[]) =>
      paths.map(objectPath => livePurgeRow(byPath.get(objectPath)))
    );

    const result = await runPurge({
      plan,
      confirm: true,
      removeObjects,
      listExisting: async (_bucket: string, paths: string[]) =>
        paths.filter(objectPath => present.has(`${INPUT_BUCKET}::${objectPath}`)),
      checkStillEligible,
      withLockedBatch: async (fn: any) => fn(),
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('ok');
    expect(result.alreadyAbsent).toEqual([objects[1].path]);
    expect(result.deleted).toContain(objects[1].path);
    expect(removeObjects).toHaveBeenCalledWith(INPUT_BUCKET, [objects[0].path]);
    expect(checkStillEligible).toHaveBeenCalledWith(INPUT_BUCKET, [objects[0].path]);
  });

  it('resumes from a checkpoint bound to the plan and backup digests', async () => {
    const { objects, plan, identity, byPath } = await purgeSetup(2);
    const checkpointPath = path.join(plan.identity.runDir, 'purge-checkpoint.json');
    const base = store(objects);
    const firstRun = vi.fn(async (bucket: string, paths: string[]) => {
      paths.forEach(objectPath => base.present.delete(`${bucket}::${objectPath}`));
    });

    const first = await runPurge({
      plan,
      confirm: true,
      checkpointPath,
      removeObjects: firstRun,
      listExisting: async (_bucket: string, paths: string[]) =>
        paths.filter(objectPath => base.present.has(`${INPUT_BUCKET}::${objectPath}`)),
      checkStillEligible: async (_bucket: string, paths: string[]) =>
        paths.map(objectPath => livePurgeRow(byPath.get(objectPath))),
      withLockedBatch: async (fn: any) => fn(),
      runner: makeRunner(identity),
    });
    expect(first.status).toBe('ok');
    expect(first.deleted).toEqual(objects.map(object => object.path));

    const secondRun = vi.fn();
    const second = await runPurge({
      plan,
      confirm: true,
      checkpointPath,
      removeObjects: secondRun,
      listExisting: vi.fn(async () => []),
      checkStillEligible: vi.fn(),
      withLockedBatch: vi.fn(async (fn: any) => fn()),
      runner: makeRunner(identity),
    });
    expect(secondRun).not.toHaveBeenCalled();
    expect(second.deleted).toEqual(first.deleted);
    expect(second.batches).toBe(first.batches);
  });
});

describe('storage-execution: runExpire', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-exec-expire-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function expireSetup(count: number) {
    const objects = Array.from({ length: count }, (_, i) =>
      artifact(GALLERY_BUCKET, `saved/f${i}.png`, `gallery-${i}`)
    );
    const run = makeBackupRun(root, objects);
    const rows = objects.map((object, i) => expireRow(object, i));
    writeFrozenPlan(run.runDir, 'expire', rows);
    const plan = await loadFrozenPlan({ backupRunDir: run.runDir, kind: 'expire' });
    return { objects, rows, plan, identity: plan.identity };
  }

  function liveRows(rows: AnyRow[], override: (row: AnyRow) => AnyRow = () => ({})) {
    return rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      storage_path: row.path,
      original_filename: row.original_filename,
      file_size_bytes: row.file_size_bytes,
      width: row.width,
      height: row.height,
      model_used: row.model_used,
      processing_mode: row.processing_mode,
      created_at: row.created_at,
      eligible: true,
      // Live storage.objects identity for the PRESENT gallery object. The frozen
      // row's saved_images.created_at is independent of these object timestamps.
      object_bytes: row.bytes,
      object_created_at: row.object_created_at,
      object_updated_at: row.object_updated_at,
      ...override(row),
    }));
  }

  function expireWorld(
    rows: AnyRow[],
    options: {
      currentRows?: (ids: string[]) => AnyRow[];
      removeThrows?: string;
      removeThrowsAfterFirst?: boolean;
      removeWhich?: 'all' | 'none' | 'first';
      deleteThrows?: string;
      commitThrows?: string;
    } = {}
  ) {
    const present = new Set(rows.map(row => `${GALLERY_BUCKET}::${row.path}`));
    const order: string[] = [];
    let inside = false;

    const removeObjects = vi.fn(async (bucket: string, paths: string[]) => {
      order.push('remove');
      if (options.removeThrows) {
        if (options.removeThrowsAfterFirst) {
          present.delete(`${bucket}::${paths[0]}`);
        }
        throw new Error(options.removeThrows);
      }
      const which = options.removeWhich ?? 'all';
      paths.forEach((objectPath, index) => {
        if (which === 'all' || (which === 'first' && index === 0)) {
          present.delete(`${bucket}::${objectPath}`);
        }
      });
    });

    const listExisting = vi.fn(async (bucket: string, paths: string[]) => {
      order.push('list');
      return paths.filter(objectPath => present.has(`${bucket}::${objectPath}`));
    });

    const restoreObjects = vi.fn(async (rowsToRestore: AnyRow[]) => {
      order.push('restore');
      rowsToRestore.forEach(row => present.add(`${GALLERY_BUCKET}::${row.path}`));
    });

    const loadCurrentRows = vi.fn(async (ids: string[]) => {
      order.push('load');
      if (options.currentRows) return options.currentRows(ids);
      return liveRows(rows.filter(row => ids.includes(row.id)));
    });

    const deleteRows = vi.fn(async (frozenRows: AnyRow[]) => {
      order.push('delete');
      if (options.deleteThrows) throw new Error(options.deleteThrows);
      return frozenRows.map((row: AnyRow) => row.id);
    });

    const withLockedBatch = vi.fn(async (fn: any) => {
      order.push('lock');
      inside = true;
      try {
        return await fn();
      } finally {
        inside = false;
      }
    });

    return {
      present,
      order,
      removeObjects,
      listExisting,
      restoreObjects,
      loadCurrentRows,
      deleteRows,
      withLockedBatch,
      isInside: () => inside,
    };
  }

  it('removes and confirms the object before deleting the exact frozen row, inside the lock', async () => {
    const { rows, plan, identity } = await expireSetup(1);
    const world = expireWorld(rows);

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('ok');
    expect(world.order[0]).toBe('lock');
    expect(world.order.indexOf('remove')).toBeLessThan(world.order.lastIndexOf('list'));
    expect(world.order.lastIndexOf('list')).toBeLessThan(world.order.indexOf('delete'));
    expect(world.deleteRows).toHaveBeenCalledTimes(1);
    expect(world.deleteRows.mock.calls[0][0][0]).toMatchObject({
      id: rows[0].id,
      user_id: rows[0].user_id,
      path: rows[0].path,
      original_filename: rows[0].original_filename,
    });
    expect(result.deletedRows).toEqual([rows[0].id]);
  });

  it('skips a PRESENT object whose live version no longer matches the frozen backup, deleting nothing', async () => {
    const { rows, plan, identity } = await expireSetup(1);
    const world = expireWorld(rows, {
      currentRows: ids =>
        liveRows(
          rows.filter(row => ids.includes(row.id)),
          () => ({ object_updated_at: NEWER })
        ),
    });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('ok');
    expect(result.skipped).toContain(rows[0].id);
    expect(world.removeObjects).not.toHaveBeenCalled();
    expect(world.deleteRows).not.toHaveBeenCalled();
    expect(world.restoreObjects).not.toHaveBeenCalled();
  });

  it('preserves a row whose present object changed by one microsecond', async () => {
    const frozen = {
      ...artifact(GALLERY_BUCKET, 'saved/micro.png', 'gallery-micro'),
      updated_at: '2000-01-01T00:00:00.123456Z',
    };
    const run = makeBackupRun(root, [frozen]);
    const rows = [expireRow(frozen, 0)];
    writeFrozenPlan(run.runDir, 'expire', rows);
    const plan = await loadFrozenPlan({ backupRunDir: run.runDir, kind: 'expire' });
    const world = expireWorld(rows, {
      currentRows: ids =>
        liveRows(
          rows.filter(row => ids.includes(row.id)),
          () => ({ object_updated_at: '2000-01-01T00:00:00.123457Z' })
        ),
    });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(plan.identity),
    });

    expect(result.status).toBe('ok');
    expect(result.skipped).toContain(rows[0].id);
    expect(result.deletedRows).toEqual([]);
    expect(world.removeObjects).not.toHaveBeenCalled();
    expect(world.deleteRows).not.toHaveBeenCalled();
    expect(world.restoreObjects).not.toHaveBeenCalled();
  });

  it('skips a row that no longer matches the frozen snapshot', async () => {
    const { rows, plan, identity } = await expireSetup(1);
    const world = expireWorld(rows, {
      currentRows: ids =>
        liveRows(
          rows.filter(row => ids.includes(row.id)),
          () => ({ width: 999 })
        ),
    });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(world.removeObjects).not.toHaveBeenCalled();
    expect(world.deleteRows).not.toHaveBeenCalled();
    expect(result.skipped).toContain(rows[0].id);
  });

  it('never removes the object of a missing DB row', async () => {
    const { rows, plan, identity } = await expireSetup(1);
    const world = expireWorld(rows, { currentRows: () => [] });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(world.removeObjects).not.toHaveBeenCalled();
    expect(world.deleteRows).not.toHaveBeenCalled();
    expect(world.restoreObjects).not.toHaveBeenCalled();
    expect(result.skipped).toContain(rows[0].id);
  });

  it('does not remove an ineligible (signed-in or paid) row and keeps it', async () => {
    const { rows, plan, identity } = await expireSetup(1);
    const world = expireWorld(rows, {
      currentRows: ids =>
        liveRows(
          rows.filter(row => ids.includes(row.id)),
          () => ({ eligible: false })
        ),
    });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(world.removeObjects).not.toHaveBeenCalled();
    expect(world.deleteRows).not.toHaveBeenCalled();
    expect(result.skipped).toContain(rows[0].id);
  });

  it('restores the object of an ineligible user whose object is missing, never the row', async () => {
    const { rows, plan, identity } = await expireSetup(1);
    const world = expireWorld(rows, {
      currentRows: ids =>
        liveRows(
          rows.filter(row => ids.includes(row.id)),
          () => ({ eligible: false })
        ),
    });
    world.present.clear();

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(world.restoreObjects).toHaveBeenCalledWith([expect.objectContaining({ id: rows[0].id })]);
    expect(world.deleteRows).not.toHaveBeenCalled();
    expect(result.restored).toContain(rows[0].path);
  });

  it('leaves a saved row that is not in the frozen plan untouched', async () => {
    const { rows, plan, identity } = await expireSetup(1);
    const extra = { id: '99999999-9999-4999-8999-999999999999', path: 'saved/extra.png' };
    const world = expireWorld(rows, {
      currentRows: ids => [
        ...liveRows(rows.filter(row => ids.includes(row.id))),
        ...liveRows([{ ...rows[0], id: extra.id, path: extra.path }]),
      ],
    });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('ok');
    const removedPaths = (world.removeObjects.mock.calls as any[]).flatMap(call => call[1]);
    expect(removedPaths).toEqual([rows[0].path]);
    expect(removedPaths).not.toContain(extra.path);
    const deletedIds = (world.deleteRows.mock.calls[0][0] as AnyRow[]).map(row => row.id);
    expect(deletedIds).toEqual([rows[0].id]);
  });

  it('stops and restores the removed object after a partial Storage batch', async () => {
    const { rows, plan, identity } = await expireSetup(2);
    const world = expireWorld(rows, { removeWhich: 'first' });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('error');
    expect(world.deleteRows).not.toHaveBeenCalled();
    expect(world.restoreObjects).toHaveBeenCalledWith([expect.objectContaining({ id: rows[0].id })]);
    expect(result.restored).toContain(rows[0].path);
  });

  it('restores already-removed objects when Storage removal throws mid-batch', async () => {
    const { rows, plan, identity } = await expireSetup(2);
    const world = expireWorld(rows, {
      removeThrows: 'storage down',
      removeThrowsAfterFirst: true,
    });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('error');
    expect(world.deleteRows).not.toHaveBeenCalled();
    expect(world.restoreObjects).toHaveBeenCalledWith([expect.objectContaining({ id: rows[0].id })]);
  });

  it('restores every removed object when the guarded row delete fails', async () => {
    const { rows, plan, identity } = await expireSetup(2);
    const world = expireWorld(rows, { deleteThrows: 'db down' });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('error');
    expect(result.deletedRows).toEqual([]);
    expect(world.restoreObjects).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: rows[0].id }),
        expect.objectContaining({ id: rows[1].id }),
      ])
    );
  });

  it('restores removed objects when the locked transaction fails to commit', async () => {
    const { rows, plan, identity } = await expireSetup(1);
    const world = expireWorld(rows);
    const commitFail = async (fn: any) => {
      await world.withLockedBatch(fn);
      throw new Error('commit failed');
    };

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      withLockedBatch: commitFail,
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('error');
    expect(result.deletedRows).toEqual([]);
    expect(world.restoreObjects).toHaveBeenCalledWith([expect.objectContaining({ id: rows[0].id })]);
  });

  it('stops after the first failed batch and does not run the next', async () => {
    const { rows, plan, identity } = await expireSetup(60);
    const world = expireWorld(rows, { removeWhich: 'first' });

    const result = await runExpire({
      plan,
      confirm: true,
      ...world,
      runner: makeRunner(identity),
    });

    expect(result.status).toBe('error');
    expect(result.batches).toBe(1);
    expect(world.removeObjects).toHaveBeenCalledTimes(1);
    expect(world.deleteRows).not.toHaveBeenCalled();
  });
});

describe('native-version purge adapter', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-native-delete-')); });
  afterEach(() => { fs.rmSync(root, {recursive: true, force: true}); });

  it.each(['valid', 'changed-before', 'changed-during', 'wrong-server', 'enabled-history', 'unplanned'])('deletes only the frozen native version (%s)', async mode => {
    const object = artifact(INPUT_BUCKET, `${userFor(1)}/${idFor(1)}.png`, 'verified input');
    const run = makeBackupRun(root, [object]);
    const planned = [purgeRow(run.rows[0])];
    await writeFrozenPlan(run.runDir, 'purge', planned);
    const plan = await loadFrozenPlan({backupRunDir: run.runDir, kind: 'purge'});
    const version = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const source: AnyRow = {id: idFor(9), bucket_id: INPUT_BUCKET, name: object.path, version,
      created_at: OLD, updated_at: OLD, archived_at: null, is_versioned: false, is_delete_marker: false,
      metadata: {size: object.bytes, eTag: crypto.createHash('md5').update(object.buffer).digest('hex')}};
    fs.writeFileSync(path.join(run.runDir, 'backup-checkpoint.json'), JSON.stringify({downloaded: {
      [`${INPUT_BUCKET}::${object.path}`]: {version: source.id, created_at: OLD, updated_at: OLD},
    }}));
    const raw = JSON.stringify({manifest_sha256: plan.identity.manifestSha256, captured_at: OLD,
      objects: [{bucket: INPUT_BUCKET, path: object.path, source}]});
    fs.writeFileSync(path.join(run.runDir, 'source-object-proof.json'), raw);
    fs.writeFileSync(path.join(run.runDir, 'source-object-proof.digest'), sha256(raw)+'\n');
    let current: AnyRow | null = {...source, version: mode === 'changed-before' ? idFor(8) : version};
    const db = {query: async (sql: string) => {
      if (sql.includes('versioning_status')) return {rows: [{versioning_status: mode === 'enabled-history' ? 'ENABLED' : 'DISABLED'}]};
      if (sql.includes('ANY')) return {rows: current ? [{path: current.name}] : []};
      return {rows: current ? [{row: {...current}}] : []};
    }};
    const fetchFn = vi.fn(async (url: string, init: AnyRow = {}) => {
      if (url.endsWith('/storage/v1/version')) return new Response(mode === 'wrong-server' ? '9.0.0' : '1.80.2');
      expect(init.method).toBe('DELETE');
      expect(new URL(url).searchParams.get('versionId')).toBe(version);
      if (mode === 'changed-during') {
        current = {...source, version: idFor(8)};
        return new Response('{"code":"NoSuchKey"}', {status: 400});
      }
      current = null;
      return new Response('{}');
    });
    const actions = await (executionModule as any).makeNativeVersionStorageActions({
      plan, db, config: {supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'test-only'}, fetchFn,
    });
    if (mode === 'unplanned') {
      await expect(actions.removeObjects(INPUT_BUCKET, ['unplanned.png'])).rejects.toThrow(/planned/);
      expect(fetchFn).not.toHaveBeenCalled();
      return;
    }
    const result = await runPurge({plan, confirm: true, ...actions,
      runner: makeRunner(plan.identity), withLockedBatch: async (fn: any) => fn(),
      checkStillEligible: async () => [livePurgeRow(object)],
    });
    if (mode === 'valid') {
      expect(result.status).toBe('ok');
      expect(result.deleted).toEqual([object.path]);
      expect(current).toBeNull();
    } else {
      expect(result.status).toBe('error');
      expect(result.deleted).toEqual([]);
      expect(current).not.toBeNull();
    }
    expect(fetchFn.mock.calls.filter(([, init]: any) => init?.method === 'DELETE')).toHaveLength(
      mode === 'valid' || mode === 'changed-during' ? 1 : 0
    );
  });
});

describe('storage-execution: CLI deletion pause', () => {
  it.each(['purge', 'expire'])(
    'the real CLI refuses %s before loading config or credentials',
    command => {
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-cli-pause-'));
      try {
        const script = path.resolve('scripts/storage/backup-and-purge.mjs');
        const result = spawnSync(
          process.execPath,
          [script, command, '--confirm', '--manifest', path.join(cwd, 'nonexistent.jsonl')],
          {
            cwd,
            env: { PATH: '', HOME: cwd, CLOUDSDK_CONFIG: cwd },
            encoding: 'utf8',
            timeout: 5000,
          }
        );
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(
          'Deletion disabled until backup and concurrency safeguards pass independent review'
        );
      } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
      }
    }
  );
});
