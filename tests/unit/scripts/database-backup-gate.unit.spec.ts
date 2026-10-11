import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as gateModule from '../../../scripts/storage/database-backup-gate.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const { verifyFreshDatabaseBackup, resolvePrimaryCheckoutRoot, DEFAULT_LAPTOP } = gateModule as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const STEM = '2026-10-13_12-00-00';
const SCHEMA_NAME = `backup_${STEM}.schema.sql.gz`;
const DATA_NAME = `backup_${STEM}.data.sql.gz`;
const NOW_ISO = '2026-10-13T12:00:00.000Z';

function sha256(value: Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('verifyFreshDatabaseBackup', () => {
  let root: string;
  let backupsDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-db-gate-'));
    backupsDir = path.join(root, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeBackup(name: string, content: string): string {
    const target = path.join(backupsDir, name);
    fs.writeFileSync(target, content);
    return target;
  }

  function writeFreshPair() {
    writeBackup(SCHEMA_NAME, 'schema bytes');
    writeBackup(DATA_NAME, 'data bytes');
  }

  function makeRunner(options: Record<string, any> = {}) {
    const calls: Array<{ command: string; args: string[]; options: any }> = [];
    const runner: any = async (command: string, args: string[], callOptions: any = {}) => {
      calls.push({ command, args, options: callOptions });
      if (command === 'git') return options.gitCommonDir ?? `${root}/.git\n`;
      if (command === 'yarn' && args[0] === 'db:backup') {
        options.onBackup?.();
        return '';
      }
      if (command === 'gzip') {
        if (options.gzipMode === 'throw') throw new Error('gzip -t failed');
        return '';
      }
      if (command === 'ssh') {
        const script = args[1] ?? '';
        if (script.includes('sha256sum -c -')) {
          if (options.remoteMode === 'throw') throw new Error('remote down');
          if (options.remoteMode === 'failed') return `${SCHEMA_NAME}: FAILED\n`;
          if (options.remoteMode === 'empty') return '';
          return String(callOptions.input ?? '')
            .split('\n')
            .filter(Boolean)
            .map((line: string) => `${line.replace(/^[0-9a-f]{64} {2}/, '')}: OK`)
            .join('\n');
        }
        return '';
      }
      return '';
    };
    runner.calls = calls;
    return runner;
  }

  it('discovers exactly the new pair, verifies both, and copies it to the laptop', async () => {
    const runner = makeRunner({ onBackup: writeFreshPair });
    const result = await verifyFreshDatabaseBackup({
      repoRoot: root,
      runner,
      now: () => new Date(NOW_ISO),
    });

    expect(result.stem).toBe(STEM);
    expect(result.schemaPath).toBe(path.join(backupsDir, SCHEMA_NAME));
    expect(result.dataPath).toBe(path.join(backupsDir, DATA_NAME));
    expect(result.schemaSha256).toBe(sha256(fs.readFileSync(path.join(backupsDir, SCHEMA_NAME))));
    expect(result.dataSha256).toBe(sha256(fs.readFileSync(path.join(backupsDir, DATA_NAME))));
    expect(result.remoteDir).toBe(`~/backups/miu-db/${STEM}`);
    expect(result.verifiedAt).toBe(NOW_ISO);

    const commands = runner.calls.map((c: any) => `${c.command} ${c.args.join(' ')}`);
    expect(commands).toContain('yarn db:backup');
    expect(commands).toContain('yarn db:backups');
    expect(commands.filter((c: string) => c.startsWith('gzip -t --'))).toHaveLength(2);
    expect(
      commands.some((c: string) =>
        c.includes(`rsync -a -- ${result.schemaPath} ${DEFAULT_LAPTOP}:~/backups/miu-db/${STEM}/`)
      )
    ).toBe(true);
    expect(
      commands.some((c: string) =>
        c.includes(`rsync -a -- ${result.dataPath} ${DEFAULT_LAPTOP}:~/backups/miu-db/${STEM}/`)
      )
    ).toBe(true);

    const check = runner.calls.find(
      (c: any) => c.command === 'ssh' && c.args[1].includes('sha256sum -c -')
    );
    expect(check.options.input).toBe(
      `${result.schemaSha256}  ${SCHEMA_NAME}\n${result.dataSha256}  ${DATA_NAME}\n`
    );
  });

  it('ignores a pre-existing pair and selects only the new one', async () => {
    writeBackup('backup_2026-10-12_00-00-00.schema.sql.gz', 'old schema');
    writeBackup('backup_2026-10-12_00-00-00.data.sql.gz', 'old data');
    const runner = makeRunner({ onBackup: writeFreshPair });
    const result = await verifyFreshDatabaseBackup({ repoRoot: root, runner });
    expect(result.stem).toBe(STEM);
  });

  it('fails when the backup produces no new pair', async () => {
    const runner = makeRunner();
    await expect(verifyFreshDatabaseBackup({ repoRoot: root, runner })).rejects.toThrow(
      /exactly one new backup pair/
    );
  });

  it('fails when only one half of the new pair appears', async () => {
    const runner = makeRunner({ onBackup: () => writeBackup(SCHEMA_NAME, 'schema bytes') });
    await expect(verifyFreshDatabaseBackup({ repoRoot: root, runner })).rejects.toThrow(
      /incomplete/
    );
  });

  it('fails on an unexpected new backup file', async () => {
    const runner = makeRunner({
      onBackup: () => {
        writeFreshPair();
        writeBackup('notes.txt', 'not a backup');
      },
    });
    await expect(verifyFreshDatabaseBackup({ repoRoot: root, runner })).rejects.toThrow(
      /Unexpected new backup file/
    );
  });

  it('does not accept a pair that reuses an existing file', async () => {
    writeBackup(SCHEMA_NAME, 'old schema');
    const runner = makeRunner({ onBackup: () => writeBackup(DATA_NAME, 'data bytes') });
    await expect(verifyFreshDatabaseBackup({ repoRoot: root, runner })).rejects.toThrow(
      /incomplete/
    );
  });

  it('rejects a symlinked archive', async () => {
    const runner = makeRunner({
      onBackup: () => {
        writeBackup(SCHEMA_NAME, 'schema bytes');
        fs.symlinkSync(path.join(backupsDir, SCHEMA_NAME), path.join(backupsDir, DATA_NAME));
      },
    });
    await expect(verifyFreshDatabaseBackup({ repoRoot: root, runner })).rejects.toThrow(/symlink/);
  });

  it('fails when the local gzip -t rejects an archive', async () => {
    const runner = makeRunner({ onBackup: writeFreshPair, gzipMode: 'throw' });
    await expect(verifyFreshDatabaseBackup({ repoRoot: root, runner })).rejects.toThrow(
      /gzip -t failed/
    );
  });

  it('fails when the laptop checksum proof fails', async () => {
    const runner = makeRunner({ onBackup: writeFreshPair, remoteMode: 'failed' });
    await expect(verifyFreshDatabaseBackup({ repoRoot: root, runner })).rejects.toThrow(
      /checksum verification failed/
    );
  });

  it('fails when the laptop proof is incomplete', async () => {
    const runner = makeRunner({ onBackup: writeFreshPair, remoteMode: 'empty' });
    await expect(verifyFreshDatabaseBackup({ repoRoot: root, runner })).rejects.toThrow(
      /proof incomplete/
    );
  });

  it('fails when the laptop connection throws', async () => {
    const runner = makeRunner({ onBackup: writeFreshPair, remoteMode: 'throw' });
    await expect(verifyFreshDatabaseBackup({ repoRoot: root, runner })).rejects.toThrow(
      /remote down/
    );
  });

  it('resolves the primary owning checkout when no repoRoot is given', async () => {
    const runner = makeRunner({ onBackup: writeFreshPair });
    const result = await verifyFreshDatabaseBackup({ runner });
    expect(result.stem).toBe(STEM);
  });
});

describe('resolvePrimaryCheckoutRoot', () => {
  it('resolves the primary checkout from the git common dir', async () => {
    const runner: any = async () => '/repo/primary/.git\n';
    expect(await resolvePrimaryCheckoutRoot({ runner })).toBe('/repo/primary');
  });

  it('rejects a common dir that is not a .git directory', async () => {
    const runner: any = async () => '/repo/primary\n';
    await expect(resolvePrimaryCheckoutRoot({ runner })).rejects.toThrow(/Not a valid git root/);
  });

  it('rejects an empty git common dir', async () => {
    const runner: any = async () => '';
    await expect(resolvePrimaryCheckoutRoot({ runner })).rejects.toThrow(/returned nothing/);
  });
});
