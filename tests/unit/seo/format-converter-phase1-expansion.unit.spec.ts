/**
 * SEO and data-integrity tests for the Phase 1 pSEO tool expansion (issue #98).
 *
 * Covers four new FormatConverter variations:
 *   - bmp-to-png, gif-to-png, gif-to-webp, bmp-to-webp
 *
 * Guards:
 *  1. All four slugs exist in interactive-tools.json
 *  2. metaTitle / metaDescription lengths within Google limits
 *  3. No duplicate metaTitle across the full FormatConverter family
 *  4. toolComponent correctly set and toolConfig matches expected shape
 *  5. Every slug is registered in the sitemap path map and renders under /tools/convert/
 *  6. relatedTools cross-references resolve to real slugs
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface IToolConfig {
  defaultTargetFormat?: string;
  acceptedInputFormats?: string[];
}

interface IPSEOPage {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  toolComponent?: string;
  toolConfig?: IToolConfig;
  isInteractive?: boolean;
  relatedTools?: string[];
  faq?: unknown[];
  features?: unknown[];
}

interface IPSEOData {
  pages: IPSEOPage[];
}

const DATA_DIR = path.resolve(process.cwd(), 'app/seo/data');
const interactiveTools = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'interactive-tools.json'), 'utf-8')
) as IPSEOData;
const staticTools = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'tools.json'), 'utf-8')
) as IPSEOData;

const allToolSlugs = new Set<string>([
  ...interactiveTools.pages.map(p => p.slug),
  ...staticTools.pages.map(p => p.slug),
]);

const PHASE_1_NEW_SLUGS = ['bmp-to-png', 'gif-to-png', 'gif-to-webp', 'bmp-to-webp'] as const;

const EXPECTED_CONFIG: Record<(typeof PHASE_1_NEW_SLUGS)[number], IToolConfig> = {
  'bmp-to-png': { defaultTargetFormat: 'png', acceptedInputFormats: ['image/bmp'] },
  'gif-to-png': { defaultTargetFormat: 'png', acceptedInputFormats: ['image/gif'] },
  'gif-to-webp': { defaultTargetFormat: 'webp', acceptedInputFormats: ['image/gif'] },
  'bmp-to-webp': { defaultTargetFormat: 'webp', acceptedInputFormats: ['image/bmp'] },
};

function getPage(slug: string): IPSEOPage {
  const page = interactiveTools.pages.find(p => p.slug === slug);
  if (!page) throw new Error(`Slug "${slug}" not found in interactive-tools.json`);
  return page;
}

describe('Phase 1 FormatConverter expansion (issue #98) — data integrity', () => {
  describe('slug presence', () => {
    it.each(PHASE_1_NEW_SLUGS)('%s exists in interactive-tools.json', slug => {
      expect(() => getPage(slug)).not.toThrow();
    });
  });

  describe('metaTitle length (Google recommended ≤ 70 chars)', () => {
    it.each(PHASE_1_NEW_SLUGS)('%s metaTitle within limit', slug => {
      const { metaTitle } = getPage(slug);
      expect(metaTitle.length).toBeGreaterThan(0);
      expect(metaTitle.length).toBeLessThanOrEqual(70);
    });
  });

  describe('metaDescription length (120–160 chars optimal)', () => {
    it.each(PHASE_1_NEW_SLUGS)('%s metaDescription within limit', slug => {
      const { metaDescription } = getPage(slug);
      expect(metaDescription.length).toBeGreaterThanOrEqual(100);
      expect(metaDescription.length).toBeLessThanOrEqual(160);
    });
  });

  it('all FormatConverter metaTitles are unique (no accidental duplicates)', () => {
    const formatConverterPages = interactiveTools.pages.filter(
      p => p.toolComponent === 'FormatConverter'
    );
    const titles = formatConverterPages.map(p => p.metaTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('all FormatConverter h1 values are unique', () => {
    const formatConverterPages = interactiveTools.pages.filter(
      p => p.toolComponent === 'FormatConverter'
    );
    const h1s = formatConverterPages.map(p => (p as unknown as { h1: string }).h1);
    expect(new Set(h1s).size).toBe(h1s.length);
  });

  describe('toolComponent wiring', () => {
    it.each(PHASE_1_NEW_SLUGS)('%s is interactive and wired to FormatConverter', slug => {
      const page = getPage(slug);
      expect(page.isInteractive).toBe(true);
      expect(page.toolComponent).toBe('FormatConverter');
    });
  });

  describe('toolConfig matches expansion matrix', () => {
    it.each(PHASE_1_NEW_SLUGS)('%s has correct toolConfig', slug => {
      const page = getPage(slug);
      expect(page.toolConfig).toBeDefined();
      expect(page.toolConfig?.defaultTargetFormat).toBe(EXPECTED_CONFIG[slug].defaultTargetFormat);
      expect(page.toolConfig?.acceptedInputFormats).toEqual(
        EXPECTED_CONFIG[slug].acceptedInputFormats
      );
    });
  });

  describe('relatedTools cross-references resolve', () => {
    it.each(PHASE_1_NEW_SLUGS)('%s relatedTools all exist', slug => {
      const page = getPage(slug);
      for (const related of page.relatedTools ?? []) {
        expect(
          allToolSlugs.has(related),
          `${slug} references missing related slug "${related}"`
        ).toBe(true);
      }
    });
  });

  describe('content completeness', () => {
    it.each(PHASE_1_NEW_SLUGS)('%s has ≥5 features and ≥5 FAQs', slug => {
      const page = getPage(slug);
      expect(page.features?.length ?? 0).toBeGreaterThanOrEqual(5);
      expect(page.faq?.length ?? 0).toBeGreaterThanOrEqual(5);
    });
  });
});

describe('Phase 1 FormatConverter expansion — sitemap registration', () => {
  // Read sitemap route source and extract the INTERACTIVE_TOOL_PATHS map
  const sitemapSource = fs.readFileSync(
    path.resolve(process.cwd(), 'app/sitemap-tools.xml/route.ts'),
    'utf-8'
  );

  it.each(PHASE_1_NEW_SLUGS)('%s is mapped to /tools/convert/%s in sitemap', slug => {
    const expectedMapping = `'${slug}': '/tools/convert/${slug}'`;
    expect(sitemapSource).toContain(expectedMapping);
  });

  it('converter subroute registers the four new slugs', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'app/(pseo)/tools/convert/[slug]/page.tsx'),
      'utf-8'
    );
    for (const slug of PHASE_1_NEW_SLUGS) {
      expect(pageSource).toContain(`'${slug}'`);
    }
  });
});
