/**
 * pSEO Duplicate Slug Tests
 * Verifies that slugs are unique across ALL pSEO data files.
 * Duplicate slugs cause SEO issues: canonical confusion, split ranking signals, and sitemap bloat.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock clientEnv (required by localization-config)
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

const DATA_DIR = path.join(process.cwd(), 'app/seo/data');

interface IPSEOPage {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  [key: string]: unknown;
}

interface IPSEOData {
  category: string;
  pages: IPSEOPage[];
  meta: { totalPages: number };
}

interface ISlugEntry {
  slug: string;
  files: string[];
  category?: string;
}

function loadCategory(category: string): IPSEOData {
  const filePath = path.join(DATA_DIR, `${category}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getAllPSEOCategories(): string[] {
  const files = fs.readdirSync(DATA_DIR);
  return files.filter(file => file.endsWith('.json')).map(file => file.replace('.json', ''));
}

describe('pSEO Duplicate Slug Prevention', () => {
  let slugMap: Map<string, ISlugEntry>;

  beforeAll(() => {
    // Build map of all slugs across all files
    slugMap = new Map();
    const categories = getAllPSEOCategories();

    categories.forEach(category => {
      try {
        const data = loadCategory(category);
        data.pages.forEach(page => {
          const slug = page.slug;
          if (!slugMap.has(slug)) {
            slugMap.set(slug, {
              slug,
              files: [],
              category,
            });
          }
          slugMap.get(slug)!.files.push(`${category}.json`);
        });
      } catch (e) {
        // Skip files that can't be parsed (non-pSEO files)
      }
    });
  });

  it('should have no duplicate slugs across all pSEO data files', () => {
    const duplicates: ISlugEntry[] = [];

    for (const [slug, entry] of slugMap.entries()) {
      if (entry.files.length > 1) {
        duplicates.push(entry);
      }
    }

    // Format error message if duplicates found
    if (duplicates.length > 0) {
      const duplicateMessages = duplicates.map(d =>
        `- "${d.slug}" appears in: ${d.files.join(', ')}`
      ).join('\n');
      throw new Error(
        `Found ${duplicates.length} duplicate slug(s) across pSEO data files:\n${duplicateMessages}\n\n` +
        'Each slug must be unique across all files to prevent SEO issues. ' +
        'Keep the slug in the most specific/primary category file and remove from others.'
      );
    }

    expect(duplicates.length).toBe(0);
  });

  it('should have more than 300 total unique slugs', () => {
    // The site should have a substantial number of pSEO pages
    // This test ensures we haven't accidentally deleted content
    expect(slugMap.size).toBeGreaterThan(300);
  });

  it('should document expected page count in metadata', () => {
    const categories = getAllPSEOCategories();
    const mismatches: Array<{ file: string; expected: number; actual: number }> = [];

    categories.forEach(category => {
      try {
        const data = loadCategory(category);
        if (data.meta && data.meta.totalPages !== undefined) {
          const actual = data.pages.length;
          const expected = data.meta.totalPages;

          if (actual !== expected) {
            mismatches.push({
              file: `${category}.json`,
              expected,
              actual,
            });
          }
        }
      } catch (e) {
        // Skip non-parseable files
      }
    });

    if (mismatches.length > 0) {
      const messages = mismatches.map(m =>
        `- ${m.file}: meta.totalPages=${m.expected} but actual pages=${m.actual}`
      ).join('\n');
      throw new Error(
        `Page count metadata mismatches found:\n${messages}\n\n` +
        'Update the meta.totalPages to match the actual number of pages in the file.'
      );
    }

    expect(mismatches.length).toBe(0);
  });

  describe('common duplicate patterns to watch', () => {
    /**
     * These are common patterns that historically caused duplicates.
     * This test documents them and ensures they don't happen again.
     */
    it('should not duplicate image-resizer (interactive vs tools)', () => {
      const entry = slugMap.get('image-resizer');
      expect(entry).toBeDefined();

      // Should only appear in one file
      expect(entry!.files.length).toBe(1);

      // If it exists, document which file it should be in
      if (entry!.files[0] === 'interactive-tools.json') {
        // image-resizer is a single-image tool, belongs in interactive-tools
        expect(entry!.files[0]).toBe('interactive-tools.json');
      } else if (entry!.files[0] === 'bulk-tools.json') {
        // bulk-image-resizer would be the bulk variant
        expect(entry!.files[0]).toBe('bulk-tools.json');
      }
    });

    it('should not duplicate image-compressor (interactive vs tools)', () => {
      const entry = slugMap.get('image-compressor');
      expect(entry).toBeDefined();
      expect(entry!.files.length).toBe(1);
    });

    it('should not duplicate format converters (interactive vs free)', () => {
      const converters = [
        'png-to-jpg',
        'jpg-to-png',
        'webp-to-jpg',
        'webp-to-png',
        'jpg-to-webp',
        'png-to-webp',
      ];

      converters.forEach(slug => {
        const entry = slugMap.get(slug);
        if (entry) {
          expect(entry.files.length).toBe(1);
          // These belong in interactive-tools.json as single-file converters
          expect(entry.files[0]).toBe('interactive-tools.json');
        }
      });
    });
  });

  describe('slug uniqueness by functional type', () => {
    /**
     * Ensure that similar functionality doesn't create duplicate slugs.
     * E.g., single-image tools vs bulk-image tools vs free variants.
     */

    it('should separate single-image tools from bulk variants', () => {
      // Single-image tool (in interactive-tools or tools)
      const imageResizer = slugMap.get('image-resizer');

      // Bulk variant (in bulk-tools)
      const bulkImageResizer = slugMap.get('bulk-image-resizer');

      // Both should exist (if applicable) but be distinct slugs
      if (imageResizer && bulkImageResizer) {
        expect(imageResizer.slug).not.toBe(bulkImageResizer.slug);
        expect(imageResizer.files.length).toBe(1);
        expect(bulkImageResizer.files.length).toBe(1);
      }
    });

    it('should distinguish free variants from main tools', () => {
      // Free variants have "free-" prefix
      const freeImageUpscaler = slugMap.get('free-image-upscaler');
      const mainImageUpscaler = slugMap.get('ai-image-upscaler');

      // Both can exist but must have different slugs
      if (freeImageUpscaler && mainImageUpscaler) {
        expect(freeImageUpscaler.slug).toContain('free-');
        expect(mainImageUpscaler.slug).not.toContain('free-');
      }
    });
  });
});
