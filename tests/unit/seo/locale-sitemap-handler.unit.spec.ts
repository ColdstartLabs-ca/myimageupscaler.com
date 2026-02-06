/**
 * Locale Sitemap Handler Unit Tests
 * Tests locale-specific sitemap generation with localized URLs and hreflang
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateLocaleCategorySitemapResponse,
  buildToolsSitemapPages,
  TOOLS_INTERACTIVE_PATHS,
  type ILocaleSitemapPage,
} from '@/lib/seo/locale-sitemap-handler';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
  serverEnv: {
    ENV: 'test',
  },
}));

describe('generateLocaleCategorySitemapResponse', () => {
  const mockPages: ILocaleSitemapPage[] = [
    { slug: 'page-one', lastUpdated: '2026-01-15T00:00:00.000Z', title: 'Page One' },
    { slug: 'page-two', lastUpdated: '2026-01-20T00:00:00.000Z', title: 'Page Two' },
  ];

  it('should return a valid XML response', () => {
    const response = generateLocaleCategorySitemapResponse(
      'es',
      'alternatives',
      'alternatives',
      mockPages,
      0.75
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
  });

  it('should generate locale-prefixed URLs in <loc> tags', async () => {
    const response = generateLocaleCategorySitemapResponse(
      'es',
      'alternatives',
      'alternatives',
      mockPages,
      0.75
    );

    const xml = await response.text();

    // Category index should have locale prefix
    expect(xml).toContain('<loc>https://myimageupscaler.com/es/alternatives</loc>');
    // Page URLs should have locale prefix
    expect(xml).toContain('<loc>https://myimageupscaler.com/es/alternatives/page-one</loc>');
    expect(xml).toContain('<loc>https://myimageupscaler.com/es/alternatives/page-two</loc>');
  });

  it('should include hreflang links for all locales', async () => {
    const response = generateLocaleCategorySitemapResponse(
      'pt',
      'alternatives',
      'alternatives',
      mockPages,
      0.75
    );

    const xml = await response.text();

    // Should have hreflang for all 7 locales + x-default
    expect(xml).toContain('hreflang="en"');
    expect(xml).toContain('hreflang="es"');
    expect(xml).toContain('hreflang="pt"');
    expect(xml).toContain('hreflang="de"');
    expect(xml).toContain('hreflang="fr"');
    expect(xml).toContain('hreflang="it"');
    expect(xml).toContain('hreflang="ja"');
    expect(xml).toContain('hreflang="x-default"');
  });

  it('should use correct priority', async () => {
    const response = generateLocaleCategorySitemapResponse(
      'de',
      'scale',
      'scale',
      mockPages,
      0.8
    );

    const xml = await response.text();
    expect(xml).toContain('<priority>0.8</priority>');
  });

  it('should include image tags when ogImage is provided', async () => {
    const pagesWithImages: ILocaleSitemapPage[] = [
      {
        slug: 'with-image',
        lastUpdated: '2026-01-15T00:00:00.000Z',
        title: 'Page With Image',
        ogImage: '/images/test.png',
      },
    ];

    const response = generateLocaleCategorySitemapResponse(
      'fr',
      'formats',
      'formats',
      pagesWithImages,
      0.8
    );

    const xml = await response.text();
    expect(xml).toContain('<image:image>');
    expect(xml).toContain(
      '<image:loc>https://myimageupscaler.com/images/test.png</image:loc>'
    );
    expect(xml).toContain('<image:title>Page With Image</image:title>');
  });

  it('should handle customPath for pages', async () => {
    const pagesWithCustomPath: ILocaleSitemapPage[] = [
      {
        slug: 'image-resizer',
        lastUpdated: '2026-01-15T00:00:00.000Z',
        customPath: '/tools/resize/image-resizer',
      },
    ];

    const response = generateLocaleCategorySitemapResponse(
      'ja',
      'tools',
      'tools',
      pagesWithCustomPath,
      0.9
    );

    const xml = await response.text();
    // Should use the custom path with locale prefix
    expect(xml).toContain(
      '<loc>https://myimageupscaler.com/ja/tools/resize/image-resizer</loc>'
    );
  });

  it('should generate valid XML structure', async () => {
    const response = generateLocaleCategorySitemapResponse(
      'it',
      'guides',
      'guides',
      mockPages,
      0.7
    );

    const xml = await response.text();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('</urlset>');
  });
});

describe('buildToolsSitemapPages', () => {
  it('should combine static and interactive tools', () => {
    const staticTools = [
      { slug: 'ai-upscaler', lastUpdated: '2026-01-15', title: 'AI Upscaler' },
    ];
    const interactiveTools = [
      { slug: 'image-resizer', lastUpdated: '2026-01-20', title: 'Image Resizer' },
    ];

    const pages = buildToolsSitemapPages(staticTools, interactiveTools);

    expect(pages).toHaveLength(2);
    expect(pages[0].slug).toBe('ai-upscaler');
    expect(pages[0].customPath).toBeUndefined();
    expect(pages[1].slug).toBe('image-resizer');
    expect(pages[1].customPath).toBe('/tools/resize/image-resizer');
  });
});

describe('TOOLS_INTERACTIVE_PATHS', () => {
  it('should contain all interactive tool paths', () => {
    expect(TOOLS_INTERACTIVE_PATHS['image-resizer']).toBe('/tools/resize/image-resizer');
    expect(TOOLS_INTERACTIVE_PATHS['png-to-jpg']).toBe('/tools/convert/png-to-jpg');
    expect(TOOLS_INTERACTIVE_PATHS['image-compressor']).toBe('/tools/compress/image-compressor');
  });

  it('should have 15 interactive tool path mappings', () => {
    expect(Object.keys(TOOLS_INTERACTIVE_PATHS)).toHaveLength(15);
  });
});
