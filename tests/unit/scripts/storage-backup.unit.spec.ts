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
  selectPurgePaths,
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
      if (script.includes('sha256sum -c -')) {
        return execFileSync('sha256sum', ['-c', '-'], { cwd: runDir, input: options.input, encoding: 'utf8' });
      }
      if (script.includes('sha256sum ') && script.includes('manifest.jsonl')) {
        const digest = sha256(fs.readFileSync(path.join(runDir, 'manifest.jsonl')));
        return `${digest}  manifest.jsonl\n`;
      }
      if (script.includes('sha256sum ') && script.includes('pending-delta.jsonl')) {
        const digest = sha256(fs.readFileSync(path.join(runDir, 'pending-delta.jsonl')));
        return `${digest}  pending-delta.jsonl\n`;
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

    // Both the local and the laptop sha256sum -c gates ran. The laptop gate
    // verifies against the LOCAL checksum list sent over stdin, never the
    // laptop's own copy of manifest.sha256.
    const localCheck = runner.calls.filter((c: any) => c.command === 'sha256sum');
    const remoteCheck = runner.calls.filter(
      (c: any) => c.command === 'ssh' && (c.args[1] ?? '').includes('sha256sum -c -')
    );
    expect(localCheck).toHaveLength(1);
    // The object proof gate plus the final-receipt gate each run on the laptop.
    expect(remoteCheck).toHaveLength(2);
    expect(remoteCheck[0].options.input).toBe(rawChecksum);
    expect(
      runner.calls.some(
        (c: any) => c.command === 'ssh' && (c.args[1] ?? '').includes('manifest.sha256')
      )
    ).toBe(false);
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

  it('never trusts the laptop copy of manifest.sha256 for the remote gate', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = path.join(root, 'no-remote-list');
    const base = realRunner(runDir);
    const runner: any = async (command: string, args: string[], options: any = {}) => {
      if (command === 'ssh' && (args[1] ?? '').includes('sha256sum -c manifest.sha256')) {
        throw new Error('must not trust the laptop checksum list');
      }
      return base(command, args, options);
    };

    await runBackup({
      outputRoot: root,
      runId: 'no-remote-list',
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a],
      downloadObject: storeDownload([a]),
      runCommand: runner,
    });

    const remoteCheck = base.calls.find(
      (c: any) => c.command === 'ssh' && (c.args[1] ?? '').includes('sha256sum -c -')
    );
    expect(remoteCheck).toBeTruthy();
    expect(remoteCheck.options.input).toBe(
      fs.readFileSync(path.join(runDir, 'manifest.sha256'), 'utf8')
    );
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

  it('defaults the receipt source_store to supabase and rejects an unknown store before writing', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/source.png', 'source bytes');
    const runDir = path.join(root, 'run-source-store');
    const result = await runBackup({
      outputRoot: root,
      runId: 'run-source-store',
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a],
      downloadObject: storeDownload([a]),
      runCommand: realRunner(runDir),
    });
    expect(result.receipt.source_store).toBe('supabase');

    const badDir = path.join(root, 'run-bad-store');
    await expect(
      runBackup({
        outputRoot: root,
        runId: 'run-bad-store',
        sourceStore: 'ftp',
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject: storeDownload([a]),
        runCommand: realRunner(badDir),
      })
    ).rejects.toThrow(/Unknown source_store/);
    expect(fs.existsSync(badDir)).toBe(false);
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

describe('runBackup final receipt upload (SQR-01)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-receipt-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function basicRun(runId: string, runner: any) {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    return runBackup({
      outputRoot: root,
      runId,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a],
      downloadObject: storeDownload([a]),
      runCommand: runner,
    });
  }

  it('uploads the final receipt to the laptop after the object proof, verified against the local raw bytes', async () => {
    const runId = 'receipt-upload';
    const runDir = path.join(root, runId);
    const runner = realRunner(runDir);
    await basicRun(runId, runner);

    const receiptBytes = fs.readFileSync(path.join(runDir, 'backup-verification.json'));
    const expected = `${sha256(receiptBytes)}  backup-verification.json\n`;

    // The receipt copy follows the object proof (manifest gate).
    const receiptRsync = runner.calls.findIndex(
      (c: any) => c.command === 'rsync' && c.args.some((a: string) => a.includes('backup-verification.json'))
    );
    const objectGate = runner.calls.findIndex(
      (c: any) => c.command === 'ssh' && (c.options.input ?? '').includes(`${INPUT_BUCKET}/`)
    );
    expect(receiptRsync).toBeGreaterThan(-1);
    expect(objectGate).toBeGreaterThan(-1);
    expect(receiptRsync).toBeGreaterThan(objectGate);

    // Only the receipt is copied, and the expected checksum comes from the raw
    // local bytes, never the laptop's own checksum list.
    const receiptRsyncCall = runner.calls[receiptRsync];
    // Only the receipt file is the rsync source.
    expect(receiptRsyncCall.args[2]).toBe(path.join(runDir, 'backup-verification.json'));
    expect(receiptRsyncCall.args[3]).toContain('backup-verification.json');
    const receiptCheck = runner.calls.find(
      (c: any) => c.command === 'ssh' && (c.options.input ?? '').includes('backup-verification.json')
    );
    expect(receiptCheck).toBeTruthy();
    expect(receiptCheck.options.input).toBe(expected);
    expect(receiptCheck.options.input).not.toContain(INPUT_BUCKET);
  });

  it('fails the command and drops the receipt when the laptop receipt checksum does not match', async () => {
    const runId = 'receipt-fail';
    const runDir = path.join(root, runId);
    const base = realRunner(runDir);
    const runner: any = async (command: string, args: string[], options: any = {}) => {
      if (command === 'ssh' && (options.input ?? '').includes('backup-verification.json')) {
        throw new Error('remote receipt checksum failed');
      }
      return base(command, args, options);
    };

    await expect(basicRun(runId, runner)).rejects.toThrow(/remote receipt checksum failed/);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
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
      source_version: a.version,
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

  it('re-downloads and preserves old bytes when only the source ETag changes', async () => {
    const oldContent = Buffer.from('old-pixel-123456');
    const newContent = Buffer.from('new-pixel-654321');
    const a = objectFor(INPUT_BUCKET, 'input/etag.png', oldContent.toString());
    const changed = { ...a, version: 'etag-v2', content: newContent.toString() };
    const runDir = path.join(root, 'resume-changed-etag');
    writeArtifact(runDir, INPUT_BUCKET, a.path, oldContent);
    writeCheckpoint(runDir, INPUT_BUCKET, a.path, {
      sha256: sha256(oldContent),
      bytes: oldContent.length,
      created_at: CREATED,
      updated_at: UPDATED,
      version: a.id,
      source_version: a.version,
    });
    const downloadObject = vi.fn(storeDownload([changed]));

    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [changed],
      downloadObject,
      runCommand: realRunner(runDir),
    });

    expect(downloadObject).toHaveBeenCalledTimes(1);
    expect(result.manifest[0].sha256).toBe(sha256(newContent));
    const retainedRel = `${INPUT_BUCKET}/.superseded/${a.path}.${sha256(oldContent)}`;
    expect(fs.readFileSync(path.join(runDir, retainedRel), 'utf8')).toBe(oldContent.toString());
  });

  it('resumes without downloading when the source ETag is unchanged', async () => {
    const content = Buffer.from('stable etag bytes');
    const a = objectFor(INPUT_BUCKET, 'input/etag-same.png', content.toString());
    const runDir = path.join(root, 'resume-same-etag');
    writeArtifact(runDir, INPUT_BUCKET, a.path, content);
    writeCheckpoint(runDir, INPUT_BUCKET, a.path, {
      sha256: sha256(content),
      bytes: content.length,
      created_at: CREATED,
      updated_at: UPDATED,
      version: a.id,
      source_version: a.version,
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
  });

  it('resumes a historical checkpoint with no source_version against an object with no version', async () => {
    const content = Buffer.from('supabase legacy bytes');
    const legacy: any = objectFor(INPUT_BUCKET, 'input/legacy.png', content.toString());
    delete legacy.version;
    const runDir = path.join(root, 'resume-legacy');
    writeArtifact(runDir, INPUT_BUCKET, legacy.path, content);
    writeCheckpoint(runDir, INPUT_BUCKET, legacy.path, {
      sha256: sha256(content),
      bytes: content.length,
      created_at: CREATED,
      updated_at: UPDATED,
      version: legacy.id,
    });
    const downloadObject = vi.fn(storeDownload([legacy]));

    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [legacy],
      downloadObject,
      runCommand: realRunner(runDir),
    });

    expect(downloadObject).not.toHaveBeenCalled();
    expect(result.manifest[0].sha256).toBe(sha256(content));
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

  it('refuses a symlinked .superseded directory before copying or unlinking the prior receipt', async () => {
    const content = Buffer.from('bytes');
    const a = objectFor(INPUT_BUCKET, 'input/a.png', content.toString());
    const runDir = path.join(root, 'receipt-superseded-symlink');
    fs.mkdirSync(runDir, { recursive: true });
    const prior = JSON.stringify({ run_id: 'prior', buckets: [INPUT_BUCKET] }, null, 2);
    fs.writeFileSync(path.join(runDir, 'backup-verification.json'), prior);
    const outside = path.join(root, 'receipt-outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(runDir, '.superseded'));
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root,
        resumeDir: runDir,
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject,
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/superseded.*symlink/i);
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(true);
    expect(downloadObject).not.toHaveBeenCalled();
  });

  it('refuses to unlink the prior receipt when the retained copy holds different bytes', async () => {
    const content = Buffer.from('bytes');
    const a = objectFor(INPUT_BUCKET, 'input/a.png', content.toString());
    const runDir = path.join(root, 'receipt-retained-mismatch');
    fs.mkdirSync(runDir, { recursive: true });
    const prior = JSON.stringify({ run_id: 'prior', buckets: [INPUT_BUCKET] }, null, 2);
    fs.writeFileSync(path.join(runDir, 'backup-verification.json'), prior);
    fs.mkdirSync(path.join(runDir, '.superseded'), { recursive: true });
    fs.writeFileSync(
      path.join(runDir, '.superseded', `backup-verification.json.${sha256(prior)}`),
      'tampered retained bytes'
    );
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root,
        resumeDir: runDir,
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject,
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/retained.*mismatch/i);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(true);
    expect(downloadObject).not.toHaveBeenCalled();
  });

  it('refuses a resume directory that is a symlink before any download or write', async () => {
    const content = Buffer.from('bytes');
    const a = objectFor(INPUT_BUCKET, 'input/a.png', content.toString());
    const outside = path.join(root, 'resume-dir-outside');
    fs.mkdirSync(outside, { recursive: true });
    const runDir = path.join(root, 'resume-dir-symlink');
    fs.symlinkSync(outside, runDir);
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root,
        resumeDir: runDir,
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject,
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/regular directory/i);
    expect(downloadObject).not.toHaveBeenCalled();
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

describe('runBackup frozen-starting-inventory scope (SQR-01)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-frozen-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('accepts additive objects that appear only in the second listing and freezes them', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'a-bytes');
    const b = objectFor(INPUT_BUCKET, 'input/b.png', 'b-bytes');
    const runDir = path.join(root, 'additive');
    let call = 0;

    const result = await runBackup({
      outputRoot: root,
      runId: 'additive',
      buckets: [INPUT_BUCKET],
      listObjects: async () => {
        call += 1;
        return call === 1 ? [a] : [a, b];
      },
      downloadObject: storeDownload([a, b]),
      runCommand: realRunner(runDir),
    });

    expect(result.manifest.map((r: any) => r.path).sort()).toEqual([
      'input/a.png',
      'input/b.png',
    ]);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')
    );
    expect(receipt.source_inventory_scope).toBe('frozen-starting-inventory');
    expect(receipt.pending_delta_count).toBe(0);
    expect(receipt.object_count).toBe(2);
    expect(fs.readFileSync(path.join(runDir, 'pending-delta.jsonl'), 'utf8')).toBe('');
  });

  it('records an object that arrives after the freeze as an unbacked pending delta', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'a-bytes');
    const b = objectFor(INPUT_BUCKET, 'input/b.png', 'b-bytes');
    const runDir = path.join(root, 'delta');
    let call = 0;

    const result = await runBackup({
      outputRoot: root,
      runId: 'delta',
      buckets: [INPUT_BUCKET],
      listObjects: async () => {
        call += 1;
        return call <= 2 ? [a] : [a, b];
      },
      downloadObject: storeDownload([a]),
      runCommand: realRunner(runDir),
    });

    // The frozen snapshot backs only a; b arrived after the freeze.
    expect(result.manifest.map((r: any) => r.path)).toEqual(['input/a.png']);
    const rawDelta = fs.readFileSync(path.join(runDir, 'pending-delta.jsonl'), 'utf8');
    const delta = parseManifestJsonl(rawDelta);
    expect(delta).toHaveLength(1);
    expect(delta[0]).toMatchObject({ bucket: INPUT_BUCKET, path: 'input/b.png' });
    expect(delta[0].sha256).toBeUndefined();

    const receipt = JSON.parse(
      fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')
    );
    expect(receipt.object_count).toBe(1);
    expect(receipt.pending_delta_count).toBe(1);
    expect(receipt.pending_delta_sha256).toBe(sha256(rawDelta));
    // The unbacked arrival never enters the verified manifest count.
    expect(receipt.total_bytes).toBe(a.bytes);
  });

  it('refuses the receipt when the remote pending-delta digest does not match', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'a-bytes');
    const runDir = path.join(root, 'pending-digest-fail');
    const base = realRunner(runDir);
    const runner: any = async (command: string, args: string[], options: any = {}) => {
      if (command === 'ssh' && (args[1] ?? '').includes('pending-delta.jsonl')) {
        return `${'0'.repeat(64)}  pending-delta.jsonl\n`;
      }
      return base(command, args, options);
    };

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'pending-digest-fail',
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject: storeDownload([a]),
        runCommand: runner,
      })
    ).rejects.toThrow(/Remote pending-delta digest mismatch/);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
  });

  it('fails closed when a frozen object changes version before the final listing', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'a-bytes');
    const changed = { ...a, version: 'v2' };
    const runDir = path.join(root, 'frozen-version-change');
    let call = 0;

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'frozen-version-change',
        buckets: [INPUT_BUCKET],
        listObjects: async () => {
          call += 1;
          return call <= 2 ? [a] : [changed];
        },
        downloadObject: storeDownload([a]),
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Inventory changed during backup/);
    expect(fs.existsSync(path.join(runDir, 'manifest.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
  });

  it('fails closed when a frozen object is removed before the final listing', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'a-bytes');
    const runDir = path.join(root, 'frozen-removal');
    let call = 0;

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'frozen-removal',
        buckets: [INPUT_BUCKET],
        listObjects: async () => {
          call += 1;
          return call <= 2 ? [a] : [];
        },
        downloadObject: storeDownload([a]),
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Inventory changed during backup/);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
  });

  it('rejects duplicate paths in the first listing', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'a-bytes');
    const runDir = path.join(root, 'dup-first');

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'dup-first',
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a, { ...a }],
        downloadObject: storeDownload([a]),
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Duplicate object path/);
  });

  it('rejects duplicate paths in the second listing', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'a-bytes');
    const runDir = path.join(root, 'dup-second');
    let call = 0;

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'dup-second',
        buckets: [INPUT_BUCKET],
        listObjects: async () => {
          call += 1;
          return call === 1 ? [a] : [a, { ...a }];
        },
        downloadObject: storeDownload([a]),
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Duplicate object path/);
  });

  it('preserves and removes a prior receipt on a failed resume', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'a-bytes');
    const runDir = path.join(root, 'resume-receipt');
    fs.mkdirSync(runDir, { recursive: true });
    const prior = JSON.stringify({ run_id: 'prior', object_count: 0, buckets: [INPUT_BUCKET] }, null, 2);
    fs.writeFileSync(path.join(runDir, 'backup-verification.json'), prior);

    await expect(
      runBackup({
        outputRoot: root,
        resumeDir: runDir,
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject: async () => {
          throw new Error('network reset');
        },
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/network reset/);

    // No stale valid receipt survives a failed verification.
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
    const retained = path.join(runDir, `.superseded/backup-verification.json.${sha256(prior)}`);
    expect(fs.readFileSync(retained, 'utf8')).toBe(prior);
  });

  it('never selects a pending-delta arrival for a purge plan', () => {
    const frozen = {
      bucket: INPUT_BUCKET,
      path: 'input/backed.png',
      bytes: 3,
      sha256: 'a'.repeat(64),
      created_at: CREATED,
      updated_at: UPDATED,
    };
    const verifiedByKey = new Map([[makeObjectKey(INPUT_BUCKET, frozen.path), frozen]]);
    const candidate = (p: string) => ({
      path: p,
      bytes: 1,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      gallery_reference: false,
      nonterminal_reservation_reference: false,
      nonterminal_job_reference: false,
      reservation_output_reference: false,
      job_output_reference: false,
    });
    const now = Date.parse('2026-10-20T00:00:00.000Z');

    const selected = selectPurgePaths([candidate('input/new-arrival.png')], {
      now,
      verifiedByKey,
    });
    expect(selected).toEqual([]);
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

describe('runBackup bounded inventory retry and preservation (SQR-01)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-sqr01-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // Mirrors the production downloader: write a private temp file, then rename
  // over the target, so a preserved hardlink/copy is not truncated in place.
  function renamingDownload(contentFor: (bucket: string, objectPath: string) => string) {
    return async ({ bucket, path: objectPath, targetPath }: any) => {
      const buffer = Buffer.from(contentFor(bucket, objectPath));
      const tmp = `${targetPath}.fake.${Math.random().toString(36).slice(2)}`;
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, targetPath);
      return { sha256: sha256(buffer), bytes: buffer.length };
    };
  }

  it('retries a same-count replacement during download and preserves the superseded bytes', async () => {
    const oldObject = objectFor(INPUT_BUCKET, 'input/x.png', 'old-bytes');
    const newObject = objectFor(INPUT_BUCKET, 'input/x.png', 'new-bytes');
    newObject.updated_at = '2026-10-09T00:00:00.000Z';
    const runDir = path.join(root, 'retry-preserve');
    let live = oldObject;
    let listingCalls = 0;
    const listObjects = async () => {
      listingCalls += 1;
      if (listingCalls === 3) live = newObject;
      return [live];
    };
    const downloadObject = vi.fn(async ({ targetPath }: any) => {
      const buffer = Buffer.from(live.content);
      const tmp = `${targetPath}.fake`;
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, targetPath);
      return { sha256: sha256(buffer), bytes: buffer.length };
    });

    const result = await runBackup({
      outputRoot: root,
      runId: 'retry-preserve',
      buckets: [INPUT_BUCKET],
      listObjects,
      downloadObject,
      inventoryRetries: 2,
      runCommand: realRunner(runDir),
    });

    expect(downloadObject).toHaveBeenCalledTimes(2);
    const retainedRel = `${INPUT_BUCKET}/.superseded/input/x.png.${sha256('old-bytes')}`;
    expect(fs.readFileSync(path.join(runDir, retainedRel), 'utf8')).toBe('old-bytes');
    expect(result.manifest[0].sha256).toBe(sha256('new-bytes'));
    const retained = fs.readFileSync(path.join(runDir, 'retained.sha256'), 'utf8');
    expect(retained).toContain(`${sha256('old-bytes')}  ${retainedRel}`);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')
    );
    expect(receipt.object_count).toBe(1);
    expect(receipt.retained_count).toBe(1);
  });

  it('retains a checkpoint artifact removed from the live inventory and checksums it remotely', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'keep');
    const b = objectFor(INPUT_BUCKET, 'input/b.png', 'removed');
    const runDir = path.join(root, 'orphan-run');
    await runBackup({
      outputRoot: root,
      runId: 'orphan-run',
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a, b],
      downloadObject: renamingDownload((_bucket, objectPath) =>
        objectPath === b.path ? b.content : a.content
      ),
      runCommand: realRunner(runDir),
    });

    const runner2 = realRunner(runDir);
    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a],
      downloadObject: renamingDownload(() => a.content),
      runCommand: runner2,
    });

    expect(fs.readFileSync(path.join(runDir, INPUT_BUCKET, b.path), 'utf8')).toBe('removed');
    expect(result.manifest).toHaveLength(1);
    const retained = fs.readFileSync(path.join(runDir, 'retained.sha256'), 'utf8');
    expect(retained).toContain(`${sha256('removed')}  ${INPUT_BUCKET}/${b.path}`);
    expect(
      runner2.calls.some(
        (c: any) => c.command === 'ssh' && (c.args[1] ?? '').includes('sha256sum -c -') && c.options.input === retained
      )
    ).toBe(true);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')
    );
    expect(receipt.object_count).toBe(1);
    expect(receipt.retained_count).toBe(1);
  });

  it('downloads only the delta when a new source appears on resume', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'a-bytes');
    const b = objectFor(INPUT_BUCKET, 'input/b.png', 'b-bytes');
    const runDir = path.join(root, 'delta-run');
    await runBackup({
      outputRoot: root,
      runId: 'delta-run',
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a],
      downloadObject: renamingDownload(() => a.content),
      runCommand: realRunner(runDir),
    });

    const download2 = vi.fn(
      renamingDownload((_bucket, objectPath) => (objectPath === b.path ? b.content : a.content))
    );
    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a, b],
      downloadObject: download2,
      runCommand: realRunner(runDir),
    });

    expect(download2.mock.calls.map((c: any) => c[0].path)).toEqual(['input/b.png']);
    expect(result.manifest).toHaveLength(2);
  });

  it('preserves an existing artifact that has no checkpoint entry before overwriting it', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'fresh-bytes');
    const runDir = path.join(root, 'no-cp-preserve');
    const existing = path.join(runDir, INPUT_BUCKET, a.path);
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, 'original-bytes');

    const result = await runBackup({
      outputRoot: root,
      resumeDir: runDir,
      buckets: [INPUT_BUCKET],
      listObjects: async () => [a],
      downloadObject: renamingDownload(() => a.content),
      runCommand: realRunner(runDir),
    });

    const retainedRel = `${INPUT_BUCKET}/.superseded/input/a.png.${sha256('original-bytes')}`;
    expect(fs.readFileSync(path.join(runDir, retainedRel), 'utf8')).toBe('original-bytes');
    expect(result.manifest[0].sha256).toBe(sha256('fresh-bytes'));
  });

  it('bounds retries on perpetual inventory churn and publishes no receipt', async () => {
    let n = 0;
    const runDir = path.join(root, 'perpetual');
    const listObjects = async () => {
      n += 1;
      const churned = objectFor(INPUT_BUCKET, 'input/p.png', 'churn');
      churned.updated_at = `2026-10-${String((n % 9) + 1).padStart(2, '0')}T00:00:00.000Z`;
      return [churned];
    };
    const downloadObject = vi.fn(renamingDownload(() => 'ignored'));

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'perpetual',
        buckets: [INPUT_BUCKET],
        listObjects,
        downloadObject,
        inventoryRetries: 2,
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Unstable object listing/);

    // One initial attempt plus two bounded retries, two listings each.
    expect(n).toBe(6);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
    expect(fs.existsSync(path.join(runDir, 'manifest.jsonl'))).toBe(false);
  });

  it('does not retry unrelated download failures', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = path.join(root, 'no-retry-download');
    const downloadObject = vi.fn(async () => {
      throw new Error('network reset');
    });

    await expect(
      runBackup({
        outputRoot: root,
        runId: 'no-retry-download',
        buckets: [INPUT_BUCKET],
        listObjects: async () => [a],
        downloadObject,
        inventoryRetries: 2,
        runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/network reset/);
    expect(downloadObject).toHaveBeenCalledTimes(1);
  });
});

