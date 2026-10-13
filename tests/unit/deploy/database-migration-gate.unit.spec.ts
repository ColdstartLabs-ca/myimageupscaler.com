import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { env as hostEnvironment } from 'node:process';
import { describe, expect, test } from 'vitest';

const projectRoot = process.cwd();
const migrationGate = path.join(projectRoot, 'scripts/deploy/steps/00-database-migrations.sh');

interface IRunGateOptions {
  linkedProjectRef?: string;
  failMode?: 'preflight' | 'push' | 'postflight';
  dbRegion?: string;
  dbPassword?: string;
}

function runGate(options: IRunGateOptions = {}) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'deploy-migrations-'));
  const fakeBin = path.join(fixtureRoot, 'bin');
  const callLog = path.join(fixtureRoot, 'calls.log');
  const dryRunCount = path.join(fixtureRoot, 'dry-run-count');
  const linkedRefPath = path.join(fixtureRoot, 'supabase/.temp/project-ref');

  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(path.dirname(linkedRefPath), { recursive: true });

  if (options.linkedProjectRef !== undefined) {
    writeFileSync(linkedRefPath, `${options.linkedProjectRef}\n`);
  }

  const fakeNpx = path.join(fakeBin, 'npx');
  writeFileSync(
    fakeNpx,
    `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$*" >> "$CALL_LOG"

if [[ "$*" == "supabase link "* ]]; then
  printf '%s\\n' "$EXPECTED_PROJECT_REF" > "$FIXTURE_ROOT/supabase/.temp/project-ref"
  exit 0
fi

if [[ "$*" == *"db push"* && "$*" == *"--dry-run"* ]]; then
  count=0
  [[ -f "$DRY_RUN_COUNT" ]] && count=$(<"$DRY_RUN_COUNT")
  count=$((count + 1))
  printf '%s' "$count" > "$DRY_RUN_COUNT"
  [[ "$FAIL_MODE" == "preflight" && "$count" == "1" ]] && exit 1
  [[ "$FAIL_MODE" == "postflight" && "$count" == "2" ]] && exit 1
  exit 0
fi

if [[ "$*" == *"db push"* ]]; then
  [[ "$FAIL_MODE" == "push" ]] && exit 1
  exit 0
fi

exit 2
`
  );
  chmodSync(fakeNpx, 0o755);

  const result = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail
log_info() { :; }
log_success() { :; }
log_error() { printf '%s\\n' "$1" >&2; return 1; }
source "$MIGRATION_GATE"
deploy_database_migrations`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...hostEnvironment,
        CALL_LOG: callLog,
        DRY_RUN_COUNT: dryRunCount,
        EXPECTED_PROJECT_REF: 'prodprojectref',
        FAIL_MODE: options.failMode ?? '',
        FIXTURE_ROOT: fixtureRoot,
        MIGRATION_GATE: migrationGate,
        NEXT_PUBLIC_SUPABASE_URL: 'https://prodprojectref.supabase.co',
        PATH: `${fakeBin}:${hostEnvironment.PATH}`,
        PROJECT_ROOT: fixtureRoot,
        SUPABASE_DB_PASSWORD: options.dbPassword ?? 'test-password',
        SUPABASE_DB_REGION: options.dbRegion ?? 'us-west-2',
        SUPABASE_ACCESS_TOKEN: '',
      },
    }
  );

  const calls = (() => {
    try {
      return readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  })();

  rmSync(fixtureRoot, { recursive: true, force: true });
  return { ...result, calls };
}

describe('production database migration gate', () => {
  test('keeps repository migrations canonical and uniquely versioned', () => {
    const migrationFiles = readdirSync(path.join(projectRoot, 'supabase/migrations')).filter(file =>
      file.endsWith('.sql')
    );
    const invalidFiles = migrationFiles.filter(file => !/^\d{14}_[a-z0-9_]+\.sql$/.test(file));
    const versions = migrationFiles.map(file => file.slice(0, 14));

    expect(invalidFiles).toEqual([]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  test('uses the expected database without a management token, checks history, pushes, and verifies again', () => {
    const result = runGate();

    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      'supabase db push --db-url postgresql://postgres.prodprojectref:test-password@aws-0-us-west-2.pooler.supabase.com:5432/postgres --skip-vault --dry-run',
      'supabase db push --db-url postgresql://postgres.prodprojectref:test-password@aws-0-us-west-2.pooler.supabase.com:5432/postgres --skip-vault --yes',
      'supabase db push --db-url postgresql://postgres.prodprojectref:test-password@aws-0-us-west-2.pooler.supabase.com:5432/postgres --skip-vault --dry-run',
    ]);
  });

  test.each(['', 'us-west-2/other-host'])(
    'rejects unsafe or missing database region %j before database access',
    dbRegion => {
      const result = runGate({ dbRegion });
      expect(result.status).not.toBe(0);
      expect(result.calls).toEqual([]);
    }
  );

  test('percent-encodes database passwords without logging them', () => {
    const password = 'p@ss:%40/#? word';
    const result = runGate({ dbPassword: password });
    expect(result.status).toBe(0);
    const connection = result.calls[0].match(/--db-url (\S+)/)?.[1];
    expect(connection).toBeDefined();
    expect(decodeURIComponent(new URL(connection!).password)).toBe(password);
    expect(result.stdout + result.stderr).not.toContain(password);
    expect(result.stdout + result.stderr).not.toContain(connection);
  });

  test('blocks before database access when the linked project does not match production', () => {
    const result = runGate({ linkedProjectRef: 'wrongprojectref' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not match production project');
    expect(result.calls).toEqual([]);
  });

  test.each([
    ['preflight', 1],
    ['push', 2],
    ['postflight', 3],
  ] as const)('blocks deployment when the %s migration command fails', (failMode, callCount) => {
    const result = runGate({ linkedProjectRef: 'prodprojectref', failMode });

    expect(result.status).not.toBe(0);
    expect(result.calls).toHaveLength(callCount);
  });
});
