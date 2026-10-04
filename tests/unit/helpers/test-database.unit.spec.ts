import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSpawnSync } = vi.hoisted(() => ({ mockSpawnSync: vi.fn() }));
vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
  default: { spawnSync: mockSpawnSync },
}));

import {
  areTestDatabaseKeys,
  isOwnedTestDatabaseRunning,
  TEST_DB_ANON_KEY,
  TEST_DB_API_PORT,
  TEST_DB_SERVICE_ROLE_KEY,
} from '../../helpers/test-database';

const docker = (stdout: string, status = 0) => mockSpawnSync.mockReturnValue({ status, stdout });
const KONG = 'supabase_kong_miu-test';

describe('isOwnedTestDatabaseRunning', () => {
  beforeEach(() => mockSpawnSync.mockReset());

  it('is true only for this project kong container publishing the API port', () => {
    docker(
      `${KONG} 8001/tcp, 0.0.0.0:${TEST_DB_API_PORT}->8000/tcp, [::]:${TEST_DB_API_PORT}->8000/tcp`
    );
    expect(isOwnedTestDatabaseRunning()).toBe(true);
  });

  it.each([
    ['nothing running', ''],
    ['another project', `supabase_kong_other 0.0.0.0:${TEST_DB_API_PORT}->8000/tcp`],
    ['the right container on another port', `${KONG} 0.0.0.0:54321->8000/tcp`],
    ['the right port without the container name', `0.0.0.0:${TEST_DB_API_PORT}->8000/tcp`],
  ])('is false for %s', (_label, stdout) => {
    docker(stdout);
    expect(isOwnedTestDatabaseRunning()).toBe(false);
  });

  it('is false when docker fails or is missing', () => {
    docker('', 1);
    expect(isOwnedTestDatabaseRunning()).toBe(false);
    mockSpawnSync.mockReturnValue({ status: null, stdout: null, error: new Error('ENOENT') });
    expect(isOwnedTestDatabaseRunning()).toBe(false);
  });

  it('only filters for running containers of this exact project', () => {
    docker('');
    isOwnedTestDatabaseRunning();
    const args = mockSpawnSync.mock.calls[0][1] as string[];
    expect(args).toContain(`name=^${KONG}$`);
    expect(args).toContain('status=running');
  });
});

describe('areTestDatabaseKeys', () => {
  it('accepts only the public demo keys', () => {
    expect(areTestDatabaseKeys([TEST_DB_ANON_KEY, TEST_DB_SERVICE_ROLE_KEY, undefined, ''])).toBe(
      true
    );
    expect(areTestDatabaseKeys([TEST_DB_ANON_KEY, 'something-else'])).toBe(false);
  });
});

describe('disposable database scripts', () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

  it('test-db.sh builds the project the harness verifies and removes everything on down', () => {
    const script = read('scripts/test-db.sh');
    const config = read('tests/test-db/config.toml');
    expect(script).toContain('PROJECT_ID="miu-test"');
    expect(script).toContain(`API_PORT=${TEST_DB_API_PORT}`);
    expect(config).toContain('project_id = "miu-test"');
    expect(config).toMatch(new RegExp(`\\[api\\][^\\[]*port = ${TEST_DB_API_PORT}`));
    expect(script).toContain('stop --no-backup --project-id');
    expect(script).toMatch(/docker volume rm/);
    expect(script).toMatch(/docker network rm/);
    expect(script).toMatch(/mkdir -m 700 "\$LOCK"/);
    expect(script).toMatch(/trap abort ERR INT TERM/);
    expect(script).toMatch(/supabase@\d+\.\d+\.\d+/);
    expect(script).not.toMatch(/--linked|db push|gcloud|\.env\.api/);
  });

  it('with-test-db.sh always tears the database down and never starts over a running one', () => {
    const script = read('scripts/with-test-db.sh');
    expect(script).toMatch(
      /test-db\.sh" up\s+status=\$\?\s+\[ "\$status" -eq 0 \] \|\| exit 1\s+trap 'exit 130' INT TERM\s+trap '.*down' EXIT/
    );
    expect(script).toContain('TEST_DB_OWNER_PID=$$');
  });

  it('yarn test runs inside the database wrapper', () => {
    const { scripts } = JSON.parse(read('package.json'));
    expect(scripts.test).toContain('with-test-db.sh');
    expect(scripts.test).toContain('vitest run');
  });
});
