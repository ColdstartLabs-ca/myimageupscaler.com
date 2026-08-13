import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd());
const footerSource = readFileSync(join(ROOT, 'client/components/layout/Footer.tsx'), 'utf8');
const genericTemplateSource = readFileSync(
  join(ROOT, 'app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate.tsx'),
  'utf8'
);
const platformFormatTemplateSource = readFileSync(
  join(ROOT, 'app/(pseo)/_components/pseo/templates/PlatformFormatPageTemplate.tsx'),
  'utf8'
);

function count(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

describe('pSEO internal-link balance', () => {
  it('links tools more often than legal pages in the shared footer', () => {
    const toolLinks = count(footerSource, /localizedPath\('\/tools(?:\/[^']+)?'\)/g);
    const legalLinks =
      count(footerSource, /localizedPath\('\/about'\)/g) +
      count(footerSource, /localizedPath\('\/terms'\)/g);

    expect(toolLinks).toBeGreaterThan(legalLinks);
  });

  it('renders each legal target once in the footer', () => {
    expect(count(footerSource, /localizedPath\('\/about'\)/g)).toBe(1);
    expect(count(footerSource, /localizedPath\('\/terms'\)/g)).toBe(1);
    expect(count(footerSource, /localizedPath\('\/privacy'\)/g)).toBe(1);
  });

  it('links pSEO pages to the roundup and a high-value tool', () => {
    expect(genericTemplateSource).toContain('/tools/ai-image-upscaler');
    expect(genericTemplateSource).toContain(
      '/blog/best-free-ai-image-upscaler-2026-tested-compared'
    );
  });

  it('includes a parent-hub link block in the multiplier template', () => {
    expect(platformFormatTemplateSource).toContain('data-testid="pseo-parent-hub-link"');
    expect(platformFormatTemplateSource).toContain('/platform-format');
  });
});
