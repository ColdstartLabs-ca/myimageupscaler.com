import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_REDIRECTS, UNMAPPED_LEGACY_PATHS } from '@/lib/seo/legacy-redirects';
import { parseGscCsv } from '@/lib/seo/gsc-verification';

const ROOT = path.resolve(__dirname, '../../..');
const DATA_PATH = path.join(ROOT, 'docs/PRDs/gsc-recovery-2026-08/data/gsc-404.csv');
const LOCALE_PATTERN = ':locale(en|fr|de|es|it|ja|pt)';
const ROUTED_TOOL_SLUGS = new Set(
  fs
    .readdirSync(path.join(ROOT, 'app/seo/data'))
    .filter(file => file.endsWith('.json'))
    .flatMap(file => {
      const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/seo/data', file), 'utf8')) as {
        category?: string;
        pages?: Array<{ slug: string }>;
      };
      return data.category === 'tools' ? (data.pages ?? []).map(page => page.slug) : [];
    })
);

const FORMER_MIDDLEWARE_REDIRECTS: Array<[string, string]> = [
  ['/tools/bulk-image-resizer', '/tools/resize/bulk-image-resizer'],
  ['/tools/bulk-image-compressor', '/tools/compress/bulk-image-compressor'],
  ['/tools/png-to-jpg', '/tools/convert/png-to-jpg'],
  ['/tools/jpg-to-png', '/tools/convert/jpg-to-png'],
  ['/tools/webp-to-jpg', '/tools/convert/webp-to-jpg'],
  ['/tools/webp-to-png', '/tools/convert/webp-to-png'],
  ['/tools/jpg-to-webp', '/tools/convert/jpg-to-webp'],
  ['/tools/png-to-webp', '/tools/convert/png-to-webp'],
  ['/tools/image-compressor', '/tools/compress/image-compressor'],
  ['/tools/image-resizer', '/tools/resize/image-resizer'],
  ['/tools/resize-image-for-instagram', '/tools/resize/resize-image-for-instagram'],
  ['/tools/resize-image-for-youtube', '/tools/resize/resize-image-for-youtube'],
  ['/tools/resize-image-for-facebook', '/tools/resize/resize-image-for-facebook'],
  ['/tools/resize-image-for-twitter', '/tools/resize/resize-image-for-twitter'],
  ['/tools/resize-image-for-linkedin', '/tools/resize/resize-image-for-linkedin'],
  ['/tools/free-ai-upscaler', '/free/free-ai-upscaler'],
  ['/article/upscale-arw-images', '/camera-raw/upscale-arw-images'],
  [
    '/article/photography-business-enhancement',
    '/industry-insights/photography-business-enhancement',
  ],
  ['/article/family-photo-preservation', '/photo-restoration/family-photo-preservation'],
  ['/industry-insights/real-estate-photo-enhancement', '/use-cases/real-estate-photo-enhancement'],
  [
    '/blog/photo-enhancement-upscaling-vs-quality',
    '/blog/ai-image-upscaling-vs-sharpening-explained',
  ],
  [
    '/blog/best-free-ai-image-upscaler-tools-2026',
    '/blog/best-free-ai-image-upscaler-2026-tested-compared',
  ],
  ['/blog/free-upscaler-no-sign-up', '/blog/free-ai-upscaler-no-watermark'],
  ['/blog/upscale-image-online-free', '/blog/free-ai-upscaler-no-watermark'],
  ['/blog/ai-vs-traditional-image-upscaling', '/blog/ai-image-upscaling-vs-sharpening-explained'],
  ['/blog/how-ai-image-upscaling-works-explained', '/blog/how-ai-image-upscaling-works-guide'],
  ['/blog/restore-old-photos-online', '/use-cases/old-photo-restoration'],
];

function findRedirect(source: string) {
  return LEGACY_REDIRECTS.find(entry => {
    if (entry.source === source) return true;
    if (!entry.source.includes(LOCALE_PATTERN)) return false;
    const matcher = new RegExp(`^${entry.source.replace(LOCALE_PATTERN, '[a-z]{2}')}$`);
    return matcher.test(source);
  });
}

