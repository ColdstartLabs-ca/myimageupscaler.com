import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const deployScript = readFileSync(path.resolve(process.cwd(), 'scripts/deploy/deploy.sh'), 'utf8');

describe('yarn deploy safety gates', () => {
  test('runs the Stripe guard before loading or building production configuration', () => {
    const guard =
      'yarn deploy:stripe:guard --client-env-file .env.client.prod --server-env-file .env.api.prod';

    expect(deployScript).toContain(guard);
    expect(deployScript.indexOf(guard)).toBeLessThan(
      deployScript.indexOf('source "$PROJECT_ROOT/scripts/load-env.sh" --prod')
    );
    expect(deployScript.indexOf(guard)).toBeLessThan(deployScript.indexOf('step_build'));
  });

  test('does not provide flags to skip mandatory production checks', () => {
    expect(deployScript).toContain(
      'Production safety checks cannot be skipped. Only --purge is allowed.'
    );
    expect(deployScript).not.toContain('--skip-tests');
    expect(deployScript).not.toContain('--skip-i18n');
    expect(deployScript).not.toContain('--skip-seo-guard');
    expect(deployScript).not.toContain('--skip-smoke');
    expect(deployScript).toContain('yarn test');
    expect(deployScript).toContain('yarn verify');
    expect(deployScript).toContain('yarn test:seo-guard');
    expect(deployScript).toContain('yarn i18n:check --no-pseo');
    expect(deployScript.match(/assert_clean_worktree/g)).toHaveLength(3);
  });

  test('rejects a skip flag before it can run a deploy step', () => {
    const result = spawnSync('bash', ['scripts/deploy/deploy.sh', '--skip-tests'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Production safety checks cannot be skipped');
  });
});
