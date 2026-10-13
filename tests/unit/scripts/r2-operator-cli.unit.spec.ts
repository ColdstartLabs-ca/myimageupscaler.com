import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as migration from '../../../scripts/storage/migrate-r2.mjs';
import * as verifyReferences from '../../../scripts/storage/verify-r2-references.mjs';
import * as referenceApply from '../../../scripts/storage/r2-reference-apply.mjs';
import { loadBackupIdentity } from '../../../scripts/storage/backup-verification.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const { runMigrateCopyCommand, runMigrateCli, parseMigrateFlags } = migration as any;
const {
  runVerifyReferencesCommand,
  runApplyReferencesCommand,
  runVerifyReferencesCli,
  parseReferenceFlags,
  writeReferencePlan,
  PLAN_FILE,
} = verifyReferences as any;
const { runReferenceApply } = referenceApply as any;

const RUN_ID = 'backup-run-2026-10-13';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SAVED_ID = '22222222-2222-4222-8222-222222222222';
const SAVED_PATH = `${USER_ID}/${SAVED_ID}.png`;
const CREATED = '2026-10-01T00:00:00.123456+00:00';
const PUBLIC_BASE = 'https://assets.myimageupscaler.com';
const SIGNING = {
  endpoint: 'https://x.r2.cloudflarestorage.com',
  accessKeyId: 'a',
  secretAccessKey: 'b',
};
const CONFIG = { signing: SIGNING, dbConfig: {} };

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** A db stub that records every SQL string and counts closes. */
function makeDb() {
  const queries: Array<{ sql: string; params?: any[] }> = [];
  const db: any = {
    endCalls: 0,
    query: async (sql: string, params?: any[]) => {
      queries.push({ sql, params });
      if (sql.includes('saved_rows'))
        return {
          rows: [
            {
              saved_rows: [{ id: 's1' }],
              blog_rows: [{ id: 'b1' }],
              post_rows: [{ id: 'p1' }],
              source_rows: [],
              isolation: 'read committed',
            },
          ],
        };
      if (sql.includes('saved_images')) return { rows: [{ row: { id: 's1' } }], rowCount: 1 };
      if (sql.includes('blog_images')) return { rows: [{ row: { id: 'b1' } }], rowCount: 1 };
      return { rows: [{ row: { id: 'p1' } }], rowCount: 1 };
    },
    end: async () => {
      db.endCalls += 1;
    },
  };
  return { db, queries };
}

function writeBackupRun(root: string): string {
  const runDir = path.join(root, RUN_ID);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const row = {
    bucket: 'saved-images',
    path: SAVED_PATH,
    bytes: 11,
    sha256: 'a'.repeat(64),
    created_at: CREATED,
    updated_at: CREATED,
  };
  const rawManifest = `${JSON.stringify(row)}\n`;
  const rawChecksum = `${row.sha256}  ${row.bucket}/${row.path}\n`;
  fs.writeFileSync(path.join(runDir, 'manifest.jsonl'), rawManifest);
  fs.writeFileSync(path.join(runDir, 'manifest.sha256'), rawChecksum);
  fs.writeFileSync(
    path.join(runDir, 'backup-verification.json'),
    JSON.stringify({
      run_id: RUN_ID,
      object_count: 1,
      total_bytes: 11,
      manifest_sha256: sha256(rawManifest),
      checksum_list_sha256: sha256(rawChecksum),
      verified_at: CREATED,
    })
  );
  return runDir;
}

function makePlan(identity: any): any {
  const before = {
    id: SAVED_ID,
    user_id: USER_ID,
    storage_path: SAVED_PATH,
    storage_backend: 'supabase',
    original_filename: 'a.png',
    file_size_bytes: 11,
    created_at: CREATED,
    updated_at: CREATED,
  };
  return {
    run_id: RUN_ID,
    manifest_sha256: identity.manifestSha256,
    manifest_object_count: identity.objectCount,
    manifest_total_bytes: identity.totalBytes,
    public_base: PUBLIC_BASE,
    gallery: [
      {
        table: 'saved_images',
        id: SAVED_ID,
        user_id: USER_ID,
        path: SAVED_PATH,
        target_bucket: 'miu-private',
        target_key: `saved/${SAVED_PATH}`,
        before,
        after: { ...before, storage_backend: 'r2' },
      },
    ],
    blog: [],
  };
}