/**
 * middleware.ts lowercases any /tools/ path before Next's route matcher runs,
 * so mixed-case tool URLs are already 301'd to their canonical slug. They must
 * NOT get a LEGACY_REDIRECTS entry: next.config redirects run before middleware
 * and `next dev` matches their sources case-insensitively, so a case-only rule
 * matches its own destination and loops. Covered by middleware-redirects.unit.spec.ts.
 */
function isMiddlewareCaseNormalized(source: string): boolean {
  const withoutLocale = source.replace(/^\/[a-z]{2}(?=\/)/, '');
  return withoutLocale.startsWith('/tools/') && withoutLocale !== withoutLocale.toLowerCase();
}

function isRoutedPage(source: string): boolean {
  if (/^\/(?:[a-z]{2}\/)?use-cases-expanded\//.test(source)) return true;
  if (/^\/(?:[a-z]{2}\/)?tools\/(?:resize|convert|compress)\/[a-z0-9-]+$/.test(source)) {
    return true;
  }

  const genericToolMatch = source.match(/^\/(?:[a-z]{2}\/)?tools\/([^/]+)$/);
  return Boolean(genericToolMatch && ROUTED_TOOL_SLUGS.has(genericToolMatch[1]));
}

describe('generated legacy redirects', () => {
  it('should have no undocumented unmapped GSC paths', () => {
    expect(UNMAPPED_LEGACY_PATHS).toEqual([]);
  });

  it('should map every GSC 404 source to a redirect or an explicitly routed page', () => {
    const urls = parseGscCsv(fs.readFileSync(DATA_PATH, 'utf8'));
    const missing = urls.filter(url => {
      const source = new URL(url).pathname;
      return !findRedirect(source) && !isRoutedPage(source) && !isMiddlewareCaseNormalized(source);
    });

    expect(missing, `unmapped GSC sources: ${missing.join(', ')}`).toEqual([]);
  });

  it('should not chain redirects', () => {
    const sources = new Set(LEGACY_REDIRECTS.map(entry => entry.source));
    const chains = LEGACY_REDIRECTS.filter(entry => sources.has(entry.destination));
    expect(chains, `redirect chains: ${JSON.stringify(chains)}`).toEqual([]);
  });

  it('should send locale-prefixed blog redirects directly to the canonical path', () => {
    const localeBlogRedirects = LEGACY_REDIRECTS.filter(entry =>
      entry.source.startsWith(`/${LOCALE_PATTERN}/blog/`)
    );

    const localeBlogToBlogRedirects = localeBlogRedirects.filter(entry =>
      entry.destination.includes('/blog/')
    );

    expect(localeBlogRedirects.length).toBeGreaterThan(0);
    expect(localeBlogToBlogRedirects.length).toBeGreaterThan(0);
    expect(localeBlogToBlogRedirects.every(entry => !entry.destination.startsWith('/:'))).toBe(
      true
    );
  });

  it('should keep the complete Next redirect table single-hop for locale blog URLs', async () => {
    const output = execFileSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        '-e',
        "import('./next.config.js').then(async ({ default: config }) => process.stdout.write(JSON.stringify(await config.redirects())))",
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const redirects = JSON.parse(output) as Array<{ source: string; destination: string }>;
    const localeBlogRedirects = redirects.filter(entry =>
      entry.source.startsWith(`/${LOCALE_PATTERN}/blog/`)
    );
    const localeBlogToBlogRedirects = localeBlogRedirects.filter(entry =>
      entry.destination.includes('/blog/')
    );

    expect(localeBlogRedirects.length).toBeGreaterThan(0);
    expect(localeBlogToBlogRedirects.length).toBeGreaterThan(0);
    expect(localeBlogToBlogRedirects.every(entry => !entry.destination.startsWith('/:'))).toBe(
      true
    );
  });

  it('should use 301 for all legacy redirects', () => {
    expect(LEGACY_REDIRECTS.length).toBeGreaterThan(0);
    expect(LEGACY_REDIRECTS.every(entry => entry.permanent)).toBe(true);
    expect(LEGACY_REDIRECTS.every(entry => entry.statusCode === 301)).toBe(true);
  });

  it('should preserve every redirect the middleware map used to serve', () => {
    for (const [source, destination] of FORMER_MIDDLEWARE_REDIRECTS) {
      const entry = findRedirect(source);
      expect(entry, `${source} is missing`).toBeDefined();
      expect(entry?.destination, source).toBe(destination);
    }
  });
});
