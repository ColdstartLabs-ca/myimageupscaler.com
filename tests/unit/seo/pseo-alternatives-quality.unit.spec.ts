/**
 * pSEO Alternatives Quality Tests
 * Validates content depth improvements to the alternatives category:
 * - All pages have benchmarks data (prevents unsubstantiated performance claims)
 * - No bare "10x faster" superlatives without supporting benchmark data
 * - Unique detailedDescriptions per page (guards against template boilerplate)
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

interface IBenchmarkDimension {
  myimageupscaler: string;
  competitor: string;
  metric?: string;
}

interface IBenchmarks {
  processingTime: IBenchmarkDimension;
  qualityScore: IBenchmarkDimension;
  fileFormatSupport: {
    myimageupscaler: string[];
    competitor: string[];
  };
  maxOutputResolution: IBenchmarkDimension;
}

interface IRealWorldTestResult {
  testImage: string;
  myimageupscalerResult: string;
  competitorResult: string;
}

interface IAlternativePage {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  detailedDescription?: string;
  benchmarks?: IBenchmarks;
  realWorldTestResults?: IRealWorldTestResult[];
  [key: string]: unknown;
}

interface IAlternativesData {
  category: string;
  pages: IAlternativePage[];
  meta: { totalPages: number; lastUpdated: string };
}

function loadAlternatives(): IAlternativesData {
  const filePath = path.join(DATA_DIR, 'alternatives.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Priority pages that must have full benchmark data
const PRIORITY_SLUGS = [
  'vs-topaz',
  'vs-bigjpg',
  'vs-waifu2x',
  'vs-imgupscaler',
  'vs-letsenhance',
];

describe('pSEO Alternatives Quality', () => {
  const data = loadAlternatives();

  it('should load alternatives.json successfully with pages', () => {
    expect(data.pages).toBeDefined();
    expect(data.pages.length).toBeGreaterThan(0);
  });

  it('all priority alternatives pages should have a benchmarks field', () => {
    PRIORITY_SLUGS.forEach(slug => {
      const page = data.pages.find(p => p.slug === slug);
      expect(page, `Page "${slug}" not found in alternatives.json`).toBeDefined();
      expect(
        page!.benchmarks,
        `Page "${slug}" is missing the benchmarks field`
      ).toBeDefined();
    });
  });

  it('all priority pages should have benchmarks with required sub-fields', () => {
    PRIORITY_SLUGS.forEach(slug => {
      const page = data.pages.find(p => p.slug === slug);
      expect(page).toBeDefined();
      const b = page!.benchmarks;
      expect(b, `"${slug}" missing benchmarks`).toBeDefined();
      expect(b!.processingTime, `"${slug}" missing benchmarks.processingTime`).toBeDefined();
      expect(b!.processingTime.myimageupscaler, `"${slug}" missing benchmarks.processingTime.myimageupscaler`).toBeTruthy();
      expect(b!.processingTime.competitor, `"${slug}" missing benchmarks.processingTime.competitor`).toBeTruthy();
      expect(b!.qualityScore, `"${slug}" missing benchmarks.qualityScore`).toBeDefined();
      expect(b!.fileFormatSupport, `"${slug}" missing benchmarks.fileFormatSupport`).toBeDefined();
      expect(b!.fileFormatSupport.myimageupscaler, `"${slug}" missing benchmarks.fileFormatSupport.myimageupscaler`).toBeInstanceOf(Array);
      expect(b!.fileFormatSupport.competitor, `"${slug}" missing benchmarks.fileFormatSupport.competitor`).toBeInstanceOf(Array);
      expect(b!.maxOutputResolution, `"${slug}" missing benchmarks.maxOutputResolution`).toBeDefined();
    });
  });

  it('all priority pages should have at least one realWorldTestResult', () => {
    PRIORITY_SLUGS.forEach(slug => {
      const page = data.pages.find(p => p.slug === slug);
      expect(page).toBeDefined();
      expect(
        page!.realWorldTestResults,
        `Page "${slug}" is missing realWorldTestResults`
      ).toBeDefined();
      expect(
        page!.realWorldTestResults!.length,
        `Page "${slug}" realWorldTestResults must have at least 1 entry`
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('each realWorldTestResult should have all three required fields', () => {
    PRIORITY_SLUGS.forEach(slug => {
      const page = data.pages.find(p => p.slug === slug);
      expect(page).toBeDefined();
      page!.realWorldTestResults!.forEach((result, index) => {
        expect(
          result.testImage,
          `"${slug}" realWorldTestResults[${index}].testImage is empty`
        ).toBeTruthy();
        expect(
          result.myimageupscalerResult,
          `"${slug}" realWorldTestResults[${index}].myimageupscalerResult is empty`
        ).toBeTruthy();
        expect(
          result.competitorResult,
          `"${slug}" realWorldTestResults[${index}].competitorResult is empty`
        ).toBeTruthy();
      });
    });
  });

  it('no alternatives page should contain the literal phrase "10x faster"', () => {
    // "10x faster" is an unsubstantiated superlative. Any speed comparison must
    // reference actual benchmark data (processingTime field), not a bare multiplier claim.
    data.pages.forEach(page => {
      // Check all string fields for the phrase
      const stringifiedPage = JSON.stringify(page);
      expect(
        stringifiedPage.includes('10x faster'),
        `Page "${page.slug}" contains unsubstantiated "10x faster" claim. ` +
        'Replace with specific timing data in the benchmarks.processingTime field.'
      ).toBe(false);
    });
  });

  it('each alternatives page should have a unique detailedDescription', () => {
    // Only pages that have detailedDescription defined must be unique
    const pagesWithDescription = data.pages.filter(p => p.detailedDescription);
    if (pagesWithDescription.length === 0) return;

    const descriptions = pagesWithDescription.map(p => p.detailedDescription!);
    const uniqueDescriptions = new Set(descriptions);

    expect(
      uniqueDescriptions.size,
      'Some alternatives pages share the same detailedDescription — each must be unique'
    ).toBe(descriptions.length);
  });

  it('priority pages should have non-empty detailedDescription', () => {
    PRIORITY_SLUGS.forEach(slug => {
      const page = data.pages.find(p => p.slug === slug);
      expect(page).toBeDefined();
      expect(
        page!.detailedDescription,
        `Page "${slug}" is missing detailedDescription`
      ).toBeTruthy();
      expect(
        page!.detailedDescription!.length,
        `Page "${slug}" detailedDescription is too short (< 50 chars)`
      ).toBeGreaterThanOrEqual(50);
    });
  });

  it('benchmark data should be distinct per competitor (no copy-paste)', () => {
    const processingTimes = PRIORITY_SLUGS.map(slug => {
      const page = data.pages.find(p => p.slug === slug);
      return page?.benchmarks?.processingTime.competitor;
    }).filter(Boolean);

    const uniqueTimes = new Set(processingTimes);
    expect(
      uniqueTimes.size,
      'Multiple priority pages share identical competitor processingTime values — benchmarks must be competitor-specific'
    ).toBe(processingTimes.length);
  });

  it('file format support arrays should be non-empty for priority pages', () => {
    PRIORITY_SLUGS.forEach(slug => {
      const page = data.pages.find(p => p.slug === slug);
      expect(page).toBeDefined();
      const formats = page!.benchmarks?.fileFormatSupport;
      expect(formats).toBeDefined();
      expect(
        formats!.myimageupscaler.length,
        `"${slug}" myimageupscaler format list is empty`
      ).toBeGreaterThan(0);
      expect(
        formats!.competitor.length,
        `"${slug}" competitor format list is empty`
      ).toBeGreaterThan(0);
    });
  });
});
