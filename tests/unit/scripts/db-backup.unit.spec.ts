import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const script = path.resolve(process.cwd(), 'scripts/db-backup.sh');

function runBackupScript(args: string[], backupsDir: string): string {
  return execFileSync('bash', [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, BACKUPS_DIR: backupsDir, NO_COLOR: '1' },
    encoding: 'utf8',
  });
}

describe('db-backup compressed retention', () => {
  it('compresses retained raw backups only after test-extracting and comparing them', () => {
    const backupsDir = mkdtempSync(path.join(tmpdir(), 'db-backup-'));
    const rawPath = path.join(backupsDir, 'backup_2026-07-16_10-34-09.data.sql');
    const contents = 'COPY public.example FROM stdin;\n1\tone\n\\.\n';
    writeFileSync(rawPath, contents);

    const output = runBackupScript(['compress-existing'], backupsDir);

    expect(output).toContain('verified by test extraction');
    expect(existsSync(rawPath)).toBe(false);
    expect(existsSync(`${rawPath}.gz`)).toBe(true);
    expect(statSync(`${rawPath}.gz`).mode & 0o777).toBe(0o600);
    expect(execFileSync('gzip', ['-dc', `${rawPath}.gz`], { encoding: 'utf8' })).toBe(contents);
  });

  it('removes the one-time restore extraction after successful use', () => {
    const backupsDir = mkdtempSync(path.join(tmpdir(), 'db-backup-'));
    const rawPath = path.join(backupsDir, 'backup_2026-07-16_10-34-09.sql');
    writeFileSync(rawPath, 'SELECT 1;\n');
    execFileSync('gzip', ['-1', rawPath]);
    const archive = `${rawPath}.gz`;

    const output = execFileSync(
      'bash',
      [
        '-c',
        'source "$1"; prepare_backup_for_restore "$2"; extracted="$RESTORE_FILEPATH"; temp_dir="$RESTORE_TEMP_DIR"; test -f "$extracted"; cleanup_restore_temp_dir; test ! -e "$temp_dir"; printf cleaned',
        'db-backup-test',
        script,
        archive,
      ],
      { encoding: 'utf8' }
    );

    expect(output).toContain('cleaned');
  });

  it('removes the restore temp directory when extraction fails', () => {
    const backupsDir = mkdtempSync(path.join(tmpdir(), 'db-backup-'));
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'db-backup-tmp-'));
    const binDir = mkdtempSync(path.join(tmpdir(), 'db-backup-bin-'));
    const archive = path.join(backupsDir, 'backup_2026-07-16_10-34-09.sql.gz');
    const fakeGzip = path.join(binDir, 'gzip');
    writeFileSync(archive, 'archive-placeholder');
    writeFileSync(fakeGzip, '#!/bin/bash\n[[ "$1" == "-t" ]] && exit 0\nexit 1\n');
    chmodSync(fakeGzip, 0o700);

    expect(() =>
      execFileSync(
        'bash',
        ['-c', 'source "$1"; prepare_backup_for_restore "$2"', 'db-backup-test', script, archive],
        {
          env: { ...process.env, TMPDIR: tempRoot, PATH: `${binDir}:${process.env.PATH}` },
          stdio: 'pipe',
        }
      )
    ).toThrow();
    expect(execFileSync('find', [tempRoot, '-mindepth', '1', '-print'], { encoding: 'utf8' })).toBe(
      ''
    );
  });

  it('lists compressed backups and ignores unrelated files', () => {
    const backupsDir = mkdtempSync(path.join(tmpdir(), 'db-backup-'));
    const archive = path.join(backupsDir, 'backup_2026-07-16_10-34-09.schema.sql.gz');
    writeFileSync(archive, 'archive-placeholder');
    writeFileSync(path.join(backupsDir, 'notes.txt'), 'not a backup');

    const output = runBackupScript(['list'], backupsDir);

    expect(output).toContain(path.basename(archive));
    expect(output).not.toContain('notes.txt');
  });

  it('keeps compressed schema and data files together as one retention set', () => {
    const backupsDir = mkdtempSync(path.join(tmpdir(), 'db-backup-'));
    for (const timestamp of ['10-00-00', '11-00-00']) {
      writeFileSync(
        path.join(backupsDir, `backup_2026-07-16_${timestamp}.schema.sql.gz`),
        'schema'
      );
      writeFileSync(path.join(backupsDir, `backup_2026-07-16_${timestamp}.data.sql.gz`), 'data');
    }

    runBackupScript(['cleanup', '1'], backupsDir);

    expect(existsSync(path.join(backupsDir, 'backup_2026-07-16_11-00-00.schema.sql.gz'))).toBe(
      true
    );
    expect(existsSync(path.join(backupsDir, 'backup_2026-07-16_11-00-00.data.sql.gz'))).toBe(true);
    expect(existsSync(path.join(backupsDir, 'backup_2026-07-16_10-00-00.schema.sql.gz'))).toBe(
      false
    );
    expect(existsSync(path.join(backupsDir, 'backup_2026-07-16_10-00-00.data.sql.gz'))).toBe(false);
  });
});
