import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('blog LCP connection hints', () => {
  it('preconnects to the origins used by blog hero images', () => {
    const layout = readFileSync(resolve('app/[locale]/layout.tsx'), 'utf8');

    expect(layout).toContain(
      '<link rel="preconnect" href="https://xqysaylskffsfwunczbd.supabase.co"'
    );
    expect(layout).toContain('<link rel="preconnect" href="https://images.unsplash.com"');
  });

  it('does not add a global image preload that bypasses responsive selection', () => {
    const layout = readFileSync(resolve('app/[locale]/layout.tsx'), 'utf8');

    expect(layout).not.toMatch(/<link[^>]+rel="preload"[^>]+as="image"/);
  });
});