describe('r2-operator-cli: migrate copy', () => {
  it('rejects copy without --confirm before any loader or engine runs', async () => {
    let loaded = 0;
    let copied = 0;
    await expect(
      runMigrateCopyCommand({
        manifest: '/x',
        confirm: false,
        config: CONFIG,
        runner: () => '',
        loadPlan: async () => {
          loaded += 1;
          return {};
        },
        copy: async () => {
          copied += 1;
        },
      })
    ).rejects.toThrow(/--confirm/);
    expect(loaded).toBe(0);
    expect(copied).toBe(0);
  });

  it('rejects a non-Supabase source before any copy', async () => {
    let copied = 0;
    await expect(
      runMigrateCopyCommand({
        manifest: '/x',
        confirm: true,
        config: CONFIG,
        runner: () => '',
        loadPlan: async () => ({ identity: { sourceStore: 'r2', runDir: '/x' }, plan: {} }),
        copy: async () => {
          copied += 1;
        },
      })
    ).rejects.toThrow(/Supabase source/);
    expect(copied).toBe(0);
  });

  it('binds the frozen plan and signing config to the copy engine', async () => {
    const identity = { sourceStore: 'supabase', runDir: '/x' };
    const plan = { frozen: true };
    let captured: any;
    const result = await runMigrateCopyCommand({
      manifest: '/x',
      confirm: true,
      config: CONFIG,
      runner: () => '',
      loadPlan: async (args: any) => {
        expect(args.backupRunDir).toBe('/x');
        return { identity, plan };
      },
      copy: async (args: any) => {
        captured = args;
        return { receipt: { object_count: 1 } };
      },
    });
    expect(captured.identity).toBe(identity);
    expect(captured.plan).toBe(plan);
    expect(captured.signing).toBe(SIGNING);
    expect(captured.runDir).toBe('/x');
    expect(result.receipt.object_count).toBe(1);
  });

  it('requires --confirm on the copy subcommand before reading credentials', async () => {
    await expect(runMigrateCli(['copy'])).rejects.toThrow(/--confirm/);
  });

  it('parses migrate flags strictly', () => {
    expect(parseMigrateFlags(['--manifest', 'x', '--confirm'])).toEqual({
      manifest: 'x',
      confirm: true,
    });
    expect(() => parseMigrateFlags(['--bogus'])).toThrow(/Unknown flag/);
    expect(() => parseMigrateFlags(['--manifest'])).toThrow(/Missing value/);
    expect(() => parseMigrateFlags(['--confirm', '--confirm'])).toThrow(/Duplicate/);
  });
});

