/**
 * pSEO Keyword Alignment Tests
 * Validates that pSEO pages have upscaler-aligned keywords and proper meta fields.
 * These categories had zero Google impressions due to generic/disconnected keywords.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock the clientEnv (required by localization-config)
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

function loadCategory(category: string): IPSEOData {
  const filePath = path.join(DATA_DIR, `${category}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('pSEO Keyword Alignment', () => {
  describe('photo-restoration', () => {
    const data = loadCategory('photo-restoration');

    it('should have 5 pages', () => {
      expect(data.pages).toHaveLength(5);
    });

    it('all pages should have "upscale" in primaryKeyword', () => {
      data.pages.forEach(page => {
        expect(page.primaryKeyword.toLowerCase()).toContain('upscale');
      });
    });

    it('all pages should have "upscale" in metaTitle', () => {
      data.pages.forEach(page => {
        expect(page.metaTitle.toLowerCase()).toContain('upscale');
      });
    });

    it('all pages should have "upscale" in at least one secondaryKeyword', () => {
      data.pages.forEach(page => {
        const hasUpscale = page.secondaryKeywords.some(kw => kw.toLowerCase().includes('upscale'));
        expect(hasUpscale).toBe(true);
      });
    });
  });

  describe('device-optimization', () => {
    const data = loadCategory('device-optimization');

    it('should have 5 pages', () => {
      expect(data.pages).toHaveLength(5);
    });

    it('all pages should have "upscale" in primaryKeyword', () => {
      data.pages.forEach(page => {
        expect(page.primaryKeyword.toLowerCase()).toContain('upscale');
      });
    });

    it('all pages should target consumer audience (no developer jargon)', () => {
      const devJargon = ['app thinning', 'bitmap recycling', 'drawable density', 'srcset'];
      data.pages.forEach(page => {
        devJargon.forEach(jargon => {
          expect(page.primaryKeyword.toLowerCase()).not.toContain(jargon);
          expect(page.metaTitle.toLowerCase()).not.toContain(jargon);
          expect(page.metaDescription.toLowerCase()).not.toContain(jargon);
        });
      });
    });
  });

  describe('industry-insights', () => {
    const data = loadCategory('industry-insights');

    it('should have 14 pages', () => {
      expect(data.pages).toHaveLength(14);
    });

    it('all pages should have "upscale" in primaryKeyword', () => {
      data.pages.forEach(page => {
        expect(page.primaryKeyword.toLowerCase()).toContain('upscale');
      });
    });

    it('all pages should have "upscale" in metaTitle', () => {
      data.pages.forEach(page => {
        expect(page.metaTitle.toLowerCase()).toContain('upscale');
      });
    });
  });

  describe('content (already aligned)', () => {
    const data = loadCategory('content');

    it('should have 8 pages', () => {
      expect(data.pages).toHaveLength(8);
    });

    it('all pages should have "upscale" in primaryKeyword', () => {
      data.pages.forEach(page => {
        expect(page.primaryKeyword.toLowerCase()).toContain('upscale');
      });
    });
  });

  describe('camera-raw (already aligned)', () => {
    const data = loadCategory('camera-raw');

    it('should have 8 pages', () => {
      expect(data.pages).toHaveLength(8);
    });

    it('all pages should have "upscale" in primaryKeyword', () => {
      data.pages.forEach(page => {
        expect(page.primaryKeyword.toLowerCase()).toContain('upscale');
      });
    });
  });

  describe('ai-features (zombie category)', () => {
    const data = loadCategory('ai-features');

    it('should have 0 pages', () => {
      expect(data.pages).toHaveLength(0);
    });

    it('should not be included in ENGLISH_ONLY_CATEGORIES', async () => {
      // ai-features is excluded from ENGLISH_ONLY_CATEGORIES because it has 0 pages
      const { ENGLISH_ONLY_CATEGORIES } = await import('@/lib/seo/localization-config');
      expect(ENGLISH_ONLY_CATEGORIES).not.toContain('ai-features');
    });
  });
});

describe('pSEO Data Quality', () => {
  const categories = [
    'photo-restoration',
    'device-optimization',
    'industry-insights',
    'content',
    'camera-raw',
    'bulk-tools',
  ];

  categories.forEach(category => {
    describe(`${category} data quality`, () => {
      const data = loadCategory(category);

      it('all pages should have non-empty metaTitle', () => {
        data.pages.forEach(page => {
          expect(page.metaTitle).toBeTruthy();
          expect(page.metaTitle.length).toBeGreaterThan(10);
        });
      });

      it('all pages should have metaTitle under 70 characters', () => {
        data.pages.forEach(page => {
          expect(page.metaTitle.length).toBeLessThanOrEqual(70);
        });
      });

      it('all pages should have non-empty metaDescription', () => {
        data.pages.forEach(page => {
          expect(page.metaDescription).toBeTruthy();
          expect(page.metaDescription.length).toBeGreaterThan(50);
        });
      });

      it('all pages should have metaDescription under 160 characters', () => {
        data.pages.forEach(page => {
          expect(page.metaDescription.length).toBeLessThanOrEqual(160);
        });
      });

      it('all pages should have non-empty primaryKeyword', () => {
        data.pages.forEach(page => {
          expect(page.primaryKeyword).toBeTruthy();
          expect(page.primaryKeyword.length).toBeGreaterThan(3);
        });
      });

      it('all pages should have at least 2 secondaryKeywords', () => {
        data.pages.forEach(page => {
          expect(page.secondaryKeywords.length).toBeGreaterThanOrEqual(2);
        });
      });

      it('all pages should have unique slugs', () => {
        const slugs = data.pages.map(p => p.slug);
        const uniqueSlugs = new Set(slugs);
        expect(uniqueSlugs.size).toBe(slugs.length);
      });

      it('no duplicate primaryKeywords across pages', () => {
        const keywords = data.pages.map(p => p.primaryKeyword.toLowerCase());
        const uniqueKeywords = new Set(keywords);
        expect(uniqueKeywords.size).toBe(keywords.length);
      });
    });
  });
});
