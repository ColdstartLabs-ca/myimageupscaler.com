import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('blog LCP connection hints', () => {
  it('preconnects to the blog image origin before image preloads', () => {
    const layout = readFileSync(resolve('app/[locale]/layout.tsx'), 'utf8');
    const storagePreconnect = layout.indexOf(
      '<link rel="preconnect" href="https://xqysaylskffsfwunczbd.supabase.co"'
    );
    const firstImagePreload = layout.indexOf('rel="preload"');

    expect(storagePreconnect).toBeGreaterThanOrEqual(0);
    expect(firstImagePreload).toBeGreaterThanOrEqual(0);
    expect(storagePreconnect).toBeLessThan(firstImagePreload);
  });
});
