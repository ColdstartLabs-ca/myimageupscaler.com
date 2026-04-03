/**
 * Tools Metadata Unit Tests — Phase 2 (CTR Fix)
 *
 * Verifies that the ai-image-upscaler entry in tools.json has the
 * optimized metaTitle and metaDescription for improved SERP CTR.
 *
 * Key invariants:
 * - metaTitle includes "Free" (CTR trigger word)
 * - metaTitle is within Google's SERP title display limit (~70 chars)
 * - metaDescription is within Google's SERP description limit (160 chars)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface IPSEOPage {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  [key: string]: unknown;
}

interface IPSEOData {
  pages: IPSEOPage[];
}

function loadToolsJson(): IPSEOData {
  const absPath = path.resolve(process.cwd(), 'app/seo/data/tools.json');
  return JSON.parse(fs.readFileSync(absPath, 'utf-8')) as IPSEOData;
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

  it('metaTitle should mention the brand (MyImageUpscaler)', () => {
    expect(page!.metaTitle).toContain('MyImageUpscaler');
  });

  it('metaTitle should mention 8x upscaling capability', () => {
    expect(page!.metaTitle).toContain('8x');
  });

  it('metaDescription should mention "no signup"', () => {
    expect(page!.metaDescription).toMatch(/no signup/i);
  });

  it('metaDescription should mention "no watermarks"', () => {
    expect(page!.metaDescription).toMatch(/no watermark/i);
  });
});
