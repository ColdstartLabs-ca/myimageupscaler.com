import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as r2Module from '../../../scripts/storage/r2-gallery-backup.mjs';
import * as storageModule from '../../../scripts/storage/backup-and-purge.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const { runR2GalleryBackup, R2_GALLERY_BUCKETS, R2_SOURCE_STORE, cmdBackup, main, parseBackupArgs } =
  r2Module as any;
const { requireSupabaseSourceStore, GALLERY_BUCKET } = storageModule as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const CREATED = '2026-10-01T00:00:00.000Z';
const UPDATED = '2026-10-01T00:00:00.000Z';

function sha256(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function objectFor(objectPath: string, content: string) {
  return {
    bucket: GALLERY_BUCKET,
    path: objectPath,
    id: `id:${objectPath}`,
    version: 'v1',
    bytes: Buffer.byteLength(content),
    created_at: CREATED,
    updated_at: UPDATED,
    content,
  };
}

function listing(objects: ReturnType<typeof objectFor>[]) {
  return async (bucket: string) => (bucket === GALLERY_BUCKET ? objects : []);
}

function storeDownload(objects: ReturnType<typeof objectFor>[]) {
  const byPath = new Map(objects.map(o => [o.path, o.content]));
  return async ({ path: objectPath, targetPath }: any) => {
    const content = byPath.get(objectPath);
    if (content == null) throw new Error(`missing fake object ${objectPath}`);
    const buffer = Buffer.from(content);
    fs.writeFileSync(targetPath, buffer);
    return { sha256: sha256(buffer), bytes: buffer.length };
  };
}

/** Real local `sha256sum -c`; simulated remote commands. */
function realRunner(runDir: string) {
  const runner: any = async (command: string, args: string[], options: any = {}) => {
    if (command === 'sha256sum') {
      return execFileSync('sha256sum', args, { cwd: options.cwd, encoding: 'utf8' });
    }
    if (command === 'ssh') {
      const script = args[1] ?? '';
      if (script.includes('sha256sum -c -')) {
        return execFileSync('sha256sum', ['-c', '-'], {
          cwd: runDir,
          input: options.input,
          encoding: 'utf8',
        });
      }
      if (script.includes('sha256sum ') && script.includes('manifest.jsonl')) {
        return `${sha256(fs.readFileSync(path.join(runDir, 'manifest.jsonl')))}  manifest.jsonl\n`;
      }
      if (script.includes('sha256sum ') && script.includes('pending-delta.jsonl')) {
        return `${sha256(fs.readFileSync(path.join(runDir, 'pending-delta.jsonl')))}  pending-delta.jsonl\n`;
      }
      return '';
    }
    return '';
  };
  return runner;
}

describe('runR2GalleryBackup', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-r2-gallery-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('backs only the saved-images gallery and binds the receipt to the r2 source store', async () => {
    const a = objectFor('saved/one.png', 'gallery bytes one');
    const b = objectFor('saved/two.png', 'gallery bytes two');
    const runDir = path.join(root, 'r2-gallery-run');

    const result = await runR2GalleryBackup({
      outputRoot: root,
      resumeDir: runDir,
      listObjects: listing([a, b]),
      downloadObject: storeDownload([a, b]),
      runner: realRunner(runDir),
    });

    expect(R2_GALLERY_BUCKETS).toEqual([GALLERY_BUCKET]);
    expect(R2_SOURCE_STORE).toBe('r2');
    expect(result.receipt.source_store).toBe('r2');
    expect(result.receipt.object_count).toBe(2);
    expect(result.manifest.every((row: any) => row.bucket === GALLERY_BUCKET)).toBe(true);
    expect(result.manifest.every((row: any) => row.db_reference === false)).toBe(true);
    expect(result.receipt.remote).toContain(`~/backups/miu-storage/${path.basename(runDir)}`);

    const raw = fs.readFileSync(path.join(runDir, 'backup-verification.json'), 'utf8');
    expect(JSON.parse(raw).source_store).toBe('r2');
  });

  it('refuses to run without injected listing, download and runner dependencies', async () => {
    await expect(runR2GalleryBackup({ outputRoot: root, resumeDir: path.join(root, 'x') })).rejects.toThrow(
      /requires listObjects/
    );
  });
});

describe('requireSupabaseSourceStore', () => {
  it('accepts a Supabase or legacy identity and rejects an R2 identity', () => {
    expect(requireSupabaseSourceStore({ sourceStore: 'supabase' })).toBeTruthy();
    expect(requireSupabaseSourceStore({})).toBeTruthy();
    expect(() => requireSupabaseSourceStore({ sourceStore: 'r2' })).toThrow(
      /requires a Supabase-source backup/
    );
  });
});

describe('cmdBackup', () => {
  it('loads config, opens db, builds adapters, runs the engine, then closes db', async () => {
    const order: string[] = [];
    const db = {
      end: async () => {
        order.push('db.end');
      },
    };
    const dbRefs = new Set(['saved-images::saved/one.png', 'saved-images::saved/two.png']);

    const result = await cmdBackup(
      { outputRoot: '/tmp/miu-root' },
      {
        loadConfig: async () => {
          order.push('config');
          return { signing: { endpoint: 'e', accessKeyId: 'a', secretAccessKey: 's' }, dbConfig: {} };
        },
        createDbClient: async () => {
          order.push('db');
          return db;
        },
        createAdapters: async () => {
          order.push('adapters');
          return { listObjects: () => [], downloadObject: () => {}, dbRefs };
        },
        runner: () => {},
        log: () => {},
        backup: async (options: any) => {
          order.push('backup');
          return { receipt: { object_count: options.dbRefs.size } };
        },
      }
    );

    expect(order).toEqual(['config', 'db', 'adapters', 'backup', 'db.end']);
    expect(result.receipt.object_count).toBe(2);
  });

  it('closes the db when the engine rejects', async () => {
    let closed = false;
    await expect(
      cmdBackup(
        {},
        {
          loadConfig: async () => ({ signing: {}, dbConfig: {} }),
          createDbClient: async () => ({
            end: async () => {
              closed = true;
            },
          }),
          createAdapters: async () => ({ listObjects: () => [], downloadObject: () => {} }),
          runner: () => {},
          log: () => {},
          backup: async () => {
            throw new Error('engine exploded');
          },
        }
      )
    ).rejects.toThrow('engine exploded');
    expect(closed).toBe(true);
  });
});

describe('parseBackupArgs', () => {
  it('rejects unknown, duplicate, missing and relative flags', () => {
    expect(() => parseBackupArgs(['--nope'])).toThrow(/unknown flag/);
    expect(() => parseBackupArgs(['--resume', '/a', '--resume', '/b'])).toThrow(/duplicate flag/);
    expect(() => parseBackupArgs(['--resume'])).toThrow(/missing value/);
    expect(() => parseBackupArgs(['--resume', 'relative/run'])).toThrow(/absolute path/);
  });

  it('accepts absolute output-root and resume paths', () => {
    expect(parseBackupArgs(['--output-root', '/tmp/root', '--resume', '/tmp/root/run'])).toEqual({
      outputRoot: '/tmp/root',
      resume: '/tmp/root/run',
    });
  });
});

describe('main', () => {
  it('rejects an invalid flag before loading config', async () => {
    let loaded = false;
    const err = { write: () => {} };
    const code = await main(
      ['backup', '--nope'],
      {
        loadConfig: async () => {
          loaded = true;
          return {};
        },
      },
      { out: { write: () => {} }, err }
    );
    expect(code).toBe(1);
    expect(loaded).toBe(false);
  });
});
