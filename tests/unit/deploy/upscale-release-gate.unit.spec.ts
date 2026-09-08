import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Exercise the actual entrypoint; only external commands and the secrets boundary
// are replaced. Regressing the skip branch must fail before any production action.
describe('mandatory upscale release gate', () => {
  test('enables incoming cancellation so disconnected deliveries can release their leases', () => {
    const config = JSON.parse(readFileSync(path.resolve('wrangler.json'), 'utf8'));
    expect(config.compatibility_flags).toContain('enable_request_signal');
  });

  test.each([[], ['--skip-tests'], ['--skip-tests', '--skip-i18n']])(
    'blocks a failed release check with arguments %j before fetching secrets',
    (...args) => {
      const result = runDeploy(args as string[], false);
      expect(result.status).toBe(1);
      expect(result.events).toEqual(['test:upscale:release']);
      expect(result.output).toContain('Deployment blocked');
    }
  );

  test('continues past a passing release gate even with --skip-tests', () => {
    const result = runDeploy(['--skip-tests'], true);
    expect(result.status).toBe(66);
    expect(result.events).toEqual(['test:upscale:release', 'fetch-secrets']);
  });
});

function runDeploy(args: string[], pass: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), 'upscale-deploy-gate-'));
  try {
    mkdirSync(path.join(root, 'scripts/deploy/steps'), { recursive: true });
    mkdirSync(path.join(root, 'bin'));
    for (const file of ['deploy.sh', 'common.sh'])
      cpSync(path.resolve('scripts/deploy', file), path.join(root, 'scripts/deploy', file));
    writeFileSync(
      path.join(root, 'scripts/deploy/steps/00-fetch-secrets.sh'),
      'step_fetch_secrets() { echo fetch-secrets >> "$DEPLOY_TEST_EVENTS"; exit 66; }\n'
    );
    writeFileSync(path.join(root, 'bin/git'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    writeFileSync(
      path.join(root, 'bin/yarn'),
      `#!/bin/bash\necho "$*" >> "$DEPLOY_TEST_EVENTS"\n[[ "$*" == test:upscale:release ]] || exit 99\nexit ${pass ? 0 : 41}\n`,
      { mode: 0o755 }
    );
    const events = path.join(root, 'events');
    writeFileSync(events, '');
    const systemPath = execFileSync('getconf', ['PATH'], { encoding: 'utf8' }).trim();
    const result = spawnSync('/bin/bash', ['scripts/deploy/deploy.sh', ...args], {
      cwd: root,
      env: { PATH: `${root}/bin:${systemPath}`, DEPLOY_TEST_EVENTS: events },
      encoding: 'utf8',
      timeout: 5000,
    });
    return {
      status: result.status,
      events: readFileSync(events, 'utf8').trim().split('\n').filter(Boolean),
      output: result.stdout + result.stderr,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
