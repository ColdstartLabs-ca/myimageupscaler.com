/**
 * Data validation tests for pSEO content (Phase 8)
 * Tests that data files have required content fields and adequate content length
 */

import platformsData from '@/app/seo/data/platforms.json';
import formatScaleData from '@/app/seo/data/format-scale.json';
import deviceUseData from '@/app/seo/data/device-use.json';
import platformFormatData from '@/app/seo/data/platform-format.json';
import type {
  IPlatformPage,
  IFormatScalePage,
  IDeviceUseCasePage,
  IPlatformFormatPage,
} from '@/lib/seo/pseo-types';

// Helper function to count words in a string
const countWords = (str: string): number => {
  if (typeof str !== 'string') return 0;
  return str
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
};

// Helper function to count total words in an object's content fields
const countContentWords = (data: any): number => {
  let wordCount = 0;

  if (data.intro) wordCount += countWords(data.intro);
  if (data.description) wordCount += countWords(data.description);
  if (data.detailedDescription) wordCount += countWords(data.detailedDescription);
  if (data.technicalDetails) wordCount += countWords(data.technicalDetails);
  if (data.comparisonNotes) wordCount += countWords(data.comparisonNotes);

  if (data.benefits && Array.isArray(data.benefits)) {
    data.benefits.forEach((benefit: any) => {
      if (benefit.title) wordCount += countWords(benefit.title);
      if (benefit.description) wordCount += countWords(benefit.description);
    });
  }

  if (data.bestPractices && Array.isArray(data.bestPractices)) {
    data.bestPractices.forEach((practice: string) => {
      wordCount += countWords(practice);
    });
  }

  if (data.useCases && Array.isArray(data.useCases)) {
    data.useCases.forEach((useCase: any) => {
      if (useCase.title) wordCount += countWords(useCase.title);
      if (useCase.description) wordCount += countWords(useCase.description);
    });
  }

  if (data.faq && Array.isArray(data.faq)) {
    data.faq.forEach((faq: any) => {
      if (faq.question) wordCount += countWords(faq.question);
      if (faq.answer) wordCount += countWords(faq.answer);
    });
  }

  return wordCount;
};

