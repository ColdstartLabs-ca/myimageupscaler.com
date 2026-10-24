/**
 * SEO metadata quality tests for new interactive tools added in PR #13.
 *
 * Guards:
 *  1. metaTitle / metaDescription lengths within Google limits
 *  2. relatedTools cross-references resolve to real slugs (no broken links)
 *  3. image-to-text vs ocr-online don't share the same primaryKeyword (cannibalization)
 *  4. All new tools are present in the interactive-tools.json data file
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

const interactiveTools = loadJson<IPSEOData>('interactive-tools.json');
const staticTools = loadJson<IPSEOData>('tools.json');

// All slugs available for relatedTools cross-reference validation
const allToolSlugs = new Set<string>([
  ...interactiveTools.pages.map(p => p.slug),
  ...staticTools.pages.map(p => p.slug),
]);

const NEW_SLUGS = [
  'background-changer',
  'heic-to-jpg',
  'heic-to-png',
  'pdf-to-jpg',
  'pdf-to-png',
  'image-to-pdf',
  'jpg-to-pdf',
  'image-to-text',
];

function getPage(slug: string): IPSEOPage {
  const page = interactiveTools.pages.find(p => p.slug === slug);
  if (!page) throw new Error(`Slug "${slug}" not found in interactive-tools.json`);
  return page;
}

describe('PR #13 new interactive tools — SEO metadata', () => {
  describe('All new slugs exist in interactive-tools.json', () => {
    it.each(NEW_SLUGS)('%s is present', slug => {
      expect(() => getPage(slug)).not.toThrow();
    });
  });

  describe('metaTitle length ≤ 70 characters', () => {
    it.each(NEW_SLUGS)('%s metaTitle is within limit', slug => {
      const { metaTitle } = getPage(slug);
      expect(metaTitle.length).toBeLessThanOrEqual(70);
      expect(metaTitle.length).toBeGreaterThan(0);
    });
  });

  describe('metaDescription length ≤ 160 characters', () => {
    it.each(NEW_SLUGS)('%s metaDescription is within limit', slug => {
      const { metaDescription } = getPage(slug);
      expect(metaDescription.length).toBeLessThanOrEqual(160);
      expect(metaDescription.length).toBeGreaterThan(0);
    });
  });

  describe('relatedTools cross-references resolve to real slugs', () => {
    it.each(NEW_SLUGS)('%s relatedTools are all valid slugs', slug => {
      const page = getPage(slug);
      (page.relatedTools ?? []).forEach(related => {
        expect(allToolSlugs.has(related)).toBe(true);
      });
    });
  });

  describe('Cannibalization — image-to-text vs ocr-online', () => {
    it('image-to-text and ocr-online have different primaryKeywords', () => {
      const imageToText = getPage('image-to-text');
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
