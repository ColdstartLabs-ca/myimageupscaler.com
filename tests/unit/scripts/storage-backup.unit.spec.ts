import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReadableStream } from 'node:stream/web';

import * as storageModule from '../../../scripts/storage/backup-and-purge.mjs';

// The operator script is plain ESM (.mjs) with no JSDoc types; tests are not
// part of the tsc project, so cast the module to a loose facade.
/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  runBackup,
  streamDownloadToFile,
  parseManifestJsonl,
  makeObjectKey,
  INPUT_BUCKET,
  GALLERY_BUCKET,
  DOWNLOAD_CONCURRENCY,
} = storageModule as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const CREATED = '2026-10-01T00:00:00.000Z';
const UPDATED = '2026-10-01T00:00:00.000Z';

function sha256(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function objectFor(bucket: string, objectPath: string, content: string) {
  return {
    bucket,
    path: objectPath,
    id: `id:${bucket}:${objectPath}`,
    version: 'v1',
    bytes: Buffer.byteLength(content),
    created_at: CREATED,
    updated_at: UPDATED,
    content,
  };
}

function listing(bucket: string, objects: ReturnType<typeof objectFor>[]) {
  return {
    listObjects: async (requested: string) => (requested === bucket ? objects : []),
  };
}

function storeDownload(objects: ReturnType<typeof objectFor>[]) {
  const byKey = new Map(objects.map(o => [`${o.bucket}::${o.path}`, o.content]));
  return async ({ bucket, path: objectPath, targetPath }: any) => {
    const content = byKey.get(`${bucket}::${objectPath}`);
    if (content == null) throw new Error(`missing fake object ${bucket}/${objectPath}`);
    const buffer = Buffer.from(content);
    fs.writeFileSync(targetPath, buffer);
    return { sha256: sha256(buffer), bytes: buffer.length };
  };
}

/** Real local `sha256sum -c`; simulated remote commands. */
function realRunner(runDir: string) {
  const calls: any[] = [];
  const runner: any = async (command: string, args: string[], options: any = {}) => {
    calls.push({ command, args, options });
    if (command === 'sha256sum') {
      return execFileSync('sha256sum', args, { cwd: options.cwd, encoding: 'utf8' });
    }
    if (command === 'ssh') {
      const script = args[1] ?? '';
      if (script.includes('sha256sum ') && script.includes('manifest.jsonl')) {
        const digest = sha256(fs.readFileSync(path.join(runDir, 'manifest.jsonl')));
        return `${digest}  manifest.jsonl\n`;
      }
      return '';
    }
    return '';
  };
  runner.calls = calls;
  return runner;
}

describe('runBackup (AC-3)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-backup-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('refuses verification when the inventory changes during downloads', async () => {
    const object = objectFor(INPUT_BUCKET, 'input/source.png', 'original');
    const runner = vi.fn();
    let listingCount = 0;
    await expect(
      runBackup({
        outputRoot: root,
        runId: 'changed-during-download',
        buckets: [INPUT_BUCKET],
        listObjects: async () => {
          listingCount += 1;
          return [
            listingCount <= 2 ? object : { ...object, updated_at: '2026-10-10T00:00:00.000Z' },
          ];
        },
        downloadObject: storeDownload([object]),
        runCommand: runner,
      })
    ).rejects.toThrow('Inventory changed during backup');
    expect(runner).not.toHaveBeenCalled();
    expect(
      fs.existsSync(path.join(root, 'changed-during-download', 'backup-verification.json'))
    ).toBe(false);
  });

  it('publishes real RAW manifests and verifies both local and laptop copies before writing a receipt', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/ref.png', 'reference bytes');
    const b = objectFor(INPUT_BUCKET, 'input/plain.png', 'plain bytes');
    const g = objectFor(GALLERY_BUCKET, 'saved/one.png', 'gallery bytes');
    const all = [a, b, g];
    const bucketMap: Record<string, ReturnType<typeof objectFor>[]> = {
      [INPUT_BUCKET]: [a, b],
      [GALLERY_BUCKET]: [g],
    };
    const runDir = path.join(root, 'run-1');
    const runner = realRunner(runDir);

    const result = await runBackup({
      outputRoot: root,
      runId: 'run-1',
      buckets: [INPUT_BUCKET, GALLERY_BUCKET],
      listObjects: async (bucket: string) => bucketMap[bucket] ?? [],
      downloadObject: storeDownload(all),
      dbRefs: new Set([makeObjectKey(INPUT_BUCKET, 'input/ref.png')]),
      runCommand: runner,
    });

    // Raw manifest parses as JSONL, not as one JSON-quoted string.
    const rawManifest = fs.readFileSync(path.join(runDir, 'manifest.jsonl'), 'utf8');
    expect(rawManifest.startsWith('{')).toBe(true);
    const rows = parseManifestJsonl(rawManifest);
    expect(rows).toHaveLength(3);
    const refRow = rows.find((r: any) => r.path === 'input/ref.png');
    expect(refRow).toMatchObject({ bucket: INPUT_BUCKET, bytes: a.bytes, db_reference: true });
    expect(refRow.sha256).toBe(sha256(a.content));
    expect(rows.find((r: any) => r.path === 'input/plain.png').db_reference).toBe(false);

    // Raw checksum list is usable by the real sha256sum binary.
    const rawChecksum = fs.readFileSync(path.join(runDir, 'manifest.sha256'), 'utf8');
    expect(rawChecksum).toContain(`${sha256(a.content)}  ${INPUT_BUCKET}/input/ref.png`);
    const verified = execFileSync('sha256sum', ['-c', 'manifest.sha256'], {
      cwd: runDir,
      encoding: 'utf8',
    });
    expect(verified).not.toMatch(/FAILED/);

    // Both the local and the laptop sha256sum -c gates ran.
    const localCheck = runner.calls.filter((c: any) => c.command === 'sha256sum');
    const remoteCheck = runner.calls.filter(
      (c: any) => c.command === 'ssh' && (c.args[1] ?? '').includes('sha256sum -c manifest.sha256')
    );
    expect(localCheck).toHaveLength(1);
    expect(remoteCheck).toHaveLength(1);
    expect(
      runner.calls.some((c: any) => c.command === 'rsync' && c.args.includes('--checksum'))
    ).toBe(true);

    const receipt = JSON.parse(
      fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')
    );
    expect(receipt.object_count).toBe(3);
    expect(receipt.total_bytes).toBe(a.bytes + b.bytes + g.bytes);
    expect(receipt.manifest_sha256).toBe(sha256(rawManifest));
    expect(receipt.checksum_list_sha256).toBe(sha256(rawChecksum));
    expect(result.receipt).toEqual(receipt);
  });

  it('writes no verification receipt when the local sha256sum -c gate fails', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = path.join(root, 'run-local-fail');
    const runner = realRunner(runDir);
    const failing: any = async (command: string, args: string[], options: any = {}) => {
      if (command === 'sha256sum') throw new Error('local sha256sum failed');
      return runner(command, args, options);
    };

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'run-local-fail',
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject: storeDownload([a]),
        runCommand: failing,
      })
    ).rejects.toThrow(/local sha256sum failed/);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
  });

  it('writes no verification receipt when the remote sha256sum -c gate fails', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = path.join(root, 'run-remote-fail');
    const runner = realRunner(runDir);
    const failing: any = async (command: string, args: string[], options: any = {}) => {
      if (command === 'ssh' && (args[1] ?? '').includes('sha256sum -c')) {
        throw new Error('remote sha256sum failed');
      }
      return runner(command, args, options);
    };

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'run-remote-fail',
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject: storeDownload([a]),
        runCommand: failing,
      })
    ).rejects.toThrow(/remote sha256sum failed/);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
  });

  it('writes no verification receipt when the remote manifest digest does not match the local digest', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = path.join(root, 'run-digest-fail');
    const runner = realRunner(runDir);
    const mismatched: any = async (command: string, args: string[], options: any = {}) => {
      if (
        command === 'ssh' &&
        (args[1] ?? '').includes('sha256sum ') &&
        (args[1] ?? '').includes('manifest.jsonl')
      ) {
        return `${'0'.repeat(64)}  manifest.jsonl\n`;
      }
      return runner(command, args, options);
    };

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'run-digest-fail',
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject: storeDownload([a]),
        runCommand: mismatched,
      })
    ).rejects.toThrow(/Remote manifest digest mismatch/);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
  });

  it('fails closed on a same-count inventory change between the two listings', async () => {
    const before = objectFor(INPUT_BUCKET, 'input/before.png', 'before');
    const after = objectFor(INPUT_BUCKET, 'input/after.png', 'after');
    let call = 0;
    const runDir = path.join(root, 'run-unstable');

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'run-unstable',
        buckets: [INPUT_BUCKET],
        listObjects: async () => {
          call += 1;
          return call === 1 ? [before] : [after];
        },
        downloadObject: storeDownload([before, after]),
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Unstable object listing/);
    expect(fs.existsSync(path.join(runDir, 'manifest.jsonl'))).toBe(false);
  });

  it('fails safely on a raw filename with unsafe characters', async () => {
    const bad = objectFor(INPUT_BUCKET, 'input/bad\nname.png', 'bytes');
    const runDir = path.join(root, 'run-unsafe');

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'run-unsafe',
        buckets: [INPUT_BUCKET],
        listObjects: async () => [bad],
        downloadObject: storeDownload([bad]),
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/invalid object path/i);
    expect(fs.existsSync(path.join(runDir, 'manifest.jsonl'))).toBe(false);
  });

  it('rejects a resume directory that is not a direct child of the backup root', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    await expect(
      runBackup({
        outputRoot: root,
        resumeDir: path.dirname(root),
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject: storeDownload([a]),
        runCommand: realRunner(root),
      })
    ).rejects.toThrow(/direct child/i);
  });

  it('leaves unverified temp data and publishes nothing when a download stream fails', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = path.join(root, 'run-stream-fail');
    const failingDownload = async ({ targetPath }: any) => {
      fs.writeFileSync(`${targetPath}.part.stream`, 'partial');
      throw new Error('stream connection reset');
    };

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'run-stream-fail',
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject: failingDownload,
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/stream connection reset/);
    expect(fs.existsSync(path.join(runDir, INPUT_BUCKET, 'input/a.png'))).toBe(false);
    const parts = fs
      .readdirSync(path.join(runDir, INPUT_BUCKET, 'input'))
      .filter(name => name.includes('.part.'));
    expect(parts.length).toBe(1);
    expect(fs.existsSync(path.join(runDir, 'manifest.jsonl'))).toBe(false);
  });
});

