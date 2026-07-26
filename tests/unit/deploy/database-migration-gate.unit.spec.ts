import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

const projectRoot = process.cwd();
const migrationGate = path.join(
  projectRoot,
  'scripts/deploy/steps/00-database-migrations.sh'
);

interface IRunGateOptions {
  linkedProjectRef?: string;
  failMode?: 'preflight' | 'push' | 'postflight';
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
        ...process.env,
        CALL_LOG: callLog,
        DRY_RUN_COUNT: dryRunCount,
        EXPECTED_PROJECT_REF: 'prodprojectref',
        FAIL_MODE: options.failMode ?? '',
        FIXTURE_ROOT: fixtureRoot,
        MIGRATION_GATE: migrationGate,
        NEXT_PUBLIC_SUPABASE_URL: 'https://prodprojectref.supabase.co',
        PATH: `${fakeBin}:${process.env.PATH}`,
        PROJECT_ROOT: fixtureRoot,
        SUPABASE_DB_PASSWORD: 'test-password',
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

  return { ...result, calls };
}

describe('production database migration gate', () => {
  test('links the expected production project, checks history, pushes, and verifies again', () => {
    const result = runGate();

    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      'supabase link --project-ref prodprojectref --password test-password',
      'supabase db push --linked --password test-password --dry-run',
      'supabase db push --linked --password test-password --yes',
      'supabase db push --linked --password test-password --dry-run',
    ]);
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
