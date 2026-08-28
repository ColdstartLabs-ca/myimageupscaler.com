import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('upscale refund Tail Worker deployment', () => {
  it('attaches the refund tail consumer to the production worker', () => {
    const config = JSON.parse(read('wrangler.json')) as {
      tail_consumers?: Array<{ service?: string }>;
    };

    expect(config.tail_consumers).toContainEqual({ service: 'myimageupscaler-refund-tail' });
  });

  it('deploys the tail worker before the producer and uploads its shared secret', () => {
    const deploy = read('scripts/deploy/steps/03-deploy.sh');
    const secrets = read('scripts/deploy/steps/05-secrets.sh');

    const tailConfigIndex = deploy.indexOf('workers/upscale-refund-tail/wrangler.toml');
    const tailSecretIndex = deploy.indexOf(
      'secret put CRON_SECRET --name "$refund_tail_worker_name"'
    );
    const producerIndex = deploy.indexOf('Deploying main worker');
    expect(tailConfigIndex).toBeGreaterThan(-1);
    expect(tailSecretIndex).toBeGreaterThan(tailConfigIndex);
    expect(tailSecretIndex).toBeLessThan(producerIndex);
    expect(secrets).toContain('workers/upscale-refund-tail/wrangler.toml');
    expect(secrets).toContain('CRON_SECRET → refund tail worker');
  });
});