describe('pSEO Data Validation', () => {
  describe('Platform Pages', () => {
    const pages = platformsData.pages as IPlatformPage[];

    test('should have required content fields for enhanced pages', () => {
      // Check that at least some pages have the new Phase 8 content fields
      const pagesWithDetailedDescription = pages.filter(p => p.detailedDescription);
      const pagesWithTechnicalDetails = pages.filter(p => p.technicalDetails);
      const pagesWithBestPractices = pages.filter(
        p => p.bestPractices && p.bestPractices.length > 0
      );
      const pagesWithComparisonNotes = pages.filter(p => p.comparisonNotes);

      // At least 80% of platform pages should have detailedDescription
      expect(
        pagesWithDetailedDescription.length / pages.length,
        'At least 80% of platform pages should have detailedDescription'
      ).toBeGreaterThanOrEqual(0.8);

      // At least 80% of platform pages should have technicalDetails
      expect(
        pagesWithTechnicalDetails.length / pages.length,
        'At least 80% of platform pages should have technicalDetails'
      ).toBeGreaterThanOrEqual(0.8);

      // At least 80% of platform pages should have bestPractices with 5+ items
      expect(
        pagesWithBestPractices.length / pages.length,
        'At least 80% of platform pages should have bestPractices'
      ).toBeGreaterThanOrEqual(0.8);

      // All pages with bestPractices should have 5+ items
      pagesWithBestPractices.forEach(page => {
        expect(
          page.bestPractices!.length,
          `Page ${page.slug} should have at least 5 best practices`
        ).toBeGreaterThanOrEqual(5);
      });

      // At least 80% of platform pages should have comparisonNotes
      expect(
        pagesWithComparisonNotes.length / pages.length,
        'At least 80% of platform pages should have comparisonNotes'
      ).toBeGreaterThanOrEqual(0.8);
    });

    test('should validate content length - pages have adequate content', () => {
      // Check that pages with Phase 8 content meet minimum word counts
      const pagesWithExpandedContent = pages.filter(
        p => p.detailedDescription || p.technicalDetails || p.comparisonNotes
      );

      pagesWithExpandedContent.forEach(page => {
        const wordCount = countContentWords(page);

        // Pages with expanded content should have 1000+ words total
        expect(
          wordCount,
          `Page ${page.slug} should have 1000+ words of content, has ${wordCount}`
        ).toBeGreaterThanOrEqual(1000);
      });
    });

    test('should have non-empty content fields', () => {
      pages.forEach(page => {
        if (page.detailedDescription) {
          expect(
            page.detailedDescription.trim().length,
            `Page ${page.slug} detailedDescription should not be empty`
          ).toBeGreaterThan(100);
        }

        if (page.technicalDetails) {
          expect(
            page.technicalDetails.trim().length,
            `Page ${page.slug} technicalDetails should not be empty`
          ).toBeGreaterThan(100);
        }

        if (page.comparisonNotes) {
          expect(
            page.comparisonNotes.trim().length,
            `Page ${page.slug} comparisonNotes should not be empty`
          ).toBeGreaterThan(100);
        }
      });
    });
  });

  describe('Format-Scale Pages', () => {
    const pages = formatScaleData.pages as IFormatScalePage[];

    test('should have required content fields for enhanced pages', () => {
      // Check that sample pages have the new Phase 8 content fields
      const pagesWithDetailedDescription = pages.filter(p => p.detailedDescription);
      const pagesWithTechnicalDetails = pages.filter(p => p.technicalDetails);
      const pagesWithComparisonNotes = pages.filter(p => p.comparisonNotes);

      // At least some format-scale pages should have the new fields
      expect(
        pagesWithDetailedDescription.length,
        'Some format-scale pages should have detailedDescription'
      ).toBeGreaterThan(0);

      expect(
        pagesWithTechnicalDetails.length,
        'Some format-scale pages should have technicalDetails'
      ).toBeGreaterThan(0);

      expect(
        pagesWithComparisonNotes.length,
        'Some format-scale pages should have comparisonNotes'
      ).toBeGreaterThan(0);
    });

    test('should validate content length - enhanced pages have adequate content', () => {
      const pagesWithExpandedContent = pages.filter(
        p => p.detailedDescription || p.technicalDetails || p.comparisonNotes
      );

      pagesWithExpandedContent.forEach(page => {
        const wordCount = countContentWords(page);

        // Enhanced format-scale pages should have 800+ words total
        expect(
          wordCount,
          `Page ${page.slug} should have 800+ words of content, has ${wordCount}`
        ).toBeGreaterThanOrEqual(800);
      });
    });
  });

  describe('Device-Use Pages', () => {
    const pages = deviceUseData.pages as IDeviceUseCasePage[];

    test('should have required content fields for enhanced pages', () => {
      const pagesWithDetailedDescription = pages.filter(p => p.detailedDescription);
      const pagesWithTechnicalDetails = pages.filter(p => p.technicalDetails);
      const pagesWithBestPractices = pages.filter(
        p => p.bestPractices && p.bestPractices.length > 0
      );
      const pagesWithComparisonNotes = pages.filter(p => p.comparisonNotes);

      // At least some device-use pages should have the new fields
      expect(
        pagesWithDetailedDescription.length,
        'Some device-use pages should have detailedDescription'
      ).toBeGreaterThan(0);

      expect(
        pagesWithTechnicalDetails.length,
        'Some device-use pages should have technicalDetails'
      ).toBeGreaterThan(0);

      expect(
        pagesWithBestPractices.length,
        'Some device-use pages should have bestPractices'
      ).toBeGreaterThan(0);

      expect(
        pagesWithComparisonNotes.length,
        'Some device-use pages should have comparisonNotes'
      ).toBeGreaterThan(0);
    });

    test('should validate best practices array length', () => {
      const pagesWithBestPractices = pages.filter(
        p => p.bestPractices && p.bestPractices.length > 0
      );

      pagesWithBestPractices.forEach(page => {
        expect(
          page.bestPractices!.length,
          `Page ${page.slug} should have 5+ best practices`
        ).toBeGreaterThanOrEqual(5);
      });
    });
  });

  describe('Platform-Format Pages', () => {
    const pages = platformFormatData.pages as IPlatformFormatPage[];

    test('should have required content fields for enhanced pages', () => {
      const pagesWithDetailedDescription = pages.filter(p => p.detailedDescription);
      const pagesWithTechnicalDetails = pages.filter(p => p.technicalDetails);
      const pagesWithBestPractices = pages.filter(
        p => p.bestPractices && p.bestPractices.length > 0
      );
      const pagesWithComparisonNotes = pages.filter(p => p.comparisonNotes);

      // At least some platform-format pages should have the new fields
      expect(
        pagesWithDetailedDescription.length,
        'Some platform-format pages should have detailedDescription'
      ).toBeGreaterThan(0);

      expect(
        pagesWithTechnicalDetails.length,
        'Some platform-format pages should have technicalDetails'
      ).toBeGreaterThan(0);

      expect(
        pagesWithBestPractices.length,
        'Some platform-format pages should have bestPractices'
      ).toBeGreaterThan(0);

      expect(
        pagesWithComparisonNotes.length,
        'Some platform-format pages should have comparisonNotes'
      ).toBeGreaterThan(0);
    });
  });

  describe('Content Quality Checks', () => {
    test('detailedDescription should be multi-paragraph for platform pages', () => {
      const pages = platformsData.pages as IPlatformPage[];
      const pagesWithDetailedDescription = pages.filter(p => p.detailedDescription);

      pagesWithDetailedDescription.forEach(page => {
        const paragraphCount = page
          .detailedDescription!.split('\n\n')
          .filter(p => p.trim().length > 0).length;

        // detailedDescription should have 2-3 paragraphs (at least 2)
        expect(
          paragraphCount,
          `Page ${page.slug} detailedDescription should have 2+ paragraphs`
        ).toBeGreaterThanOrEqual(2);
      });
    });

    test('technicalDetails should contain technical information', () => {
      const pages = platformsData.pages as IPlatformPage[];
      const pagesWithTechnicalDetails = pages.filter(p => p.technicalDetails);

      pagesWithTechnicalDetails.forEach(page => {
        // Should contain technical terms
        const techTerms = [
          'neural',
          'network',
          'resolution',
          'pixel',
          'algorithm',
          'AI',
          'processing',
        ];
        const hasTechTerm = techTerms.some(term =>
          page.technicalDetails!.toLowerCase().includes(term.toLowerCase())
        );

        expect(
          hasTechTerm,
          `Page ${page.slug} technicalDetails should contain technical terminology`
        ).toBe(true);
      });
    });

    test('comparisonNotes should mention alternatives or comparisons', () => {
      const pages = platformsData.pages as IPlatformPage[];
      const pagesWithComparisonNotes = pages.filter(p => p.comparisonNotes);

      pagesWithComparisonNotes.forEach(page => {
        // Should contain comparison language
        const comparisonTerms = [
          'compared',
          'versus',
          'unlike',
          'similar',
          'difference',
          'vs',
          'alternative',
        ];
        const hasComparisonTerm = comparisonTerms.some(term =>
          page.comparisonNotes!.toLowerCase().includes(term.toLowerCase())
        );

        expect(
          hasComparisonTerm,
          `Page ${page.slug} comparisonNotes should contain comparison language`
        ).toBe(true);
      });
    });
  });
});