describe('runBackup resume (AC-3)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-resume-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeArtifact(runDir: string, bucket: string, objectPath: string, content: Buffer) {
    const target = path.join(runDir, bucket, objectPath);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, content);
    return target;
  }

  function writeCheckpoint(
    runDir: string,
    bucket: string,
    objectPath: string,
    entry: Record<string, unknown>
  ) {
    fs.writeFileSync(
      path.join(runDir, 'backup-checkpoint.json'),
      JSON.stringify({ downloaded: { [makeObjectKey(bucket, objectPath)]: entry } })
    );
  }

  it('reuses an artifact only when the checkpoint hash, byte size, and live source identity all match', async () => {
    const content = Buffer.from('stable bytes');
    const a = objectFor(INPUT_BUCKET, 'input/stable.png', content.toString());
    const runDir = path.join(root, 'resume-valid');
    writeArtifact(runDir, INPUT_BUCKET, a.path, content);
    writeCheckpoint(runDir, INPUT_BUCKET, a.path, {
      sha256: sha256(content),
      bytes: content.length,
      created_at: CREATED,
      updated_at: UPDATED,
      version: a.id,
    });
    const downloadObject = vi.fn(storeDownload([a]));

    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a],
      downloadObject,
      runCommand: realRunner(runDir),
    });

    expect(downloadObject).not.toHaveBeenCalled();
    expect(result.manifest[0].sha256).toBe(sha256(content));
    expect(result.manifest[0].bytes).toBe(content.length);
  });

  it('re-downloads a corrupt artifact instead of trusting the checkpoint', async () => {
    const good = Buffer.from('correct bytes');
    const a = objectFor(INPUT_BUCKET, 'input/corrupt.png', good.toString());
    const runDir = path.join(root, 'resume-corrupt');
    writeArtifact(runDir, INPUT_BUCKET, a.path, Buffer.from('tampered!!!'));
    writeCheckpoint(runDir, INPUT_BUCKET, a.path, {
      sha256: sha256(good),
      bytes: good.length,
      created_at: CREATED,
      updated_at: UPDATED,
      version: a.id,
    });
    const downloadObject = vi.fn(storeDownload([a]));

    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a],
      downloadObject,
      runCommand: realRunner(runDir),
    });

    expect(downloadObject).toHaveBeenCalledTimes(1);
    expect(result.manifest[0].sha256).toBe(sha256(good));
  });

  it('re-downloads when the checkpoint hash is not a valid 64-hex digest', async () => {
    const content = Buffer.from('bytes');
    const a = objectFor(INPUT_BUCKET, 'input/badhash.png', content.toString());
    const runDir = path.join(root, 'resume-badhash');
    writeArtifact(runDir, INPUT_BUCKET, a.path, content);
    writeCheckpoint(runDir, INPUT_BUCKET, a.path, {
      sha256: 'z'.repeat(64),
      bytes: content.length,
      created_at: CREATED,
      updated_at: UPDATED,
      version: a.id,
    });
    const downloadObject = vi.fn(storeDownload([a]));

    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a],
      downloadObject,
      runCommand: realRunner(runDir),
    });

    expect(downloadObject).toHaveBeenCalledTimes(1);
    expect(result.manifest[0].sha256).toBe(sha256(content));
  });

  it('refuses to write through a symlinked bucket directory that escapes the run directory', async () => {
    const content = Buffer.from('bytes');
    const a = objectFor(INPUT_BUCKET, 'input/a.png', content.toString());
    const runDir = path.join(root, 'resume-symlink');
    fs.mkdirSync(runDir, { recursive: true });
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(runDir, INPUT_BUCKET));

    await expect(
      runBackup({
        outputRoot: root,
        resumeDir: runDir,
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject: storeDownload([a]),
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Symlink escape/);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('re-downloads when the live source timestamp changed since the checkpoint', async () => {
    const content = Buffer.from('source bytes');
    const a = objectFor(INPUT_BUCKET, 'input/changed.png', content.toString());
    const changedLive = { ...a, updated_at: '2026-10-05T00:00:00.000Z' };
    const runDir = path.join(root, 'resume-changed');
    writeArtifact(runDir, INPUT_BUCKET, a.path, content);
    writeCheckpoint(runDir, INPUT_BUCKET, a.path, {
      sha256: sha256(content),
      bytes: content.length,
      created_at: CREATED,
      updated_at: UPDATED,
      version: a.id,
    });
    const downloadObject = vi.fn(storeDownload([changedLive]));

    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [changedLive],
      downloadObject,
      runCommand: realRunner(runDir),
    });

    expect(downloadObject).toHaveBeenCalledTimes(1);
    expect(result.manifest[0].sha256).toBe(sha256(content));
  });
});