describe('r2-operator-cli: verify command', () => {
  it('selects full native rows via to_jsonb and closes the database', async () => {
    const { db, queries } = makeDb();
    let captured: any;
    let written: any;
    const result = await runVerifyReferencesCommand({
      manifest: '/x',
      config: CONFIG,
      createDb: async () => db,
      runner: () => '',
      loadIdentity: async () => ({ sourceStore: 'supabase', runDir: '/x' }),
      engine: async (args: any) => {
        captured = args;
        return {
          ok: true,
          missing_count: 0,
          reference_count: 1,
          verified_count: 1,
          target_count: 1,
          plan: { gallery: [], blog: [] },
          plan_sha256: 'a'.repeat(64),
        };
      },
      writePlan: async (...args: any[]) => {
        written = args;
        return { planPath: '/x/plan.json', digest: 'a'.repeat(64) };
      },
    });

    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toBe(queries[1].sql);
    expect(queries[0].sql).toContain('storage.objects');
    expect(captured.savedRows).toEqual([{ id: 's1' }]);
    expect(captured.blogRows).toEqual([{ id: 'b1' }]);
    expect(captured.postRows).toEqual([{ id: 'p1' }]);
    expect(captured.signing).toBe(SIGNING);
    expect(db.endCalls).toBe(1);
    expect(written[0]).toBe('/x');
    expect(result.result.ok).toBe(true);
  });

  it.each(['savedRows', 'blogRows', 'postRows', 'sourceRows'])(
    'refuses concurrent %s drift before publishing a plan',
    async field => {
      let loads = 0;
      let writes = 0;
      const { db } = makeDb();
      await expect(
        runVerifyReferencesCommand({
          manifest: '/x',
          config: CONFIG,
          createDb: async () => db,
          runner: () => '',
          loadIdentity: async () => ({ sourceStore: 'supabase', runDir: '/x' }),
          loadRows: async () => {
            const rows = { savedRows: [], blogRows: [], postRows: [], sourceRows: [] } as any;
            if (loads++ > 0) rows[field] = [{ id: 'new-or-changed' }];
            return rows;
          },
          engine: async () => ({ ok: true, missing_count: 0, plan: {} }),
          writePlan: async () => {
            writes++;
            return {};
          },
        })
      ).rejects.toThrow(/snapshot changed/);
      expect(writes).toBe(0);
      expect(db.endCalls).toBe(1);
    }
  );

  it('writes no plan and throws with missing ids when a reference is missing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-opverify-'));
    const runDir = path.join(root, RUN_ID);
    fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
    const { db } = makeDb();
    try {
      await expect(
        runVerifyReferencesCommand({
          manifest: runDir,
          config: CONFIG,
          createDb: async () => db,
          runner: () => '',
          loadIdentity: async () => ({ sourceStore: 'supabase', runDir }),
          engine: async () => ({
            ok: false,
            missing_count: 1,
            reference_count: 1,
            verified_count: 0,
            target_count: 0,
            missing: [{ sourceId: 'saved_images:s9', reason: 'missing_manifest' }],
            plan: { gallery: [], blog: [] },
            plan_sha256: 'a'.repeat(64),
          }),
          writePlan: writeReferencePlan,
        })
      ).rejects.toThrow(/saved_images:s9:missing_manifest/);
      expect(fs.existsSync(path.join(runDir, PLAN_FILE))).toBe(false);
      expect(db.endCalls).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a non-Supabase source before opening a database', async () => {
    let created = 0;
    await expect(
      runVerifyReferencesCommand({
        manifest: '/x',
        config: CONFIG,
        createDb: async () => {
          created += 1;
          return {};
        },
        runner: () => '',
        loadIdentity: async () => ({ sourceStore: 'r2', runDir: '/x' }),
        engine: async () => {
          throw new Error('should not run');
        },
        writePlan: async () => ({}),
      })
    ).rejects.toThrow(/Supabase source/);
    expect(created).toBe(0);
  });

  it('closes the database even when the verify engine throws', async () => {
    const { db } = makeDb();
    await expect(
      runVerifyReferencesCommand({
        manifest: '/x',
        config: CONFIG,
        createDb: async () => db,
        runner: () => '',
        loadIdentity: async () => ({ sourceStore: 'supabase', runDir: '/x' }),
        engine: async () => {
          throw new Error('closure boom');
        },
        writePlan: async () => ({}),
      })
    ).rejects.toThrow(/closure boom/);
    expect(db.endCalls).toBe(1);
  });

  it('parses reference flags strictly and refuses malformed flags before secrets', async () => {
    expect(
      parseReferenceFlags(['--manifest', 'x', '--plan', 'p', '--digest', 'd', '--confirm'])
    ).toEqual({ confirm: true, manifest: 'x', plan: 'p', digest: 'd' });
    expect(() => parseReferenceFlags(['--bogus'])).toThrow(/Unknown flag/);
    expect(() => parseReferenceFlags(['--manifest'])).toThrow(/Missing value/);
    expect(() => parseReferenceFlags(['--confirm', '--confirm'])).toThrow(/Duplicate/);

    await expect(runVerifyReferencesCli(['verify', '--bogus'])).rejects.toThrow(/Unknown flag/);
    await expect(runVerifyReferencesCli(['verify', '--manifest'])).rejects.toThrow(/Missing value/);
    await expect(runVerifyReferencesCli(['apply', '--manifest', 'a'])).rejects.toThrow(/--confirm/);
  });
});

