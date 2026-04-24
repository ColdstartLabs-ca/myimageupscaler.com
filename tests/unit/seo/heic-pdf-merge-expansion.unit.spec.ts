/**
 * SEO and data-integrity tests for Phase 5 pSEO tool expansion.
 *
 * Covers five new tool variations:
 *   - heic-to-webp  → HeicConverter  { defaultOutputFormat: 'webp' }
 *   - pdf-to-webp   → PdfToImageConverter { defaultOutputFormat: 'webp', defaultDpi: 150 }
 *   - pdf-to-jpg-hq → PdfToImageConverter { defaultOutputFormat: 'jpeg', defaultDpi: 300 }
 *   - pdf-to-png-hq → PdfToImageConverter { defaultOutputFormat: 'png',  defaultDpi: 300 }
 *   - merge-images-to-pdf → ImageToPdfConverter { acceptedInputFormats: [...] }
 *
 * Guards:
 *  1. All 5 slugs exist in interactive-tools.json
 *  2. metaTitle ≤70 chars, metaDescription 100–160 chars
 *  3. heic-to-webp toolConfig.defaultOutputFormat === 'webp'
 *  4. pdf-to-jpg-hq toolConfig.defaultDpi === 300
 *  5. All 5 slugs mapped in the sitemap route file
 *  6. relatedTools all resolve to real slugs
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface IToolConfig {
  defaultOutputFormat?: string;
  defaultDpi?: number;
  acceptedInputFormats?: string[];
}

interface IPSEOPage {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  primaryKeyword: string;
  toolComponent?: string;
  toolConfig?: IToolConfig;
  isInteractive?: boolean;
  relatedTools?: string[];
  faq?: unknown[];
  features?: unknown[];
  useCases?: unknown[];
  benefits?: unknown[];
  howItWorks?: unknown[];
  maxFileSizeMB?: number;
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

const PHASE_5_SLUGS = [
  'heic-to-webp',
  'pdf-to-webp',
  'pdf-to-jpg-hq',
  'pdf-to-png-hq',
  'merge-images-to-pdf',
] as const;

function getPage(slug: string): IPSEOPage {
  const page = interactiveTools.pages.find(p => p.slug === slug);
  if (!page) throw new Error(`Slug "${slug}" not found in interactive-tools.json`);
  return page;
}

const sitemapSource = fs.readFileSync(
  path.resolve(process.cwd(), 'app/sitemap-tools.xml/route.ts'),
  'utf-8'
);

describe('Phase 5 HEIC/PDF/merge expansion — slug presence', () => {
  it.each(PHASE_5_SLUGS)('%s exists in interactive-tools.json', slug => {
    expect(() => getPage(slug)).not.toThrow();
  });
});

describe('Phase 5 — metaTitle length (≤70 chars)', () => {
  it.each(PHASE_5_SLUGS)('%s metaTitle within limit', slug => {
    const { metaTitle } = getPage(slug);
    expect(metaTitle.length).toBeGreaterThan(0);
    expect(metaTitle.length).toBeLessThanOrEqual(70);
  });
});

describe('Phase 5 — metaDescription length (100–160 chars)', () => {
  it.each(PHASE_5_SLUGS)('%s metaDescription within limits', slug => {
    const { metaDescription } = getPage(slug);
    expect(metaDescription.length).toBeGreaterThanOrEqual(100);
    expect(metaDescription.length).toBeLessThanOrEqual(160);
  });
});

describe('Phase 5 — toolConfig assertions', () => {
  it('heic-to-webp toolConfig.defaultOutputFormat === "webp"', () => {
    const page = getPage('heic-to-webp');
    expect(page.toolConfig).toBeDefined();
    expect(page.toolConfig?.defaultOutputFormat).toBe('webp');
  });

  it('heic-to-webp is wired to HeicConverter', () => {
    const page = getPage('heic-to-webp');
    expect(page.toolComponent).toBe('HeicConverter');
    expect(page.isInteractive).toBe(true);
  });

  it('pdf-to-jpg-hq toolConfig.defaultDpi === 300', () => {
    const page = getPage('pdf-to-jpg-hq');
    expect(page.toolConfig?.defaultDpi).toBe(300);
    expect(page.toolConfig?.defaultOutputFormat).toBe('jpeg');
  });

  it('pdf-to-png-hq toolConfig.defaultDpi === 300 with png output', () => {
    const page = getPage('pdf-to-png-hq');
    expect(page.toolConfig?.defaultDpi).toBe(300);
    expect(page.toolConfig?.defaultOutputFormat).toBe('png');
  });

  it('pdf-to-webp toolConfig.defaultDpi === 150 with webp output', () => {
    const page = getPage('pdf-to-webp');
    expect(page.toolConfig?.defaultDpi).toBe(150);
    expect(page.toolConfig?.defaultOutputFormat).toBe('webp');
  });

  it('merge-images-to-pdf toolConfig.acceptedInputFormats includes jpg, png, webp', () => {
    const page = getPage('merge-images-to-pdf');
    const formats = page.toolConfig?.acceptedInputFormats ?? [];
    expect(formats).toContain('image/jpeg');
    expect(formats).toContain('image/png');
    expect(formats).toContain('image/webp');
  });

  it('merge-images-to-pdf is wired to ImageToPdfConverter', () => {
    const page = getPage('merge-images-to-pdf');
    expect(page.toolComponent).toBe('ImageToPdfConverter');
    expect(page.isInteractive).toBe(true);
  });

  it('pdf-to-jpg-hq and pdf-to-png-hq are wired to PdfToImageConverter', () => {
    expect(getPage('pdf-to-jpg-hq').toolComponent).toBe('PdfToImageConverter');
    expect(getPage('pdf-to-png-hq').toolComponent).toBe('PdfToImageConverter');
    expect(getPage('pdf-to-webp').toolComponent).toBe('PdfToImageConverter');
  });
});

describe('Phase 5 — sitemap registration', () => {
  it.each(PHASE_5_SLUGS)('%s is mapped to /tools/convert/%s in sitemap', slug => {
    const expectedMapping = `'${slug}': '/tools/convert/${slug}'`;
    expect(sitemapSource).toContain(expectedMapping);
  });
});

describe('Phase 5 — relatedTools cross-references resolve', () => {
  it.each(PHASE_5_SLUGS)('%s relatedTools all exist', slug => {
    const page = getPage(slug);
    for (const related of page.relatedTools ?? []) {
      expect(
        allToolSlugs.has(related),
        `${slug} references missing related slug "${related}"`
      ).toBe(true);
    }
  });
});

describe('Phase 5 — content completeness', () => {
  it.each(PHASE_5_SLUGS)('%s has 5 features, 4 useCases, 3 benefits, 4 howItWorks, 6 faq', slug => {
    const page = getPage(slug);
    expect((page.features ?? []).length).toBeGreaterThanOrEqual(5);
    expect((page.useCases ?? []).length).toBeGreaterThanOrEqual(4);
    expect((page.benefits ?? []).length).toBeGreaterThanOrEqual(3);
    expect((page.howItWorks ?? []).length).toBeGreaterThanOrEqual(4);
    expect((page.faq ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it.each(PHASE_5_SLUGS)('%s has unique h1 across all phase 5 pages', () => {
    const h1s = PHASE_5_SLUGS.map(s => getPage(s).h1);
    expect(new Set(h1s).size).toBe(h1s.length);
  });

  it.each(PHASE_5_SLUGS)('%s has unique metaTitle across all phase 5 pages', () => {
    const titles = PHASE_5_SLUGS.map(s => getPage(s).metaTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(PHASE_5_SLUGS)('%s has maxFileSizeMB set', slug => {
    const page = getPage(slug);
    expect(page.maxFileSizeMB).toBeGreaterThan(0);
  });
});
