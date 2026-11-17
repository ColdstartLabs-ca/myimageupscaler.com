import fs from 'node:fs';
import path from 'node:path';

// Next 16 `priority` only adds a preload; it no longer sets fetchpriority="high".
// PSI mobile 2026-11-16: missing hint caused a 2.4s LCP resource load delay.
const read = (file: string): string => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('mobile PSI LCP and image hints', () => {
  it.each([
    'client/components/landing/HeroSection.tsx',
    'client/components/blog/BlogFeaturedImage.tsx',
  ])('%s gives its LCP image fetchPriority="high"', file => {
    expect(read(file)).toMatch(/priority\s+fetchPriority="high"/);
  });

  it('navbar logo serves 2x CDN candidates', () => {
    const nav = read('client/components/navigation/NavBar.tsx');
    expect(nav).toContain("getCdnImageUrl('/logo/horizontal-logo-compact.png', 200)} 2x");
    expect(nav).toContain("getCdnImageUrl('/logo/horizontal-logo-full.png', 400)} 2x");
  });
});