describe('retained backup integrity', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-retained-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('refuses corrupted copies whose source disappeared', async () => {
    const runDir = path.join(root, 'corrupt-orphan');
    const gone = objectFor(INPUT_BUCKET, 'input/gone.png', 'original');
    const live = objectFor(INPUT_BUCKET, 'input/live.png', 'live');
    fs.mkdirSync(path.join(runDir, INPUT_BUCKET, 'input'), { recursive: true });
    fs.writeFileSync(path.join(runDir, INPUT_BUCKET, gone.path), 'corrupt');
    fs.writeFileSync(path.join(runDir, 'backup-checkpoint.json'), JSON.stringify({ downloaded: {
      [makeObjectKey(INPUT_BUCKET, gone.path)]: { sha256: sha256(gone.content), bytes: gone.bytes },
    } }));
    await expect(runBackup({ outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
      listObjects: async () => [live], downloadObject: storeDownload([live]), runCommand: realRunner(runDir),
    })).rejects.toThrow(/retained.*mismatch/i);
    expect(fs.existsSync(path.join(runDir, 'backup-verification.json'))).toBe(false);
  });

  it('refuses a superseded destination that is a symlink', async () => {
    const runDir = path.join(root, 'symlink-retained');
    const live = objectFor(INPUT_BUCKET, 'input/old.png', 'replacement');
    const previous = 'original';
    const retained = path.join(runDir, INPUT_BUCKET, '.superseded', `${live.path}.${sha256(previous)}`);
    fs.mkdirSync(path.dirname(retained), { recursive: true });
    fs.mkdirSync(path.join(runDir, INPUT_BUCKET, 'input'), { recursive: true });
    fs.writeFileSync(path.join(runDir, INPUT_BUCKET, live.path), previous);
    const outside = path.join(root, 'outside');
    fs.writeFileSync(outside, previous);
    fs.symlinkSync(outside, retained);
    await expect(runBackup({ outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
      listObjects: async () => [live], downloadObject: storeDownload([live]), runCommand: realRunner(runDir),
    })).rejects.toThrow(/symlink/i);
    expect(fs.readFileSync(outside, 'utf8')).toBe(previous);
  });

  it('refuses retained checkpoint paths outside the backup', async () => {
    const runDir = path.join(root, 'unsafe-retained');
    const live = objectFor(INPUT_BUCKET, 'input/live.png', 'live');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(root, 'outside'), 'outside');
    fs.writeFileSync(path.join(runDir, 'backup-checkpoint.json'), JSON.stringify({ downloaded: {}, retained: {
      '../outside': { path: '../outside', sha256: sha256('outside'), bytes: 7 },
    } }));
    await expect(runBackup({ outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
      listObjects: async () => [live], downloadObject: storeDownload([live]), runCommand: realRunner(runDir),
    })).rejects.toThrow(/unsafe|path|traversal/i);
  });
});

