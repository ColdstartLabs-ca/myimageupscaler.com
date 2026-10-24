import { describe, expect, it } from 'vitest';

const BATCH_1_REFRESHES = [
  {
    slug: 'best-free-ai-image-upscaler-2026-tested-compared',
    seoTitle: 'Best Free AI Image Upscaler 2026: 12 Tools Tested',
    h1: 'Best Free AI Image Upscaler 2026: 12 Tools Tested',
    firstSentence:
      'We tested the best free AI image upscaler tools for 2026 to see which ones upscale images online without signup, watermarks, or soft-looking results.',
    targetQuery: 'best free ai image upscaler 2026',
  },
  {
    slug: 'ai-image-upscaling-vs-sharpening-explained',
    seoTitle: 'AI Upscaling vs Sharpening Explained: Key Difference',
    h1: 'AI Upscaling vs Sharpening Explained',
    firstSentence:
      'AI upscaling vs sharpening is the difference between adding new image detail and making existing edges look clearer.',
    targetQuery: 'ai upscaling vs sharpening',
  },
  {
    slug: 'best-ai-image-quality-enhancer-free',
    seoTitle: 'Best Free AI Image Sharpener Online 2026: Tested',
    h1: 'Best Free AI Image Sharpener Online 2026',
    firstSentence:
      'We tested the best free AI image sharpener tools online in 2026 for blurry photos, soft details, noise, and image quality enhancement.',
    targetQuery: 'best free ai image sharpener online 2026',
  },
  {
    slug: 'free-ai-upscaler-no-watermark',
    seoTitle: 'Best Free AI Image Upscaler 2026: No Watermark',
    h1: 'Best Free AI Image Upscaler With No Watermark',
    firstSentence:
      'This guide compares the best free AI image upscaler options in 2026 that avoid watermarks, signup friction, and low-quality exports.',
    targetQuery: 'best free ai image upscaler',
  },
  {
    slug: 'upscale-image-for-print-300-dpi-guide',
    seoTitle: 'Upscale Image to 300 DPI for Print: Free AI Guide',
    h1: 'Upscale Image to 300 DPI for Print',
    firstSentence:
      'To upscale an image to 300 DPI for print, you need enough pixels for the print size, then use AI upscaling only when the source image is too small.',
    targetQuery: 'upscale image to 300 dpi',
  },
] as const;

describe('SEO next steps Batch 1 blog refresh copy', () => {
  it('keeps refreshed SEO titles in the SERP-safe range', () => {
    for (const refresh of BATCH_1_REFRESHES) {
      expect(refresh.seoTitle.length, refresh.slug).toBeGreaterThanOrEqual(30);
      expect(refresh.seoTitle.length, refresh.slug).toBeLessThanOrEqual(60);
    }
  });

  it('front-loads the target query across the Three Kings copy', () => {
    for (const refresh of BATCH_1_REFRESHES) {
      const normalizedTitle = refresh.seoTitle.toLowerCase();
      const normalizedH1 = refresh.h1.toLowerCase();
      const normalizedFirstSentence = refresh.firstSentence.toLowerCase();

      for (const token of refresh.targetQuery.split(' ')) {
        expect(normalizedTitle, `${refresh.slug} title missing ${token}`).toContain(token);
        expect(normalizedH1, `${refresh.slug} H1 missing ${token}`).toContain(token);
        expect(normalizedFirstSentence, `${refresh.slug} intro missing ${token}`).toContain(token);
      }
    }
  });
});
