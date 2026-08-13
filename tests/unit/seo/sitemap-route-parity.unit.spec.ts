import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildToolsSitemapPages,
  generateLocaleCategorySitemapResponse,
} from '@/lib/seo/locale-sitemap-handler';
import {
  INTERACTIVE_TOOL_PATHS,
  LOCALIZED_INTERACTIVE_SLUGS,
  RESIZE_SLUGS,
  CONVERSION_SLUGS,
  COMPRESS_SLUGS,
} from '@/lib/seo/interactive-tool-routes';
import { generateSitemapHreflangLinks } from '@/lib/seo/hreflang-generator';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
  serverEnv: { ENV: 'test' },
}));

describe('interactive sitemap route parity', () => {
  it('should keep both sitemap consumers on the shared path contract', () => {
    const root = path.resolve(__dirname, '../../..');
    const englishSitemap = fs.readFileSync(
      path.join(root, 'app/sitemap-tools.xml/route.ts'),
      'utf8'
    );
    const localeHandler = fs.readFileSync(
      path.join(root, 'lib/seo/locale-sitemap-handler.ts'),
      'utf8'
    );

    expect(englishSitemap).toContain("from '@/lib/seo/interactive-tool-routes'");
    expect(localeHandler).toContain("from './interactive-tool-routes'");
    expect(englishSitemap).not.toMatch(/const\s+INTERACTIVE_TOOL_PATHS\s*[:=]/);
    expect(localeHandler).not.toMatch(/const\s+TOOLS_INTERACTIVE_PATHS\s*[:=]/);
  });

  it('should emit only URLs with a matching route', () => {
    const declaredSlugs = new Set([...RESIZE_SLUGS, ...CONVERSION_SLUGS, ...COMPRESS_SLUGS]);

    for (const [slug, route] of Object.entries(INTERACTIVE_TOOL_PATHS)) {
      expect(declaredSlugs.has(slug), `${slug} is not declared by a route`).toBe(true);
      expect(route).toMatch(/^\/tools\/(resize|convert|compress)\/[a-z0-9-]+$/);
    }
  });

  it('should not emit locale hreflang for untranslated interactive tools', () => {
    const links = generateSitemapHreflangLinks(
      INTERACTIVE_TOOL_PATHS['resize-image-for-telegram'],
      'tools',
      ['en']
    );

    expect(LOCALIZED_INTERACTIVE_SLUGS).not.toContain('resize-image-for-telegram');
    expect(links.join('\n')).not.toContain('hreflang="de"');
    expect(links.join('\n')).toContain('hreflang="en"');
  });

  it('should omit untranslated dedicated tools from locale sitemaps', async () => {
    const pages = buildToolsSitemapPages(
      [],
      [],
      [
        {
          slug: 'resize-image-for-telegram',
          lastUpdated: '2026-08-13T00:00:00Z',
          title: 'Resize image for Telegram',
        },
        {
          slug: 'resize-image-for-instagram',
          lastUpdated: '2026-08-13T00:00:00Z',
          title: 'Resize image for Instagram',
        },
      ]
    );

    expect(pages.map(page => page.slug)).toEqual(['resize-image-for-instagram']);

    const response = generateLocaleCategorySitemapResponse('de', 'tools', 'tools', pages);
    const xml = await response.text();
    expect(xml).toContain('/de/tools/resize/resize-image-for-instagram');
    expect(xml).not.toContain('resize-image-for-telegram');
  });
});