describe('runBackup source store and bucket scope binding (data loss)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-scope-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function seedRun(
    runId: string,
    receipt: Record<string, unknown> | null,
    checkpoint: Record<string, unknown> | null
  ) {
    const runDir = path.join(root, runId);
    fs.mkdirSync(runDir, { recursive: true });
    if (receipt) {
      fs.writeFileSync(path.join(runDir, 'backup-verification.json'), JSON.stringify(receipt, null, 2));
    }
    if (checkpoint) {
      fs.writeFileSync(path.join(runDir, 'backup-checkpoint.json'), JSON.stringify(checkpoint));
    }
    return runDir;
  }

  function entryFor(object: ReturnType<typeof objectFor>, content: string) {
    return {
      sha256: sha256(content),
      bytes: Buffer.byteLength(content),
      created_at: CREATED,
      updated_at: UPDATED,
      version: object.id,
      source_version: object.version,
    };
  }

  it('refuses to resume an r2 run as supabase and leaves the receipt byte-for-byte', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = seedRun(
      'r2-to-supabase',
      { run_id: 'r2-to-supabase', source_store: 'r2', buckets: [INPUT_BUCKET] },
      { source_store: 'r2', buckets: [INPUT_BUCKET], downloaded: {} }
    );
    const prior = fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8');
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/source_store/);

    expect(downloadObject).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')).toBe(prior);
  });

  it('refuses to resume a supabase run as r2 and leaves the receipt byte-for-byte', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = seedRun(
      'supabase-to-r2',
      { run_id: 'supabase-to-r2', source_store: 'supabase', buckets: [INPUT_BUCKET] },
      { source_store: 'supabase', buckets: [INPUT_BUCKET], downloaded: {} }
    );
    const prior = fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8');
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, sourceStore: 'r2', buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/source_store/);

    expect(downloadObject).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')).toBe(prior);
  });

  it('refuses a narrower bucket set and leaves the receipt untouched', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = seedRun(
      'narrower',
      { run_id: 'narrower', source_store: 'supabase', buckets: [INPUT_BUCKET, GALLERY_BUCKET] },
      { source_store: 'supabase', buckets: [INPUT_BUCKET, GALLERY_BUCKET], downloaded: {} }
    );
    const prior = fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8');
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/bucket scope/i);

    expect(downloadObject).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')).toBe(prior);
  });

  it('resumes when the source store and explicit bucket set match', async () => {
    const content = Buffer.from('matching bytes');
    const a = objectFor(INPUT_BUCKET, 'input/match.png', content.toString());
    const runDir = seedRun(
      'matching',
      { run_id: 'matching', source_store: 'supabase', buckets: [INPUT_BUCKET] },
      {
        source_store: 'supabase',
        buckets: [INPUT_BUCKET],
        downloaded: { [makeObjectKey(INPUT_BUCKET, a.path)]: entryFor(a, content.toString()) },
      }
    );
    fs.mkdirSync(path.join(runDir, INPUT_BUCKET, 'input'), { recursive: true });
    fs.writeFileSync(path.join(runDir, INPUT_BUCKET, a.path), content);
    const downloadObject = vi.fn(storeDownload([a]));

    const result = await runBackup({
      outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
      listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
    });

    expect(downloadObject).not.toHaveBeenCalled();
    expect(result.manifest[0].sha256).toBe(sha256(content));
  });

  it('refuses a legacy checkpoint resumed with a set that omits its proven bucket', async () => {
    const content = Buffer.from('legacy bytes');
    const a = objectFor(INPUT_BUCKET, 'input/legacy.png', content.toString());
    const runDir = seedRun('legacy-narrow', null, {
      downloaded: { [makeObjectKey(INPUT_BUCKET, a.path)]: entryFor(a, content.toString()) },
    });
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [GALLERY_BUCKET],
        listObjects: async () => [], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/omit/i);
    expect(downloadObject).not.toHaveBeenCalled();
  });

  it('allows a legacy checkpoint to widen to a new bucket without re-downloading the old one', async () => {
    const content = Buffer.from('legacy widen bytes');
    const a = objectFor(INPUT_BUCKET, 'input/widen.png', content.toString());
    const g = objectFor(GALLERY_BUCKET, 'saved/widen.png', 'gallery widen');
    const runDir = seedRun('legacy-widen', null, {
      downloaded: { [makeObjectKey(INPUT_BUCKET, a.path)]: entryFor(a, content.toString()) },
    });
    fs.mkdirSync(path.join(runDir, INPUT_BUCKET, 'input'), { recursive: true });
    fs.writeFileSync(path.join(runDir, INPUT_BUCKET, a.path), content);
    const bucketMap: Record<string, ReturnType<typeof objectFor>[]> = {
      [INPUT_BUCKET]: [a],
      [GALLERY_BUCKET]: [g],
    };
    const downloadObject = vi.fn(storeDownload([a, g]));

    const result = await runBackup({
      outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET, GALLERY_BUCKET],
      listObjects: async (bucket: string) => bucketMap[bucket] ?? [],
      downloadObject, runCommand: realRunner(runDir),
    });

    expect(downloadObject.mock.calls.map((c: any) => c[0].path)).toEqual([g.path]);
    expect(result.manifest.map((r: any) => r.path).sort()).toEqual([a.path, g.path].sort());
    const cp = JSON.parse(fs.readFileSync(path.join(runDir, 'backup-checkpoint.json'), 'utf8'));
    expect([...cp.buckets].sort()).toEqual([INPUT_BUCKET, GALLERY_BUCKET].sort());
    expect(cp.source_store).toBe('supabase');
  });

  it('records the source store and bucket scope before the first download', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/new.png', 'new bytes');
    const runDir = path.join(root, 'new-run-scope');
    const result = await runBackup({
      outputRoot: root, runId: 'new-run-scope', buckets: [INPUT_BUCKET],
      listObjects: async () => [a], downloadObject: storeDownload([a]),
      runCommand: realRunner(runDir),
    });

    expect(result.receipt.buckets).toEqual([INPUT_BUCKET]);
    const cp = JSON.parse(fs.readFileSync(path.join(runDir, 'backup-checkpoint.json'), 'utf8'));
    expect(cp.source_store).toBe('supabase');
    expect(cp.buckets).toEqual([INPUT_BUCKET]);
  });

  it('refuses a symlinked checkpoint before reading it or mutating the receipt', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = path.join(root, 'symlink-checkpoint');
    fs.mkdirSync(runDir, { recursive: true });
    const prior = JSON.stringify({ run_id: 'symlink-checkpoint', source_store: 'supabase' }, null, 2);
    fs.writeFileSync(path.join(runDir, 'backup-verification.json'), prior);
    const outside = path.join(root, 'outside-checkpoint.json');
    const outsideBytes = JSON.stringify({ downloaded: {} });
    fs.writeFileSync(outside, outsideBytes);
    fs.symlinkSync(outside, path.join(runDir, 'backup-checkpoint.json'));
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/symlink/i);

    expect(downloadObject).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')).toBe(prior);
    expect(fs.readFileSync(outside, 'utf8')).toBe(outsideBytes);
  });

  it('refuses a corrupt checkpoint before mutating the receipt or downloading', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = seedRun(
      'corrupt-checkpoint',
      { run_id: 'corrupt-checkpoint', source_store: 'supabase', buckets: [INPUT_BUCKET] },
      null
    );
    const prior = fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8');
    fs.writeFileSync(path.join(runDir, 'backup-checkpoint.json'), '{ not valid json');
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Invalid JSON/i);

    expect(downloadObject).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')).toBe(prior);
    expect(fs.existsSync(path.join(runDir, '.superseded'))).toBe(false);
  });

  it('refuses a malformed receipt before mutating the checkpoint or downloading', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const checkpoint = { source_store: 'supabase', downloaded: {} };
    const runDir = seedRun('corrupt-receipt', null, checkpoint);
    const checkpointBytes = fs.readFileSync(path.join(runDir, 'backup-checkpoint.json'), 'utf8');
    fs.writeFileSync(path.join(runDir, 'backup-verification.json'), '{ "run_id": ');
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Invalid JSON/i);

    expect(downloadObject).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(runDir, 'backup-checkpoint.json'), 'utf8')).toBe(checkpointBytes);
  });

  it('refuses a receipt that is not a JSON object', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = seedRun('array-receipt', null, null);
    fs.writeFileSync(path.join(runDir, 'backup-verification.json'), '[]');
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/Invalid JSON object/i);

    expect(downloadObject).not.toHaveBeenCalled();
  });

  it('refuses an r2 checkpoint that disagrees with a legacy supabase receipt', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = seedRun(
      'legacy-receipt-r2-cp',
      { run_id: 'legacy-receipt-r2-cp' },
      { source_store: 'r2', buckets: [INPUT_BUCKET], downloaded: {} }
    );
    const prior = fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8');
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/source_store/);

    expect(downloadObject).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8')).toBe(prior);
  });

  it('refuses a legacy receipt that a requested r2 store would reinterpret', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = seedRun('legacy-receipt-r2', { run_id: 'legacy-receipt-r2' }, null);
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, sourceStore: 'r2', buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/source_store/);

    expect(downloadObject).not.toHaveBeenCalled();
  });

  it('infers a legacy receipt scope from the manifest and refuses an omitted bucket', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = seedRun('legacy-manifest-narrow', { run_id: 'legacy-manifest-narrow' }, null);
    fs.writeFileSync(
      path.join(runDir, 'manifest.jsonl'),
      `${JSON.stringify({ bucket: INPUT_BUCKET, path: a.path, bytes: a.bytes, sha256: sha256(a.content) })}\n`
    );
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [GALLERY_BUCKET],
        listObjects: async () => [], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/omit/i);

    expect(downloadObject).not.toHaveBeenCalled();
  });

  it('refuses to infer a legacy receipt scope when the manifest is missing', async () => {
    const a = objectFor(INPUT_BUCKET, 'input/a.png', 'content');
    const runDir = seedRun('legacy-no-manifest', { run_id: 'legacy-no-manifest' }, null);
    const downloadObject = vi.fn(storeDownload([a]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [INPUT_BUCKET],
        listObjects: async () => [a], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/cannot prove/i);

    expect(downloadObject).not.toHaveBeenCalled();
  });

  it('refuses when requested buckets forget a bucket recorded only in the manifest', async () => {
    const g = objectFor(GALLERY_BUCKET, 'saved/g.png', 'gallery');
    const runDir = seedRun('cp-manifest-union', null, {
      source_store: 'supabase',
      downloaded: { [makeObjectKey(GALLERY_BUCKET, g.path)]: entryFor(g, 'gallery') },
    });
    fs.writeFileSync(
      path.join(runDir, 'manifest.jsonl'),
      `${JSON.stringify({ bucket: INPUT_BUCKET, path: 'input/x.png' })}\n`
    );
    const downloadObject = vi.fn(storeDownload([g]));

    await expect(
      runBackup({
        outputRoot: root, resumeDir: runDir, buckets: [GALLERY_BUCKET],
        listObjects: async () => [], downloadObject, runCommand: realRunner(runDir),
      })
    ).rejects.toThrow(/omit/i);

    expect(downloadObject).not.toHaveBeenCalled();
  });
});
