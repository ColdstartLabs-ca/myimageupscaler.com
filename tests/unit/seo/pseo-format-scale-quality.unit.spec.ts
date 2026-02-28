/**
 * pSEO Format-Scale Content Quality Tests
 * Validates that the top 10 format-scale pages have unique, format-specific
 * formatScaleData fields that reduce boilerplate across the category.
 * These tests guard against content regression — if formatScaleData is removed
 * or homogenised, Google's 88.5% indexation rejection rate will persist.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
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

interface IFormatScaleFileSize {
  typicalInputSize: string;
  typicalOutputSize: string;
  compressionNote: string;
}

interface IFormatScaleQuality {
  artifactRisk: string;
  ssimExpected: string;
  recommendedSourceQuality: string;
}

interface IFormatScaleUseCaseFit {
  best: string[];
  notIdeal: string[];
}

interface IFormatScaleData {
  fileSize: IFormatScaleFileSize;
  qualityConsiderations: IFormatScaleQuality;
  useCaseFit: IFormatScaleUseCaseFit;
}

interface IPSEOPage {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  formatScaleData?: IFormatScaleData;
  [key: string]: unknown;
}

interface IPSEOData {
  category: string;
  pages: IPSEOPage[];
  meta: { totalPages: number };
}

const PRIORITY_SLUGS = [
  'jpeg-upscale-2x',
  'png-upscale-2x',
  'webp-upscale-2x',
  'jpeg-upscale-4x',
  'png-upscale-4x',
  'tiff-upscale-2x',
  'jpeg-upscale-8x',
  'png-upscale-8x',
  'gif-upscale-2x',
  'bmp-upscale-2x',
] as const;

function loadFormatScaleData(): IPSEOData {
  const filePath = path.join(DATA_DIR, 'format-scale.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('pSEO Format-Scale Quality', () => {
  let data: IPSEOData;
  let priorityPages: IPSEOPage[];

  beforeAll(() => {
    data = loadFormatScaleData();
    priorityPages = PRIORITY_SLUGS.map(slug => {
      const page = data.pages.find(p => p.slug === slug);
      if (!page) {
        throw new Error(
          `Priority slug "${slug}" not found in format-scale.json. ` +
            'Do not remove priority pages from this data file.'
        );
      }
      return page;
    });
  });

  it('format-scale.json should load and contain pages', () => {
    expect(data).toBeDefined();
    expect(data.pages).toBeInstanceOf(Array);
    expect(data.pages.length).toBeGreaterThan(0);
  });

  it('all 10 priority slugs should exist in format-scale.json', () => {
    PRIORITY_SLUGS.forEach(slug => {
      const page = data.pages.find(p => p.slug === slug);
      expect(page, `Slug "${slug}" is missing from format-scale.json`).toBeDefined();
    });
  });

  it('all 10 priority pages should have a formatScaleData field', () => {
    priorityPages.forEach(page => {
      expect(
        page.formatScaleData,
        `Page "${page.slug}" is missing formatScaleData — this field is required to differentiate boilerplate content`
      ).toBeDefined();
    });
  });

  describe('formatScaleData structure integrity', () => {
    it('all priority pages should have formatScaleData.fileSize with required sub-fields', () => {
      priorityPages.forEach(page => {
        const fsd = page.formatScaleData;
        expect(fsd, `Page "${page.slug}" missing formatScaleData`).toBeDefined();
        expect(
          fsd!.fileSize,
          `Page "${page.slug}" missing formatScaleData.fileSize`
        ).toBeDefined();
        expect(
          fsd!.fileSize.typicalInputSize,
          `Page "${page.slug}" missing fileSize.typicalInputSize`
        ).toBeTruthy();
        expect(
          fsd!.fileSize.typicalOutputSize,
          `Page "${page.slug}" missing fileSize.typicalOutputSize`
        ).toBeTruthy();
        expect(
          fsd!.fileSize.compressionNote,
          `Page "${page.slug}" missing fileSize.compressionNote`
        ).toBeTruthy();
      });
    });

    it('all priority pages should have formatScaleData.qualityConsiderations with required sub-fields', () => {
      priorityPages.forEach(page => {
        const fsd = page.formatScaleData;
        expect(fsd, `Page "${page.slug}" missing formatScaleData`).toBeDefined();
        expect(
          fsd!.qualityConsiderations,
          `Page "${page.slug}" missing formatScaleData.qualityConsiderations`
        ).toBeDefined();
        expect(
          fsd!.qualityConsiderations.artifactRisk,
          `Page "${page.slug}" missing qualityConsiderations.artifactRisk`
        ).toBeTruthy();
        expect(
          fsd!.qualityConsiderations.ssimExpected,
          `Page "${page.slug}" missing qualityConsiderations.ssimExpected`
        ).toBeTruthy();
        expect(
          fsd!.qualityConsiderations.recommendedSourceQuality,
          `Page "${page.slug}" missing qualityConsiderations.recommendedSourceQuality`
        ).toBeTruthy();
      });
    });

    it('all priority pages should have formatScaleData.useCaseFit with best and notIdeal arrays', () => {
      priorityPages.forEach(page => {
        const fsd = page.formatScaleData;
        expect(fsd, `Page "${page.slug}" missing formatScaleData`).toBeDefined();
        expect(
          fsd!.useCaseFit,
          `Page "${page.slug}" missing formatScaleData.useCaseFit`
        ).toBeDefined();
        expect(
          fsd!.useCaseFit.best,
          `Page "${page.slug}" missing useCaseFit.best`
        ).toBeInstanceOf(Array);
        expect(
          fsd!.useCaseFit.best.length,
          `Page "${page.slug}" useCaseFit.best must have at least 3 entries`
        ).toBeGreaterThanOrEqual(3);
        expect(
          fsd!.useCaseFit.notIdeal,
          `Page "${page.slug}" missing useCaseFit.notIdeal`
        ).toBeInstanceOf(Array);
        expect(
          fsd!.useCaseFit.notIdeal.length,
          `Page "${page.slug}" useCaseFit.notIdeal must have at least 1 entry`
        ).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('content uniqueness — boilerplate reduction guards', () => {
    it('all priority pages should have unique typicalInputSize values', () => {
      const inputSizes = priorityPages.map(p => ({
        slug: p.slug,
        value: p.formatScaleData!.fileSize.typicalInputSize,
      }));

      const uniqueValues = new Set(inputSizes.map(x => x.value));
      expect(
        uniqueValues.size,
        `typicalInputSize values are not unique across priority pages — content is copy-pasted boilerplate.\n` +
          `Values:\n${inputSizes.map(x => `  ${x.slug}: ${x.value}`).join('\n')}`
      ).toBe(priorityPages.length);
    });

    it('all priority pages should have unique typicalOutputSize values', () => {
      const outputSizes = priorityPages.map(p => ({
        slug: p.slug,
        value: p.formatScaleData!.fileSize.typicalOutputSize,
      }));

      const uniqueValues = new Set(outputSizes.map(x => x.value));
      expect(
        uniqueValues.size,
        `typicalOutputSize values are not unique across priority pages — content is copy-pasted boilerplate.\n` +
          `Values:\n${outputSizes.map(x => `  ${x.slug}: ${x.value}`).join('\n')}`
      ).toBe(priorityPages.length);
    });

    it('all priority pages should have unique compressionNote values', () => {
      const notes = priorityPages.map(p => ({
        slug: p.slug,
        value: p.formatScaleData!.fileSize.compressionNote,
      }));

      const uniqueValues = new Set(notes.map(x => x.value));
      expect(
        uniqueValues.size,
        `compressionNote values are not unique — this is a key differentiating field that must be format-specific.\n` +
          `Values:\n${notes.map(x => `  ${x.slug}: ${x.value.substring(0, 60)}...`).join('\n')}`
      ).toBe(priorityPages.length);
    });

    it('all priority pages should have unique artifactRisk values', () => {
      const risks = priorityPages.map(p => ({
        slug: p.slug,
        value: p.formatScaleData!.qualityConsiderations.artifactRisk,
      }));

      const uniqueValues = new Set(risks.map(x => x.value));
      expect(
        uniqueValues.size,
        `artifactRisk values are not unique across priority pages — this must describe format×scale-specific behaviour.\n` +
          `Values:\n${risks.map(x => `  ${x.slug}: ${x.value.substring(0, 60)}...`).join('\n')}`
      ).toBe(priorityPages.length);
    });

    it('all priority pages should have unique ssimExpected values', () => {
      const ssims = priorityPages.map(p => ({
        slug: p.slug,
        value: p.formatScaleData!.qualityConsiderations.ssimExpected,
      }));

      const uniqueValues = new Set(ssims.map(x => x.value));
      expect(
        uniqueValues.size,
        `ssimExpected values are not unique — each format×scale combination has a different quality range.\n` +
          `Values:\n${ssims.map(x => `  ${x.slug}: ${x.value}`).join('\n')}`
      ).toBe(priorityPages.length);
    });

    it('JPEG pages should reference JPEG-specific characteristics', () => {
      const jpegPages = priorityPages.filter(p => p.slug.startsWith('jpeg-'));
      jpegPages.forEach(page => {
        const fsd = page.formatScaleData!;
        const allText = JSON.stringify(fsd).toLowerCase();
        expect(
          allText.includes('jpeg') || allText.includes('lossy') || allText.includes('compression artifact') || allText.includes('dct'),
          `Page "${page.slug}" formatScaleData does not mention JPEG-specific characteristics (lossy compression, DCT artifacts, etc.)`
        ).toBe(true);
      });
    });

    it('PNG pages should reference PNG-specific characteristics', () => {
      const pngPages = priorityPages.filter(p => p.slug.startsWith('png-'));
      pngPages.forEach(page => {
        const fsd = page.formatScaleData!;
        const allText = JSON.stringify(fsd).toLowerCase();
        expect(
          allText.includes('lossless') || allText.includes('alpha') || allText.includes('transparency') || allText.includes('png'),
          `Page "${page.slug}" formatScaleData does not mention PNG-specific characteristics (lossless, alpha, transparency)`
        ).toBe(true);
      });
    });

    it('WebP pages should reference WebP-specific characteristics', () => {
      const webpPages = priorityPages.filter(p => p.slug.startsWith('webp-'));
      webpPages.forEach(page => {
        const fsd = page.formatScaleData!;
        const allText = JSON.stringify(fsd).toLowerCase();
        expect(
          allText.includes('webp') || allText.includes('vp8') || allText.includes('compression') || allText.includes('web'),
          `Page "${page.slug}" formatScaleData does not mention WebP-specific characteristics`
        ).toBe(true);
      });
    });

    it('TIFF pages should reference TIFF-specific characteristics', () => {
      const tiffPages = priorityPages.filter(p => p.slug.startsWith('tiff-'));
      tiffPages.forEach(page => {
        const fsd = page.formatScaleData!;
        const allText = JSON.stringify(fsd).toLowerCase();
        expect(
          allText.includes('lossless') || allText.includes('print') || allText.includes('professional') || allText.includes('tiff') || allText.includes('lzw'),
          `Page "${page.slug}" formatScaleData does not mention TIFF-specific characteristics (lossless, print, LZW)`
        ).toBe(true);
      });
    });

    it('BMP pages should reference BMP-specific characteristics', () => {
      const bmpPages = priorityPages.filter(p => p.slug.startsWith('bmp-'));
      bmpPages.forEach(page => {
        const fsd = page.formatScaleData!;
        const allText = JSON.stringify(fsd).toLowerCase();
        expect(
          allText.includes('uncompressed') || allText.includes('bitmap') || allText.includes('windows') || allText.includes('bmp'),
          `Page "${page.slug}" formatScaleData does not mention BMP-specific characteristics (uncompressed, Windows bitmap)`
        ).toBe(true);
      });
    });

    it('GIF pages should reference GIF-specific characteristics', () => {
      const gifPages = priorityPages.filter(p => p.slug.startsWith('gif-'));
      gifPages.forEach(page => {
        const fsd = page.formatScaleData!;
        const allText = JSON.stringify(fsd).toLowerCase();
        expect(
          allText.includes('256') || allText.includes('palette') || allText.includes('animation') || allText.includes('indexed') || allText.includes('gif'),
          `Page "${page.slug}" formatScaleData does not mention GIF-specific characteristics (256 colours, palette, animation, indexed)`
        ).toBe(true);
      });
    });

    it('scale-specific pages should reflect scale factor differences', () => {
      // 8x pages should be described as higher risk than 2x pages for JPEG
      const jpeg2x = priorityPages.find(p => p.slug === 'jpeg-upscale-2x')!;
      const jpeg8x = priorityPages.find(p => p.slug === 'jpeg-upscale-8x')!;

      const risk2x = jpeg2x.formatScaleData!.qualityConsiderations.artifactRisk.toLowerCase();
      const risk8x = jpeg8x.formatScaleData!.qualityConsiderations.artifactRisk.toLowerCase();

      // 8x JPEG should not be described as "low" risk while 2x is
      // (we check they are different, as already validated in uniqueness test)
      expect(risk2x).not.toBe(risk8x);

      // 2x should be described as lower risk than 8x
      const lowRiskTerms = ['low', 'minimal', 'very low'];
      const highRiskTerms = ['high', 'moderate', 'significant'];

      const is2xLowRisk = lowRiskTerms.some(t => risk2x.includes(t));
      const is8xHigherRisk = highRiskTerms.some(t => risk8x.includes(t));

      expect(
        is2xLowRisk,
        `jpeg-upscale-2x artifactRisk should describe low risk (contains: "${risk2x}")`
      ).toBe(true);
      expect(
        is8xHigherRisk,
        `jpeg-upscale-8x artifactRisk should describe moderate/high risk (contains: "${risk8x}")`
      ).toBe(true);
    });
  });

  describe('content quality thresholds', () => {
    it('compressionNote should be at least 60 characters (meaningful, not placeholder)', () => {
      priorityPages.forEach(page => {
        const note = page.formatScaleData!.fileSize.compressionNote;
        expect(
          note.length,
          `Page "${page.slug}" compressionNote is too short (${note.length} chars) — must be substantive format-specific content`
        ).toBeGreaterThanOrEqual(60);
      });
    });

    it('artifactRisk should be at least 60 characters (meaningful, not placeholder)', () => {
      priorityPages.forEach(page => {
        const risk = page.formatScaleData!.qualityConsiderations.artifactRisk;
        expect(
          risk.length,
          `Page "${page.slug}" artifactRisk is too short (${risk.length} chars) — must describe specific format×scale behaviour`
        ).toBeGreaterThanOrEqual(60);
      });
    });

    it('each useCaseFit.best entry should be at least 20 characters', () => {
      priorityPages.forEach(page => {
        page.formatScaleData!.useCaseFit.best.forEach((entry, i) => {
          expect(
            entry.length,
            `Page "${page.slug}" useCaseFit.best[${i}] is too short — should be a specific, actionable use case`
          ).toBeGreaterThanOrEqual(20);
        });
      });
    });

    it('SSIM values should follow numeric range pattern (e.g. 0.85–0.92)', () => {
      priorityPages.forEach(page => {
        const ssim = page.formatScaleData!.qualityConsiderations.ssimExpected;
        // Should contain a decimal number between 0 and 1
        expect(
          /0\.\d{2}/.test(ssim),
          `Page "${page.slug}" ssimExpected should contain a numeric SSIM value like "0.91–0.96" (got: "${ssim}")`
        ).toBe(true);
      });
    });
  });

  describe('no verbatim pro tip duplication', () => {
    it('pages should not share identical tips arrays (if present)', () => {
      const pagesWithTips = data.pages.filter(
        p => Array.isArray(p['tips']) && (p['tips'] as string[]).length > 0
      );

      if (pagesWithTips.length > 1) {
        const tipsSignatures = pagesWithTips.map(p => ({
          slug: p.slug,
          signature: JSON.stringify(p['tips']),
        }));

        const uniqueSignatures = new Set(tipsSignatures.map(t => t.signature));

        // More than 50% of pages should have unique tips (allow some overlap for related formats)
        const uniquenessRatio = uniqueSignatures.size / tipsSignatures.length;
        expect(
          uniquenessRatio,
          `More than 50% of format-scale pages share identical tips arrays — this is template boilerplate.\n` +
            `Unique: ${uniqueSignatures.size}, Total: ${tipsSignatures.length}`
        ).toBeGreaterThan(0.5);
      }
    });
  });
});
