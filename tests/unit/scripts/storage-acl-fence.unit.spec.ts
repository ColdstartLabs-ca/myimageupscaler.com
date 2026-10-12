import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as fence from '../../../scripts/storage/storage-acl-fence.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  FENCE_ROLES,
  deriveFence,
  isNativeFenced,
  captureSnapshot,
  writeSnapshotFile,
  loadSnapshotFile,
  runSnapshot,
  runFreeze,
  runAllowDelete,
  runRestore,
  runStatus,
  runFenceCli,
} = fence as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

type Entry = { grantor: string; grantee: string; privilege: string; grantable: boolean };
const ALL = ['INSERT', 'SELECT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
const OWNER = 'supabase_storage_admin';

/** Production-like starting ACL: owner full, postgres grantable, API roles full. */
function originalAcl(): Entry[] {
  const out: Entry[] = [];
  for (const privilege of ALL) {
    out.push({ grantor: OWNER, grantee: OWNER, privilege, grantable: false });
    out.push({ grantor: OWNER, grantee: 'postgres', privilege, grantable: true });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      out.push({ grantor: OWNER, grantee: role, privilege, grantable: false });
    }
  }
  return out;
}

/**
 * Minimal in-memory model of `storage.objects` privileges. It understands only the
 * statements the fence tool is allowed to issue, so an unexpected statement fails.
 * A REVOKE removes only entries whose grantor is the acting role, like Postgres.
 */
