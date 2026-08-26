import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const deployScript = readFileSync(path.resolve(process.cwd(), 'scripts/deploy/deploy.sh'), 'utf8');
const deployStepScript = readFileSync(
  path.resolve(process.cwd(), 'scripts/deploy/steps/03-deploy.sh'),
  'utf8'
);

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

  test('allows skipping tests and i18n without bypassing production safety checks', () => {
    expect(deployScript).toContain('--skip-tests) SKIP_TESTS="true" ;;');
    expect(deployScript).toContain('--skip-i18n) SKIP_I18N="true" ;;');
    expect(deployScript).toContain('if [ "$SKIP_TESTS" = "false" ]; then');
    expect(deployScript).toContain('if [ "$SKIP_I18N" = "false" ]; then');
    expect(deployScript).not.toContain('--skip-seo-guard');
    expect(deployScript).not.toContain('--skip-smoke');
    expect(deployScript).toContain('yarn test');
    expect(deployScript).toContain('yarn verify');
    expect(deployScript).toContain('yarn test:seo-guard');
    expect(deployScript).toContain('yarn i18n:check --no-pseo');
    expect(deployScript.match(/assert_clean_worktree/g)).toHaveLength(3);
  });

  test('runs the Stripe price-ID guard before evaluating --skip-tests', () => {
    const guard =
      'yarn deploy:stripe:guard --client-env-file .env.client.prod --server-env-file .env.api.prod';

    expect(deployScript.indexOf(guard)).toBeLessThan(
      deployScript.indexOf('if [ "$SKIP_TESTS" = "false" ]; then')
    );
  });

  test('applies and verifies production migrations only after the database backup', () => {
    const backup = 'if ! yarn db:backup; then';
    const migrationGate =
      'source "$SCRIPT_DIR/steps/00-database-migrations.sh" && deploy_database_migrations';

    expect(deployScript).toContain(migrationGate);
    expect(deployScript.indexOf(backup)).toBeLessThan(deployScript.indexOf(migrationGate));
    expect(deployScript.indexOf(migrationGate)).toBeLessThan(
      deployScript.indexOf('if [ "$SKIP_TESTS" = "false" ]; then')
    );
    expect(deployScript).not.toContain('--skip-migrations');
  });

  test('falls back to Wrangler OAuth only for OpenNext R2 deployment when the production token lacks R2 access', () => {
    expect(deployStepScript).toContain('npx wrangler r2 bucket list >/dev/null 2>&1');
    expect(deployStepScript).toContain(
      'env -u CLOUDFLARE_API_TOKEN npx wrangler r2 bucket list >/dev/null 2>&1'
    );
    expect(deployStepScript).toContain(
      'env -u CLOUDFLARE_API_TOKEN npx opennextjs-cloudflare deploy'
    );
  });
});
