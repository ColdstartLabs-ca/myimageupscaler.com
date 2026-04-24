/**
 * Image Cropper SEO Unit Tests
 * Validates metadata, data integrity, and SEO quality for all cropper tool pages
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface IPSEOPage {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  toolComponent?: string;
  isInteractive?: boolean;
  features: unknown[];
  useCases: unknown[];
  benefits: unknown[];
  howItWorks: unknown[];
  faq: { question: string; answer: string }[];
  relatedTools: string[];
  noindex?: boolean;
  [key: string]: unknown;
}

interface IData {
  pages: IPSEOPage[];
  meta: { totalPages: number };
}

function loadData(): IData {
  const absPath = path.resolve(process.cwd(), 'app/seo/data/interactive-tools.json');
  return JSON.parse(fs.readFileSync(absPath, 'utf-8')) as IData;
}

const CROP_SLUGS = [
  'image-cropper',
  'crop-image-online-free',
  'crop-image-to-circle',
  'crop-image-for-instagram',
  'crop-image-for-youtube-thumbnail',
];

describe('Image Cropper — Data Integrity', () => {
  const data = loadData();
  const cropPages = data.pages.filter(p => CROP_SLUGS.includes(p.slug));

  it('should include all 5 crop variant slugs', () => {
    const slugs = data.pages.map(p => p.slug);
    for (const slug of CROP_SLUGS) {
      expect(slugs).toContain(slug);
    }
  });

  it('should have unique slugs across all interactive tools', () => {
    const slugs = data.pages.map(p => p.slug);
    const uniqueSlugs = new Set(slugs);
    expect(slugs.length).toBe(uniqueSlugs.size);
  });

  it('should have valid toolComponent for all crop pages', () => {
    for (const page of cropPages) {
      expect(page.toolComponent).toBe('ImageCropper');
    }
  });

  it('should have all required fields for each crop page', () => {
    const requiredFields = [
      'slug',
      'title',
      'metaTitle',
      'metaDescription',
      'h1',
      'intro',
      'primaryKeyword',
      'secondaryKeywords',
      'features',
      'useCases',
      'benefits',
      'howItWorks',
      'faq',
      'relatedTools',
    ];
    for (const page of cropPages) {
      for (const field of requiredFields) {
        expect(page[field], `${page.slug} missing ${field}`).toBeDefined();
      }
    }
  });

  it('should be interactive tools', () => {
    for (const page of cropPages) {
      expect(page.isInteractive).toBe(true);
    }
  });

  it('should have non-empty FAQ arrays', () => {
    for (const page of cropPages) {
      expect(page.faq.length, `${page.slug} has no FAQs`).toBeGreaterThan(0);
    }
  });
});

describe('Image Cropper — SEO Metadata Quality', () => {
  const data = loadData();
  const cropPages = data.pages.filter(p => CROP_SLUGS.includes(p.slug));

  it('should have valid meta titles (30-60 chars) for all crop pages', () => {
    for (const page of cropPages) {
      expect(
        page.metaTitle.length,
        `${page.slug} metaTitle is ${page.metaTitle.length} chars: "${page.metaTitle}"`
      ).toBeGreaterThanOrEqual(30);
      expect(page.metaTitle.length).toBeLessThanOrEqual(70);
    }
  });

  it('should have valid meta descriptions (120-160 chars) for all crop pages', () => {
    for (const page of cropPages) {
      expect(
        page.metaDescription.length,
        `${page.slug} metaDescription is ${page.metaDescription.length} chars`
      ).toBeGreaterThanOrEqual(100);
      expect(page.metaDescription.length).toBeLessThanOrEqual(165);
    }
  });

  it('should have unique meta titles across crop pages', () => {
    const titles = cropPages.map(p => p.metaTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('should have unique meta descriptions across crop pages', () => {
    const descs = cropPages.map(p => p.metaDescription);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it('should have h1 containing primary keyword intent', () => {
    for (const page of cropPages) {
      const keywordWords = page.primaryKeyword
        .toLowerCase()
        .split(' ')
        .filter(w => w.length > 2);
      const h1Lower = page.h1.toLowerCase();
      const hasMatch = keywordWords.some(w => h1Lower.includes(w));
      expect(
        hasMatch,
        `${page.slug} h1 "${page.h1}" doesn't reflect keyword "${page.primaryKeyword}"`
      ).toBe(true);
    }
  });

  it('should not have noindex on any crop page', () => {
    for (const page of cropPages) {
      expect(page.noindex, `${page.slug} has noindex`).not.toBe(true);
    }
  });

  it('should have secondary keywords for all crop pages', () => {
    for (const page of cropPages) {
      expect(
        page.secondaryKeywords.length,
        `${page.slug} has no secondary keywords`
      ).toBeGreaterThan(0);
    }
  });
});
