import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Cloudflare deployment workflow', () => {
  it('passes a valid Wrangler deploy command after the OpenNext build', () => {
    const workflow = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/deploy.yml'),
      'utf8'
    );

    expect(workflow).toContain('npx next build --webpack');
    expect(workflow).toContain('npx opennextjs-cloudflare build --skipNextBuild');
    expect(workflow).not.toMatch(/run: npx opennextjs-cloudflare build\s*$/m);
    expect(workflow).toContain('Run PostgreSQL migration test in isolation');
    expect(workflow).toContain("RUN_POSTGRES_TESTS: '1'");
    expect(workflow).toContain('image: postgres:16-alpine');
    expect(workflow).toContain(
      'POSTGRES_TEST_URL: postgresql://postgres:test@127.0.0.1:54329/postgres'
    );
    expect(workflow).toContain('Verify deployed Worker through Cloudflare API');
    expect(workflow).toContain('/workers/scripts/myimageupscaler/deployments');
    expect(workflow).toContain('Verify live application health');
    expect(workflow).toContain('PRODUCTION_BASE_URL: ${{ vars.NEXT_PUBLIC_BASE_URL }}');
    expect(workflow).toContain('${PRODUCTION_BASE_URL%/}/api/health');
    expect(workflow).toContain('--retry-all-errors');
    expect(workflow).toContain('command: deploy --config wrangler.json');
    expect(workflow).not.toContain('command: opennextjs-cloudflare deploy');
  });

  it('keeps the checkout smoke fallback aligned with the corp Stripe account', () => {
    const smokeTest = readFileSync(
      path.resolve(process.cwd(), 'tests/smoke/checkout.smoke.spec.ts'),
      'utf8'
    );

    expect(smokeTest).toContain('price_1TPosy17DctxcZv22g6Xu1Wa');
    expect(smokeTest).not.toContain('price_1TPoss1I7KzZir1ikF1Wk48f');
  });
});
