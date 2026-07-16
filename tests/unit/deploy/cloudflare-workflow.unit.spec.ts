import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Cloudflare deployment workflow', () => {
  it('passes a valid Wrangler deploy command after the OpenNext build', () => {
    const workflow = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/deploy.yml'),
      'utf8'
    );

    expect(workflow).toContain('run: npx opennextjs-cloudflare build');
    expect(workflow).toContain('command: deploy --config wrangler.json');
    expect(workflow).not.toContain('command: opennextjs-cloudflare deploy');
  });
});
