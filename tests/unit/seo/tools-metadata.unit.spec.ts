/**
 * Tools Metadata Unit Tests — Phase 2 (CTR Fix)
 *
 * Verifies that the ai-image-upscaler entry in tools.json has the
 * optimized metaTitle and metaDescription for improved SERP CTR.
 *
 * Key invariants:
 * - metaTitle includes "Free" (CTR trigger word)
 * - metaTitle is not pre-branded because the pSEO layout appends the site brand
 * - metaTitle is within Google's SERP title display limit (~70 chars)
 * - metaDescription is within Google's SERP description limit (160 chars)
 *
 * Also holds the general interactive tool metadata contract:
 * - required interactive tool slugs exist
 * - metaTitle / metaDescription are non-empty and within Google limits
 * - relatedTools resolve against both tools catalogues
 * - image-to-text and ocr-online keep distinct primary keywords
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface IPSEOPage {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  relatedTools?: string[];
  [key: string]: unknown;
}

interface IPSEOData {
  pages: IPSEOPage[];
}

const DATA_DIR = path.resolve(process.cwd(), 'app/seo/data');

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')) as T;
}

function loadToolsJson(): IPSEOData {
  return loadJson<IPSEOData>('tools.json');
}

describe('Tools Metadata — ai-image-upscaler CTR optimization', () => {
  const tools = loadToolsJson();
  const page = tools.pages.find(p => p.slug === 'ai-image-upscaler');

  it('ai-image-upscaler entry should exist in tools.json', () => {
    expect(page).toBeDefined();
  });

  it('should include "Free" in ai-image-upscaler metaTitle', () => {
    expect(page!.metaTitle).toMatch(/Free/i);
  });

  it('should have metaTitle under 70 chars for ai-image-upscaler', () => {
    expect(page!.metaTitle.length).toBeLessThanOrEqual(70);
  });

  it('should have metaDescription under 160 chars for ai-image-upscaler', () => {
    expect(page!.metaDescription.length).toBeLessThanOrEqual(160);
  });

  it('metaTitle should not pre-include the brand because the layout appends it', () => {
    expect(page!.metaTitle).not.toContain('MyImageUpscaler');
  });

  it('metaTitle should mention 8x upscaling capability', () => {
    expect(page!.metaTitle).toContain('8x');
  });

  it('metaDescription should explain the free signup offer', () => {
    expect(page!.metaDescription).toMatch(/free account/i);
    expect(page!.metaDescription).toMatch(/free credits/i);
  });

  it('metaDescription should mention "no watermarks"', () => {
    expect(page!.metaDescription).toMatch(/without a watermark/i);
  });
});

describe('Interactive tool metadata contract', () => {
  const interactiveTools = loadJson<IPSEOData>('interactive-tools.json');
  const staticTools = loadToolsJson();

  const allToolSlugs = new Set<string>([
    ...interactiveTools.pages.map(p => p.slug),
    ...staticTools.pages.map(p => p.slug),
  ]);

  const REQUIRED_SLUGS = [
    'background-changer',
    'heic-to-jpg',
    'heic-to-png',
    'pdf-to-jpg',
    'pdf-to-png',
    'image-to-pdf',
    'jpg-to-pdf',
    'image-to-text',
  ];

  function getInteractivePage(slug: string): IPSEOPage {
    const page = interactiveTools.pages.find(p => p.slug === slug);
    if (!page) throw new Error(`Slug "${slug}" not found in interactive-tools.json`);
    return page;
  }

  describe('required slugs exist in interactive-tools.json', () => {
    it.each(REQUIRED_SLUGS)('%s is present', slug => {
      expect(() => getInteractivePage(slug)).not.toThrow();
    });
  });

  describe('metaTitle length ≤ 70 characters', () => {
    it.each(REQUIRED_SLUGS)('%s metaTitle is within limit', slug => {
      const { metaTitle } = getInteractivePage(slug);
      expect(metaTitle.length).toBeLessThanOrEqual(70);
      expect(metaTitle.length).toBeGreaterThan(0);
    });
  });

  describe('metaDescription length ≤ 160 characters', () => {
    it.each(REQUIRED_SLUGS)('%s metaDescription is within limit', slug => {
      const { metaDescription } = getInteractivePage(slug);
      expect(metaDescription.length).toBeLessThanOrEqual(160);
      expect(metaDescription.length).toBeGreaterThan(0);
    });
  });

  describe('relatedTools cross-references resolve to real slugs', () => {
    it.each(REQUIRED_SLUGS)('%s relatedTools are all valid slugs', slug => {
      const page = getInteractivePage(slug);
      (page.relatedTools ?? []).forEach(related => {
        expect(allToolSlugs.has(related)).toBe(true);
      });
    });
  });

  describe('cannibalization — image-to-text vs ocr-online', () => {
    it('image-to-text and ocr-online have different primaryKeywords', () => {
      const imageToText = getInteractivePage('image-to-text');
      const ocrOnline = interactiveTools.pages.find(p => p.slug === 'ocr-online');
      // Both tools exist and serve same user intent — must have distinct primary keywords
      // so Google doesn't split ranking signals across them.
      if (ocrOnline) {
        expect(imageToText.primaryKeyword.toLowerCase()).not.toBe(
          ocrOnline.primaryKeyword.toLowerCase()
        );
      }
    });
  });
});