describe('r2-operator-cli: apply command', () => {
  let root: string;
  let runDir: string;
  let identity: any;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-opapply-'));
    runDir = writeBackupRun(root);
    identity = await loadBackupIdentity(runDir);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('rejects apply current verification drift before backup or mutation', async () => {
    const { db, queries } = makeDb();
    let loads = 0;
    let backups = 0;
    await expect(
      runApplyReferencesCommand({
        manifest: runDir,
        confirm: true,
        config: CONFIG,
        createDb: async () => db,
        runner: () => '',
        loadRows: async () => ({
          savedRows: [{ id: SAVED_ID, revision: loads++ }],
          blogRows: [],
          postRows: [],
          sourceRows: [],
        }),
        engine: async () => ({ ok: true, source_native_fenced: true }),
        apply: async ({ verifyCurrent }: any) => {
          await verifyCurrent();
          throw new Error('must not reach apply effects');
        },
        freshBackup: async () => {
          backups++;
        },
        resolveCheckoutRoot: async () => root,
      })
    ).rejects.toThrow(/snapshot changed/);
    expect(backups).toBe(0);
    expect(queries).toHaveLength(0);
    expect(db.endCalls).toBe(1);
  });

  it('proves the fresh database backup before any UPDATE and closes the database', async () => {
    const plan = makePlan(identity);
    const rawSha256 = sha256(JSON.stringify(plan));
    await writeReferencePlan(runDir, plan);

    const { db, queries } = makeDb();
    let backupCalls = 0;
    await expect(
      runApplyReferencesCommand({
        manifest: runDir,
        confirm: true,
        config: CONFIG,
        createDb: async () => db,
        runner: () => '',
        loadIdentity: loadBackupIdentity,
        engine: async () => ({
          ok: true,
          missing_count: 0,
          source_etag_unbound: 0,
          source_native_fenced: true,
          plan,
          plan_sha256: rawSha256,
        }),
        apply: runReferenceApply,
        freshBackup: async () => {
          backupCalls += 1;
          throw new Error('backup failed');
        },
        resolveCheckoutRoot: async () => root,
      })
    ).rejects.toThrow(/backup failed/);
    expect(backupCalls).toBe(1);
    expect(queries.some(q => q.sql.startsWith('UPDATE'))).toBe(false);
    expect(db.endCalls).toBe(1);
  });

  it('hands the apply engine a fence check that reads the live bucket state on the apply connection', async () => {
    const { db } = makeDb();
    const state = (limit: number | null) => ({
      buckets: Object.fromEntries(
        ['saved-images', 'blog-images', 'upscale-inputs'].map(id => [
          id,
          {
            public: false,
            file_size_limit: limit,
            allowed_mime_types: ['application/x-miu-storage-frozen'],
          },
        ])
      ),
      policies: [],
    });
    const states = [state(1), state(null)];
    const seen: unknown[] = [];
    await runApplyReferencesCommand({
      manifest: runDir,
      confirm: true,
      config: CONFIG,
      createDb: async () => db,
      runner: () => '',
      readFence: async (connection: unknown) => {
        seen.push(connection);
        return states.shift();
      },
      apply: async ({ checkFence, db: applyDb }: any) => {
        expect(applyDb).toBe(db);
        expect(await checkFence()).toBe(true);
        expect(await checkFence()).toBe(false);
        return { applied: { total: 0 } };
      },
      freshBackup: async () => {},
      resolveCheckoutRoot: async () => root,
    });
    expect(seen).toEqual([db, db]);
  });

  it('gives the database backup gate a runner without the 2-minute timeout', async () => {
    const { db } = makeDb();
    const seen: unknown[] = [];
    await runApplyReferencesCommand({
      manifest: runDir,
      confirm: true,
      config: CONFIG,
      createDb: async () => db,
      runner: (_command: string, _args: string[], options: unknown) => {
        seen.push(options);
        return '';
      },
      apply: async ({ verifyFreshDatabaseBackup }: any) => {
        await verifyFreshDatabaseBackup();
        return { applied: { total: 0 } };
      },
      freshBackup: async ({ runner }: any) => {
        runner('yarn', ['db:backup'], { cwd: '/x' });
      },
      resolveCheckoutRoot: async () => root,
    });
    expect(seen).toEqual([{ timeoutMs: 3_600_000, cwd: '/x' }]);
  });

  it('rejects apply without --confirm before any database or secret work', async () => {
    let created = 0;
    await expect(
      runApplyReferencesCommand({
        manifest: '/x',
        confirm: false,
        config: CONFIG,
        createDb: async () => {
          created += 1;
          return {};
        },
        runner: () => '',
      })
    ).rejects.toThrow(/--confirm/);
    expect(created).toBe(0);
  });

  it('rejects a non-Supabase source before any database work', async () => {
    let created = 0;
    await expect(
      runApplyReferencesCommand({
        manifest: '/x',
        confirm: true,
        config: CONFIG,
        createDb: async () => {
          created += 1;
          return {};
        },
        runner: () => '',
        loadIdentity: async () => ({ sourceStore: 'r2', runDir: '/x' }),
        apply: async () => ({}),
        freshBackup: async () => ({}),
        resolveCheckoutRoot: async () => '/x',
      })
    ).rejects.toThrow(/Supabase source/);
    expect(created).toBe(0);
  });
});