describe('runBackup bounded concurrency (AC-3)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-concurrency-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps at most DOWNLOAD_CONCURRENCY downloads in flight and overlaps them', async () => {
    const objects = Array.from({ length: 9 }, (_, i) =>
      objectFor(INPUT_BUCKET, `input/c${i}.png`, `content-${i}`)
    );
    const inner = storeDownload(objects);
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    const downloadObject = async (args: any) => {
      calls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise(resolve => setTimeout(resolve, 5));
        return await inner(args);
      } finally {
        inFlight -= 1;
      }
    };
    const runDir = path.join(root, 'concurrency-run');

    await runBackup({
      outputRoot: root,
      runId: 'concurrency-run',
      buckets: [INPUT_BUCKET],
      listObjects: async () => objects,
      downloadObject,
      runCommand: realRunner(runDir),
    });

    expect(calls).toBe(9);
    expect(maxInFlight).toBeLessThanOrEqual(DOWNLOAD_CONCURRENCY);
    expect(maxInFlight).toBe(DOWNLOAD_CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('settles the whole failed batch, checkpoints successes, and schedules no further batch', async () => {
    const objects = Array.from({ length: 8 }, (_, i) =>
      objectFor(INPUT_BUCKET, `input/b${i}.png`, `batch-${i}`)
    );
    const inner = storeDownload(objects);
    const attempted: string[] = [];
    const downloadObject = async (args: any) => {
      attempted.push(args.path);
      if (args.path === 'input/b1.png') {
        await new Promise(resolve => setTimeout(resolve, 1));
        throw new Error('boom on b1');
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      return inner(args);
    };
    const runDir = path.join(root, 'failed-batch');

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'failed-batch',
        buckets: [INPUT_BUCKET],
        listObjects: async () => objects,
        downloadObject,
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/boom on b1/);

    // Only the first batch of four was ever attempted; the second never ran.
    expect(attempted.sort()).toEqual([
      'input/b0.png',
      'input/b1.png',
      'input/b2.png',
      'input/b3.png',
    ]);
    // Siblings finished even though b1 failed, so the batch waited for them.
    for (const name of ['b0', 'b2', 'b3']) {
      expect(fs.existsSync(path.join(runDir, INPUT_BUCKET, 'input', `${name}.png`))).toBe(true);
    }
    // One checkpoint persisted the successful siblings and omitted the failure.
    const cp = JSON.parse(fs.readFileSync(path.join(runDir, 'backup-checkpoint.json'), 'utf8'));
    expect(Object.keys(cp.downloaded).sort()).toEqual(
      [
        makeObjectKey(INPUT_BUCKET, 'input/b0.png'),
        makeObjectKey(INPUT_BUCKET, 'input/b2.png'),
        makeObjectKey(INPUT_BUCKET, 'input/b3.png'),
      ].sort()
    );
    expect(fs.existsSync(path.join(runDir, 'manifest.jsonl'))).toBe(false);
  });

  it('persists successful checkpoints after a partial failure and resume reuses their hashes', async () => {
    const objects = Array.from({ length: 6 }, (_, i) =>
      objectFor(INPUT_BUCKET, `input/r${i}.png`, `resume-${i}`)
    );
    const inner = storeDownload(objects);
    const firstAttempts: string[] = [];
    const firstDownload = vi.fn(async (args: any) => {
      firstAttempts.push(args.path);
      if (args.path === 'input/r1.png') throw new Error('first pass failure');
      return inner(args);
    });
    const runDir = path.join(root, 'resume-partial');

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'resume-partial',
        buckets: [INPUT_BUCKET],
        listObjects: async () => objects,
        downloadObject: firstDownload,
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/first pass failure/);
    expect(firstAttempts.sort()).toEqual([
      'input/r0.png',
      'input/r1.png',
      'input/r2.png',
      'input/r3.png',
    ]);

    const secondDownload = vi.fn(inner);
    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => objects,
      downloadObject: secondDownload,
      runCommand: realRunner(runDir),
    });

    // Only objects without a persisted checkpoint were re-downloaded.
    expect(secondDownload.mock.calls.map((c: any) => c[0].path).sort()).toEqual([
      'input/r1.png',
      'input/r4.png',
      'input/r5.png',
    ]);
    expect(result.manifest).toHaveLength(6);
    for (const object of objects) {
      const row = result.manifest.find((r: any) => r.path === object.path);
      expect(row.sha256).toBe(sha256(Buffer.from(object.content)));
    }
  });
});

