/**
 * Tool Route Consistency Unit Tests
 * Phase 4 of GSC 404 error fix - validation tests to prevent future slug/route/data mismatches
 *
 * These tests ensure:
 * 1. Every slug returned by getAllToolSlugs() resolves to non-null data
 * 2. DEDICATED_ROUTE_SLUGS and INTERACTIVE_TOOL_PATHS are in sync
 * 3. getAllToolSlugs() and DEDICATED_ROUTE_SLUGS are mutually exclusive
 * 4. Sitemap tool URLs match actual routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { INTERACTIVE_TOOL_PATHS } from '@/lib/seo/interactive-tool-routes';

// Mock serverEnv before any imports that use it
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    ENV: 'test',
  },
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
}));

describe('Tool Route Consistency', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('every tool slug should have resolvable data', () => {
    it('should resolve all slugs from getAllToolSlugs() to non-null data', async () => {
      const { getAllToolSlugs, getToolData } = await import('@/lib/seo/data-loader');

      const slugs = await getAllToolSlugs();

      // Should have slugs to test
      expect(slugs.length).toBeGreaterThan(0);

      // Every slug should resolve to non-null data
      for (const slug of slugs) {
        const data = await getToolData(slug);
        expect(data, `Slug "${slug}" should resolve to non-null data`).not.toBeNull();
        expect(data?.slug, `Data for slug "${slug}" should have matching slug property`).toBe(slug);
      }
    });

    it('should resolve all slugs via getToolDataWithLocale for English', async () => {
      const { getAllToolSlugs, getToolDataWithLocale } = await import('@/lib/seo/data-loader');

      const slugs = await getAllToolSlugs();

      for (const slug of slugs) {
        const result = await getToolDataWithLocale(slug, 'en');
        expect(
          result.data,
          `Slug "${slug}" should resolve via getToolDataWithLocale`
        ).not.toBeNull();
        expect(result.hasTranslation, `Slug "${slug}" should have hasTranslation=true`).toBe(true);
      }
    });
  });

  describe('DEDICATED_ROUTE_SLUGS should have matching INTERACTIVE_TOOL_PATHS', () => {
    it('should have INTERACTIVE_TOOL_PATHS entry for each DEDICATED_ROUTE_SLUGS', async () => {
      const { DEDICATED_ROUTE_SLUGS } = await import('@/lib/seo/data-loader');

      const dedicatedSlugs = Array.from(DEDICATED_ROUTE_SLUGS);
      const interactivePathsKeys = Object.keys(INTERACTIVE_TOOL_PATHS);

      // Every dedicated route slug should have a corresponding path in INTERACTIVE_TOOL_PATHS
      for (const slug of dedicatedSlugs) {
        expect(
          INTERACTIVE_TOOL_PATHS[slug as keyof typeof INTERACTIVE_TOOL_PATHS],
          `DEDICATED_ROUTE_SLUG "${slug}" should have matching INTERACTIVE_TOOL_PATHS entry`
        ).toBeDefined();
      }

      // Every INTERACTIVE_TOOL_PATHS key should be in DEDICATED_ROUTE_SLUGS
      for (const slug of interactivePathsKeys) {
        expect(
          DEDICATED_ROUTE_SLUGS.has(slug),
          `INTERACTIVE_TOOL_PATHS key "${slug}" should be in DEDICATED_ROUTE_SLUGS`
        ).toBe(true);
      }

      // Sets should be equivalent
      const dedicatedSet = new Set(dedicatedSlugs);
      const interactiveSet = new Set(interactivePathsKeys);
      expect(
        dedicatedSet,
        'DEDICATED_ROUTE_SLUGS and INTERACTIVE_TOOL_PATHS keys should match'
      ).toEqual(interactiveSet);
    });

    it('should have exactly 24 dedicated route slugs', async () => {
      const { DEDICATED_ROUTE_SLUGS } = await import('@/lib/seo/data-loader');

      // This count should match the known dedicated routes:
      // - 12 resize tools (image-resizer, bulk-image-resizer, + 10 social media)
      // - 10 convert tools (the base conversions plus four format expansions)
      // - 2 compress tools (image-compressor, bulk-image-compressor)
      expect(DEDICATED_ROUTE_SLUGS.size).toBe(24);
      expect(Object.keys(INTERACTIVE_TOOL_PATHS)).toHaveLength(24);
    });

    it('should have data entries for all DEDICATED_ROUTE_SLUGS', async () => {
      const { DEDICATED_ROUTE_SLUGS } = await import('@/lib/seo/data-loader');

      const dedicatedSlugs = Array.from(DEDICATED_ROUTE_SLUGS);

      // Load all data sources that may contain dedicated route slugs
      const interactiveToolsData = (await import('@/app/seo/data/interactive-tools.json')).default;
      const bulkToolsData = (await import('@/app/seo/data/bulk-tools.json')).default;
      const socialMediaResizeData = (await import('@/app/seo/data/social-media-resize.json'))
        .default;

      const allPages = [
        ...interactiveToolsData.pages,
        ...bulkToolsData.pages,
        ...socialMediaResizeData.pages,
      ];

      for (const slug of dedicatedSlugs) {
        const data = allPages.find((p: { slug: string }) => p.slug === slug);
        expect(
          data,
          `DEDICATED_ROUTE_SLUG "${slug}" should have data in interactive-tools.json, bulk-tools.json, or social-media-resize.json`
        ).toBeDefined();
        expect(data?.slug).toBe(slug);
      }
    });
  });

  describe('getAllToolSlugs should not overlap with DEDICATED_ROUTE_SLUGS', () => {
    it('should have no intersection between getAllToolSlugs and DEDICATED_ROUTE_SLUGS', async () => {
      const { getAllToolSlugs, DEDICATED_ROUTE_SLUGS } = await import('@/lib/seo/data-loader');

      const allToolSlugs = await getAllToolSlugs();

      const intersection = allToolSlugs.filter(slug => DEDICATED_ROUTE_SLUGS.has(slug));

      expect(
        intersection,
        `getAllToolSlugs and DEDICATED_ROUTE_SLUGS should have no overlap. Found: ${intersection.join(', ')}`
      ).toEqual([]);
    });

    it('should not include specific dedicated route slugs', async () => {
      const { getAllToolSlugs } = await import('@/lib/seo/data-loader');

      const slugs = await getAllToolSlugs();

      // These slugs have dedicated sub-routes and should be filtered out
      const excludedSlugs = [
        'png-to-jpg',
        'jpg-to-png',
        'webp-to-jpg',
        'webp-to-png',
        'jpg-to-webp',
        'png-to-webp',
        'image-resizer',
        'bulk-image-resizer',
        'resize-image-for-instagram',
        'resize-image-for-youtube',
        'resize-image-for-facebook',
        'resize-image-for-twitter',
        'resize-image-for-linkedin',
        'image-compressor',
        'bulk-image-compressor',
      ];

      for (const excluded of excludedSlugs) {
        expect(
          slugs,
          `getAllToolSlugs should not include dedicated route slug "${excluded}"`
        ).not.toContain(excluded);
      }
    });
  });

  describe('sitemap tool URLs should match actual routes', () => {
    it('should have valid paths for all interactive tools in sitemap', async () => {
      // All paths should follow the pattern /tools/{subroute}/{slug}
      for (const [slug, path] of Object.entries(INTERACTIVE_TOOL_PATHS)) {
        expect(path.startsWith('/tools/'), `Path for "${slug}" should start with /tools/`).toBe(
          true
        );

        // Path should be in one of the valid sub-routes: resize, convert, compress
        const validSubroutes = ['/tools/resize/', '/tools/convert/', '/tools/compress/'];
        const hasValidSubroute = validSubroutes.some(subroute => path.startsWith(subroute));

        expect(
          hasValidSubroute,
          `Path "${path}" for "${slug}" should be in a valid subroute (resize, convert, or compress)`
        ).toBe(true);
      }
    });

    it('should map slugs to correct subroute categories', async () => {
      // Resize tools
      const resizeSlugs = [
        'image-resizer',
        'bulk-image-resizer',
        'resize-image-for-instagram',
        'resize-image-for-youtube',
        'resize-image-for-facebook',
        'resize-image-for-twitter',
        'resize-image-for-linkedin',
      ];

      for (const slug of resizeSlugs) {
        expect(
          INTERACTIVE_TOOL_PATHS[slug as keyof typeof INTERACTIVE_TOOL_PATHS],
          `Resize tool "${slug}" should map to /tools/resize/`
        ).toMatch(/^\/tools\/resize\//);
      }

      // Convert tools
      const convertSlugs = [
        'png-to-jpg',
        'jpg-to-png',
        'webp-to-jpg',
        'webp-to-png',
        'jpg-to-webp',
        'png-to-webp',
      ];

      for (const slug of convertSlugs) {
        expect(
          INTERACTIVE_TOOL_PATHS[slug as keyof typeof INTERACTIVE_TOOL_PATHS],
          `Convert tool "${slug}" should map to /tools/convert/`
        ).toMatch(/^\/tools\/convert\//);
      }

      // Compress tools
      const compressSlugs = ['image-compressor', 'bulk-image-compressor'];

      for (const slug of compressSlugs) {
        expect(
          INTERACTIVE_TOOL_PATHS[slug as keyof typeof INTERACTIVE_TOOL_PATHS],
          `Compress tool "${slug}" should map to /tools/compress/`
        ).toMatch(/^\/tools\/compress\//);
      }
    });

    it('should have static tool slugs map to /tools/{slug} pattern', async () => {
      const { getAllTools } = await import('@/lib/seo/data-loader');
      const { DEDICATED_ROUTE_SLUGS } = await import('@/lib/seo/data-loader');

      const staticTools = await getAllTools();

      // Static tools should not be in DEDICATED_ROUTE_SLUGS
      for (const tool of staticTools) {
        expect(
          DEDICATED_ROUTE_SLUGS.has(tool.slug),
          `Static tool "${tool.slug}" should not be in DEDICATED_ROUTE_SLUGS`
        ).toBe(false);
      }
    });
  });

  describe('route handler slug lists should match data', () => {
    it('should have all RESIZE_SLUGS in DEDICATED_ROUTE_SLUGS', async () => {
      const { DEDICATED_ROUTE_SLUGS } = await import('@/lib/seo/data-loader');

      // These must match app/(pseo)/tools/resize/[slug]/page.tsx
      const RESIZE_SLUGS = [
        'image-resizer',
        'resize-image-for-instagram',
        'resize-image-for-youtube',
        'resize-image-for-facebook',
        'resize-image-for-twitter',
        'resize-image-for-linkedin',
        'bulk-image-resizer',
      ];

      for (const slug of RESIZE_SLUGS) {
        expect(
          DEDICATED_ROUTE_SLUGS.has(slug),
          `RESIZE_SLUG "${slug}" should be in DEDICATED_ROUTE_SLUGS`
        ).toBe(true);
      }
    });

    it('should have all CONVERSION_SLUGS in DEDICATED_ROUTE_SLUGS', async () => {
      const { DEDICATED_ROUTE_SLUGS } = await import('@/lib/seo/data-loader');

      // These must match app/(pseo)/tools/convert/[slug]/page.tsx
      const CONVERSION_SLUGS = [
        'png-to-jpg',
        'jpg-to-png',
        'webp-to-jpg',
        'webp-to-png',
        'jpg-to-webp',
        'png-to-webp',
      ];

      for (const slug of CONVERSION_SLUGS) {
        expect(
          DEDICATED_ROUTE_SLUGS.has(slug),
          `CONVERSION_SLUG "${slug}" should be in DEDICATED_ROUTE_SLUGS`
        ).toBe(true);
      }
    });

    it('should have all COMPRESS_SLUGS in DEDICATED_ROUTE_SLUGS', async () => {
      const { DEDICATED_ROUTE_SLUGS } = await import('@/lib/seo/data-loader');

      // These must match app/(pseo)/tools/compress/[slug]/page.tsx
      const COMPRESS_SLUGS = ['image-compressor', 'bulk-image-compressor'];

      for (const slug of COMPRESS_SLUGS) {
        expect(
          DEDICATED_ROUTE_SLUGS.has(slug),
          `COMPRESS_SLUG "${slug}" should be in DEDICATED_ROUTE_SLUGS`
        ).toBe(true);
      }
    });

    it('should have data for all RESIZE_SLUGS', async () => {
      const { getInteractiveToolData, getBulkToolsData } = await import('@/lib/seo/data-loader');

      // Load social-media-resize data directly since there's no loader function for it
      const socialMediaResizeData = (await import('@/app/seo/data/social-media-resize.json'))
        .default;

      const RESIZE_SLUGS = [
        'image-resizer',
        'resize-image-for-instagram',
        'resize-image-for-youtube',
        'resize-image-for-facebook',
        'resize-image-for-twitter',
        'resize-image-for-linkedin',
        'bulk-image-resizer',
      ];

      for (const slug of RESIZE_SLUGS) {
        // Try interactive-tools first, then bulk-tools, then social-media-resize
        let data = await getInteractiveToolData(slug);
        if (!data) {
          data = await getBulkToolsData(slug);
        }
        if (!data) {
          data = socialMediaResizeData.pages.find((p: { slug: string }) => p.slug === slug);
        }
        expect(
          data,
          `RESIZE_SLUG "${slug}" should have data in interactive-tools.json, bulk-tools.json, or social-media-resize.json`
        ).not.toBeNull();
      }
    });

    it('should have data for all CONVERSION_SLUGS', async () => {
      const { getInteractiveToolData } = await import('@/lib/seo/data-loader');

      const CONVERSION_SLUGS = [
        'png-to-jpg',
        'jpg-to-png',
        'webp-to-jpg',
        'webp-to-png',
        'jpg-to-webp',
        'png-to-webp',
      ];

      for (const slug of CONVERSION_SLUGS) {
        const data = await getInteractiveToolData(slug);
        expect(
          data,
          `CONVERSION_SLUG "${slug}" should have data in interactive-tools.json`
        ).not.toBeNull();
      }
    });

    it('should have data for all COMPRESS_SLUGS', async () => {
      const { getInteractiveToolData, getBulkToolsData } = await import('@/lib/seo/data-loader');

      const COMPRESS_SLUGS = ['image-compressor', 'bulk-image-compressor'];

      for (const slug of COMPRESS_SLUGS) {
        // Try interactive-tools first, then bulk-tools
        let data = await getInteractiveToolData(slug);
        if (!data) {
          data = await getBulkToolsData(slug);
        }
        expect(
          data,
          `COMPRESS_SLUG "${slug}" should have data in interactive-tools.json or bulk-tools.json`
        ).not.toBeNull();
      }
    });
  });
});
