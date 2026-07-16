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
    expect(workflow).toContain('command: deploy --config wrangler.json');
    expect(workflow).not.toContain('command: opennextjs-cloudflare deploy');
  });
});