function makeDb(options: { currentUser?: string; columnAcl?: unknown } = {}) {
  const currentUser = options.currentUser ?? 'postgres';
  let entries = originalAcl();
  let actor = currentUser;
  let saved: Entry[] | null = null;
  const sql: string[] = [];
  const holds = (role: string, privilege: string) =>
    entries.some(e => e.privilege === privilege && (e.grantee === role || e.grantee === 'PUBLIC'));
  const matrix = () =>
    Object.fromEntries(
      FENCE_ROLES.map((role: string) => {
        const key = role === 'PUBLIC' ? 'PUBLIC' : role;
        const has = (p: string) => (role === 'PUBLIC' ? entries.some(e => e.grantee === 'PUBLIC' && e.privilege === p) : holds(role, p));
        return [key, {
          INSERT: has('INSERT'), UPDATE: has('UPDATE'), DELETE: has('DELETE'), SELECT: has('SELECT'),
          INSERT_ANY_COLUMN: has('INSERT'), UPDATE_ANY_COLUMN: has('UPDATE'),
        }];
      })
    );
  const relacl = () => `{${entries.map(e => `${e.grantee}=${e.privilege}${e.grantable ? '*' : ''}/${e.grantor}`).join(',')}}`;
  const columns = () => [{ attnum: 1, name: 'id', acl: options.columnAcl ?? null }];
  const list = (text: string) => text.split(',').map(s => s.trim()).map(s => s.replace(/^"|"$/g, ''));

  const db = {
    endCalls: 0,
    sql,
    entries: () => entries,
    setEntries: (next: Entry[]) => { entries = next; },
    async end() { this.endCalls += 1; },
    async query(text: string) {
      sql.push(text.replace(/\s+/g, ' ').trim());
      const statement = text.trim();
      if (/^BEGIN/.test(statement)) { saved = entries.map(e => ({ ...e })); return { rows: [] }; }
      if (statement === 'COMMIT') { saved = null; return { rows: [] }; }
      if (statement === 'ROLLBACK') { if (saved) entries = saved; saved = null; actor = currentUser; return { rows: [] }; }
      if (/^SET LOCAL (lock|statement)_timeout/.test(statement)) return { rows: [] };
      const setRole = /^SET LOCAL ROLE "([a-z_]+)"$/.exec(statement);
      if (setRole) { actor = setRole[1]; return { rows: [] }; }
      if (statement === 'RESET ROLE') { actor = currentUser; return { rows: [] }; }
      const revoke = /^REVOKE ([A-Z, ]+) ON storage\.objects FROM ([A-Za-z_," ,]+)$/.exec(statement);
      if (revoke) {
        const privs = list(revoke[1]); const from = list(revoke[2]);
        entries = entries.filter(e => !(e.grantor === actor && privs.includes(e.privilege) && from.includes(e.grantee)));
        return { rows: [] };
      }
      const grant = /^GRANT ([A-Z]+) ON storage\.objects TO ([A-Za-z_"]+)( WITH GRANT OPTION)?$/.exec(statement);
      if (grant) {
        entries.push({ grantor: actor, grantee: list(grant[2])[0], privilege: grant[1], grantable: !!grant[3] });
        return { rows: [] };
      }
      if (/FROM pg_class/.test(statement)) {
        return { rows: [{ connected_as: currentUser, owner: OWNER, relacl: relacl(), acl: entries, columns: columns(), matrix: matrix() }] };
      }
      if (/has_table_privilege/.test(statement)) return { rows: [{ matrix: matrix() }] };
      throw new Error(`unexpected SQL: ${statement}`);
    },
  };
  return db;
}

function sha256(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

describe('storage-acl-fence: fence derivation', () => {
  const open = (overrides: Record<string, Record<string, boolean>> = {}) => {
    const base: any = {};
    for (const role of FENCE_ROLES) {
      base[role] = { INSERT: false, UPDATE: false, DELETE: false, SELECT: true, INSERT_ANY_COLUMN: false, UPDATE_ANY_COLUMN: false };
    }
    for (const [role, patch] of Object.entries(overrides)) Object.assign(base[role], patch);
    return base;
  };

  it('is fenced when INSERT and UPDATE are false for all four roles', () => {
    expect(deriveFence(open()).fenced).toBe(true);
    expect(FENCE_ROLES).toEqual(['PUBLIC', 'anon', 'authenticated', 'service_role']);
  });

  it.each(['PUBLIC', 'anon', 'authenticated', 'service_role'])('is not fenced when %s can INSERT', role => {
    expect(deriveFence(open({ [role]: { INSERT: true } })).fenced).toBe(false);
  });

  it.each(['PUBLIC', 'anon', 'authenticated', 'service_role'])('is not fenced when %s can UPDATE', role => {
    expect(deriveFence(open({ [role]: { UPDATE: true } })).fenced).toBe(false);
  });

  it('is not fenced when a role keeps a column-level write grant', () => {
    expect(deriveFence(open({ anon: { UPDATE_ANY_COLUMN: true } })).fenced).toBe(false);
  });

  it('allows DELETE only for service_role', () => {
    const delete_phase = deriveFence(open({ service_role: { DELETE: true } }));
    expect(delete_phase.fenced).toBe(true);
    expect(delete_phase.delete_open).toBe(true);
    expect(deriveFence(open({ authenticated: { DELETE: true } })).fenced).toBe(false);
    expect(deriveFence(open({ PUBLIC: { DELETE: true } })).fenced).toBe(false);
  });

  it('fails closed on a missing or malformed matrix', () => {
    expect(() => deriveFence(undefined)).toThrow(/matrix/);
    expect(() => deriveFence({ ...open(), anon: { INSERT: 'f' } })).toThrow(/matrix/);
    expect(isNativeFenced(null)).toBe(false);
    expect(isNativeFenced({})).toBe(false);
    expect(isNativeFenced(open())).toBe(true);
  });
});

describe('storage-acl-fence: snapshot file', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-acl-snap-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('captures grantors, column ACLs and the privilege matrix without writing', async () => {
    const db = makeDb();
    const snapshot = await captureSnapshot(db, { now: () => new Date('2026-10-12T10:00:00.000Z') });
    expect(snapshot.owner).toBe(OWNER);
    expect(snapshot.captured_at).toBe('2026-10-12T10:00:00.000Z');
    expect(snapshot.acl).toContainEqual({ grantor: OWNER, grantee: 'service_role', privilege: 'DELETE', grantable: false });
    expect(snapshot.columns).toHaveLength(1);
    expect(snapshot.matrix.anon.INSERT).toBe(true);
    expect(db.sql.every((text: string) => /^SELECT/.test(text))).toBe(true);
  });

  it('writes 0600 with wx, never overwrites, and round-trips by sha256', async () => {
    const snapshot = await captureSnapshot(makeDb(), { now: () => new Date('2026-10-12T10:00:00.000Z') });
    const file = path.join(root, 'acl.json');
    const written = await writeSnapshotFile(file, snapshot);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(written.sha256).toBe(sha256(fs.readFileSync(file, 'utf8')));
    await expect(writeSnapshotFile(file, snapshot)).rejects.toThrow(/EEXIST/);
    const loaded = await loadSnapshotFile(file);
    expect(loaded.sha256).toBe(written.sha256);
    expect(loaded.snapshot).toEqual(snapshot);
  });

  it('rejects a tampered snapshot, an unsafe role name and a symlink', async () => {
    const snapshot = await captureSnapshot(makeDb());
    const file = path.join(root, 'acl.json');
    await writeSnapshotFile(file, snapshot);
    const bad = JSON.parse(fs.readFileSync(file, 'utf8'));
    bad.acl[0].grantor = 'x"; DROP TABLE y; --';
    const badFile = path.join(root, 'bad.json');
    fs.writeFileSync(badFile, JSON.stringify(bad));
    await expect(loadSnapshotFile(badFile)).rejects.toThrow(/role/);
    const link = path.join(root, 'link.json');
    fs.symlinkSync(file, link);
    await expect(loadSnapshotFile(link)).rejects.toThrow();
    await expect(loadSnapshotFile(file, 'f'.repeat(64))).rejects.toThrow(/sha256/);
  });

  it('runSnapshot is read-only and reports the sha256', async () => {
    const db = makeDb();
    const out = path.join(root, 'out.json');
    const result = await runSnapshot({ db, out });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(db.sql.some((text: string) => /^(REVOKE|GRANT)/.test(text))).toBe(false);
  });
});

describe('storage-acl-fence: freeze, allow-delete and restore', () => {
  let root: string;
  let file: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-acl-freeze-')); file = path.join(root, 'acl.json'); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  async function snapshotOf(db: ReturnType<typeof makeDb>) {
    await writeSnapshotFile(file, await captureSnapshot(db));
  }

  it('refuses freeze without --confirm and before any backup or database work', async () => {
    const db = makeDb();
    await snapshotOf(db);
    let backups = 0;
    await expect(runFreeze({ db, snapshotPath: file, confirm: false, freshBackup: async () => { backups += 1; } })).rejects.toThrow(/--confirm/);
    expect(backups).toBe(0);
    expect(db.sql.filter((text: string) => !/^SELECT/.test(text))).toEqual([]);
  });

  it('requires the fresh verified dual backup before the REVOKE', async () => {
    const db = makeDb();
    await snapshotOf(db);
    await expect(runFreeze({ db, snapshotPath: file, confirm: true, freshBackup: async () => { throw new Error('backup failed'); } })).rejects.toThrow(/backup failed/);
    expect(db.sql.some((text: string) => /^REVOKE/.test(text))).toBe(false);
    expect(isNativeFenced((await captureSnapshot(db)).matrix)).toBe(false);
  });

  it('refuses a stale snapshot that no longer matches the live ACL', async () => {
    const db = makeDb();
    await snapshotOf(db);
    db.setEntries(db.entries().filter((e: Entry) => !(e.grantee === 'anon' && e.privilege === 'UPDATE')));
    await expect(runFreeze({ db, snapshotPath: file, confirm: true, freshBackup: async () => ({}) })).rejects.toThrow(/stale/);
    expect(db.sql.some((text: string) => /^REVOKE/.test(text))).toBe(false);
  });

  it('revokes in one short-timeout transaction and verifies all four roles', async () => {
    const db = makeDb();
    await snapshotOf(db);
    const order: string[] = [];
    const result = await runFreeze({
      db, snapshotPath: file, confirm: true,
      freshBackup: async () => { order.push('backup'); return { stem: 'b' }; },
    });
    expect(result.fenced).toBe(true);
    expect(result.matrix.service_role.INSERT).toBe(false);
    expect(result.matrix.service_role.DELETE).toBe(false);
    expect(result.matrix.anon.SELECT).toBe(true);
    const text = db.sql.join('\n');
    expect(text).toMatch(/BEGIN[\s\S]*SET LOCAL lock_timeout = '[0-9]+s'[\s\S]*REVOKE INSERT, UPDATE, DELETE ON storage\.objects FROM PUBLIC, anon, authenticated, service_role[\s\S]*COMMIT/);
    expect(text).toContain(`SET LOCAL ROLE "${OWNER}"`);
    expect(db.sql.filter((s: string) => s === 'COMMIT')).toHaveLength(1);
    expect(order).toEqual(['backup']);
  });

  it('rolls back and fails when the revoke does not remove an effective privilege', async () => {
    const db = makeDb();
    await snapshotOf(db);
    // A grant made by another role is outside the snapshot grantors and survives the REVOKE.
    const original = db.query.bind(db);
    db.query = async (text: string) => {
      const out = await original(text);
      if (/^REVOKE/.test(text.trim())) db.setEntries([...db.entries(), { grantor: 'other', grantee: 'service_role', privilege: 'UPDATE', grantable: false }]);
      return out;
    };
    await expect(runFreeze({ db, snapshotPath: file, confirm: true, freshBackup: async () => ({}) })).rejects.toThrow(/not fenced/);
    expect(db.sql).toContain('ROLLBACK');
    expect(db.entries().some((e: Entry) => e.grantee === 'anon' && e.privilege === 'INSERT')).toBe(true);
  });

  it('allow-delete grants DELETE to service_role only, after a fenced state', async () => {
    const db = makeDb();
    await snapshotOf(db);
    await expect(runAllowDelete({ db, confirm: true })).rejects.toThrow(/not fenced/);
    await runFreeze({ db, snapshotPath: file, confirm: true, freshBackup: async () => ({}) });
    await expect(runAllowDelete({ db, confirm: false })).rejects.toThrow(/--confirm/);
    const result = await runAllowDelete({ db, confirm: true });
    expect(result.fenced).toBe(true);
    expect(result.delete_open).toBe(true);
    expect(result.matrix.service_role.DELETE).toBe(true);
    expect(result.matrix.service_role.INSERT).toBe(false);
    expect(result.matrix.service_role.UPDATE).toBe(false);
    expect(result.matrix.authenticated.DELETE).toBe(false);
    expect(db.sql.filter((s: string) => /^GRANT/.test(s))).toEqual(['GRANT DELETE ON storage.objects TO service_role']);
  });

  it('restore reproduces the exact original ACL including grantors and grant options', async () => {
    const db = makeDb();
    const before = await captureSnapshot(db);
    await snapshotOf(db);
    await runFreeze({ db, snapshotPath: file, confirm: true, freshBackup: async () => ({}) });
    await runAllowDelete({ db, confirm: true });
    await expect(runRestore({ db, snapshotPath: file, confirm: false })).rejects.toThrow(/--confirm/);
    const result = await runRestore({ db, snapshotPath: file, confirm: true });
    expect(result.restored).toBe(true);
    const after = await captureSnapshot(db);
    expect(after.acl).toEqual(before.acl);
    expect(after.columns).toEqual(before.columns);
    expect(after.matrix).toEqual(before.matrix);
    expect(after.matrix.anon.INSERT).toBe(true);
  });

  it('restore fails loudly and rolls back when a column ACL differs from the snapshot', async () => {
    const db = makeDb();
    await snapshotOf(db);
    const drifted = makeDb({ columnAcl: '{anon=w/supabase_storage_admin}' });
    drifted.setEntries(db.entries());
    await expect(runRestore({ db: drifted, snapshotPath: file, confirm: true })).rejects.toThrow(/column/i);
    expect(drifted.sql).toContain('ROLLBACK');
  });

  it('restore fails when the restored ACL differs from the snapshot', async () => {
    const db = makeDb();
    await snapshotOf(db);
    await runFreeze({ db, snapshotPath: file, confirm: true, freshBackup: async () => ({}) });
    const original = db.query.bind(db);
    db.query = async (text: string) => {
      if (/^GRANT UPDATE ON storage\.objects TO anon/.test(text.trim())) return { rows: [] };
      return original(text);
    };
    await expect(runRestore({ db, snapshotPath: file, confirm: true })).rejects.toThrow(/does not match the snapshot/);
    expect(db.sql).toContain('ROLLBACK');
  });

  it('status is read-only and derives fenced', async () => {
    const db = makeDb();
    expect((await runStatus({ db })).fenced).toBe(false);
    await snapshotOf(db);
    await runFreeze({ db, snapshotPath: file, confirm: true, freshBackup: async () => ({}) });
    const before = db.sql.length;
    const status = await runStatus({ db });
    expect(status.fenced).toBe(true);
    expect(db.sql.slice(before).every((s: string) => /^SELECT/.test(s))).toBe(true);
  });
});

describe('storage-acl-fence: CLI', () => {
  it('refuses mutating commands without --confirm before reading credentials', async () => {
    let loaded = 0;
    const deps = { config: undefined, loadConfig: () => { loaded += 1; return {}; }, createDb: async () => makeDb() };
    for (const argv of [['freeze', '--snapshot', 'x'], ['allow-delete'], ['restore', '--snapshot', 'x']]) {
      await expect(runFenceCli(argv, deps)).rejects.toThrow(/--confirm/);
    }
    expect(loaded).toBe(0);
  });

  it('rejects unknown flags and missing values', async () => {
    const deps = { loadConfig: () => ({ dbConfig: {} }), createDb: async () => makeDb() };
    await expect(runFenceCli(['status', '--bogus'], deps)).rejects.toThrow(/Unknown flag/);
    await expect(runFenceCli(['freeze', '--confirm', '--snapshot'], deps)).rejects.toThrow(/Missing value/);
    await expect(runFenceCli(['freeze', '--confirm'], deps)).rejects.toThrow(/--snapshot/);
  });

  it('closes the database after a command', async () => {
    const db = makeDb();
    const lines: string[] = [];
    await runFenceCli(['status'], { loadConfig: () => ({ dbConfig: {} }), createDb: async () => db, log: (l: string) => lines.push(l) });
    expect(db.endCalls).toBe(1);
    expect(lines.join('\n')).toContain('fenced=false');
  });
});

/**
 * Real PostgreSQL 17 proof of the SQL itself (aclexplode, has_table_privilege('public'),
 * SET LOCAL ROLE per grantor, exact restore). Local disposable container only.
 */
const dockerAvailable = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

describe.runIf(dockerAvailable)('storage-acl-fence: real PostgreSQL 17', () => {
  const containerName = `miu-acl-fence-${crypto.randomUUID()}`;
  let client: any;
  let root: string;

  beforeAll(async () => {
    const { Client } = await import('pg');
    execFileSync('docker', ['run', '--rm', '-d', '--name', containerName, '-e', 'POSTGRES_PASSWORD=test', '-P', 'public.ecr.aws/supabase/postgres:17.6.1.052']);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const health = spawnSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', containerName], { encoding: 'utf8' }).stdout.trim();
      if (health === 'healthy') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const mapping = execFileSync('docker', ['port', containerName, '5432/tcp'], { encoding: 'utf8' }).trim();
    const connectionString = `postgresql://supabase_admin:test@127.0.0.1:${mapping.split(':').at(-1)}/postgres`;
    for (let attempt = 0; attempt < 60 && !client; attempt += 1) {
      const candidate = new Client({ connectionString });
      try { await candidate.connect(); client = candidate; } catch { await candidate.end().catch(() => undefined); await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!client) throw new Error('PostgreSQL test connection failed');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-acl-pg-'));
  }, 240_000);

  afterAll(async () => {
    await client?.end().catch(() => undefined);
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  async function resetTable(extra = '') {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS storage;
      DROP TABLE IF EXISTS storage.objects;
      CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text, name text);
      ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
      GRANT ALL ON storage.objects TO postgres, anon, authenticated, service_role;
      GRANT INSERT ON storage.objects TO PUBLIC;
      ${extra}`);
  }

  it('freezes, opens DELETE for service_role only, and restores the exact raw ACL', async () => {
    await resetTable();
    const before = await captureSnapshot(client);
    expect(before.matrix.PUBLIC.INSERT).toBe(true);
    const file = path.join(root, 'case1.json');
    await writeSnapshotFile(file, before);

    const frozen = await runFreeze({ db: client, snapshotPath: file, confirm: true, freshBackup: async () => ({}) });
    expect(frozen.fenced).toBe(true);
    expect(frozen.matrix.PUBLIC.INSERT).toBe(false);
    expect(frozen.matrix.service_role.UPDATE).toBe(false);
    expect(frozen.matrix.anon.SELECT).toBe(true);

    const open = await runAllowDelete({ db: client, confirm: true });
    expect(open.delete_open).toBe(true);
    expect(open.matrix.authenticated.DELETE).toBe(false);
    expect(open.matrix.service_role.INSERT).toBe(false);

    const restored = await runRestore({ db: client, snapshotPath: file, confirm: true });
    expect(restored.relacl_text_equal).toBe(true);
    const after = await captureSnapshot(client);
    expect(after.relacl).toBe(before.relacl);
    expect(after.acl).toEqual(before.acl);
    expect(after.matrix).toEqual(before.matrix);
  }, 60_000);

  it('refuses to freeze when a column-level grant exists, because the REVOKE would drop it', async () => {
    await resetTable('GRANT UPDATE (name) ON storage.objects TO authenticated;');
    const before = await captureSnapshot(client);
    expect(before.matrix.authenticated.UPDATE_ANY_COLUMN).toBe(true);
    expect(before.columns.some((column: any) => column.acl !== null)).toBe(true);
    const file = path.join(root, 'case2.json');
    await writeSnapshotFile(file, before);
    let backups = 0;
    await expect(runFreeze({ db: client, snapshotPath: file, confirm: true, freshBackup: async () => { backups += 1; } })).rejects.toThrow(/Column-level ACLs/);
    expect(backups).toBe(0);
    const after = await captureSnapshot(client);
    expect(after.relacl).toBe(before.relacl);
    expect(after.columns).toEqual(before.columns);
  }, 60_000);

  it('reports a missing role as an unfenced, malformed matrix instead of throwing in SQL', async () => {
    const { rows } = await client.query(`SELECT ${fence.FENCE_MATRIX_SQL.replace(/'anon', 'anon'/, "'no_such_role', 'anon'")} AS matrix`);
    expect(isNativeFenced(rows[0].matrix)).toBe(false);
  });
});