describe('streamDownloadToFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-stream-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('leaves the unverified temp file and never renames when the stream breaks', async () => {
    const targetPath = path.join(dir, 'artifact.png');
    let pulls = 0;
    const body = new ReadableStream({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        else controller.error(new Error('stream broke mid-transfer'));
      },
    });
    const fetchFn = async () => ({ ok: true, status: 200, body });

    await expect(
      streamDownloadToFile({
        url: 'https://example.invalid/object',
        headers: {},
        targetPath,
        expectedBytes: 4,
        fetchFn,
      })
    ).rejects.toThrow(/stream broke/);
    expect(fs.existsSync(targetPath)).toBe(false);
    const parts = fs.readdirSync(dir).filter(name => name.includes('.part.'));
    expect(parts.length).toBe(1);
  });

  it('renames only after exact byte count and returns the streamed hash', async () => {
    const targetPath = path.join(dir, 'good.png');
    const payload = Buffer.from('streamed payload');
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(payload));
        controller.close();
      },
    });
    const fetchFn = async () => ({ ok: true, status: 200, body });

    const result = await streamDownloadToFile({
      url: 'https://example.invalid/object',
      headers: {},
      targetPath,
      expectedBytes: payload.length,
      fetchFn,
    });

    expect(result).toEqual({ sha256: sha256(payload), bytes: payload.length });
    expect(fs.readFileSync(targetPath)).toEqual(payload);
  });
});
