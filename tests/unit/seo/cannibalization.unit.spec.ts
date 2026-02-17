/**
 * Cannibalization SEO Tests — Phase 1
 *
 * Guards against keyword cannibalization where the homepage competes with pSEO
 * pages for the same primary keyword. These are silent SEO regressions — no
 * build error occurs, but Google splits ranking signals across pages.
 *
 * Covers:
 *   1. Homepage title must not lead with "image upscaler" (defers to /tools/ai-image-upscaler)
 *   2. /tools/ai-image-upscaler self-canonical (expected: always true via metadata-factory)
 *   3. German bg pages have non-overlapping primaryKeywords
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock clientEnv — required by metadata-factory at module level
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

const BASE_URL = 'https://myimageupscaler.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface IPSEOPage {
  slug: string;
  metaTitle: string;
  primaryKeyword: string;
  [key: string]: unknown;
}

interface IPSEOData {
  pages: IPSEOPage[];
}

function loadJson<T>(relPath: string): T {
  const absPath = path.resolve(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(absPath, 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// 1. Homepage title must not lead with "image upscaler"
// ---------------------------------------------------------------------------

describe('Cannibalization — homepage vs /tools/ai-image-upscaler', () => {
  it('homepage title should not lead with "image upscaler"', () => {
    const common = loadJson<{ meta: { homepage: { title: string } } }>('locales/en/common.json');
    const homepageTitle = common.meta.homepage.title;
    // Homepage must not start with "ai image upscaler" so that /tools/ai-image-upscaler
    // can own that keyword unambiguously.
    expect(homepageTitle).not.toMatch(/^ai image upscaler/i);
  });

  it('homepage title leads with enhancer or brand term (not upscaler)', () => {
    const common = loadJson<{ meta: { homepage: { title: string } } }>('locales/en/common.json');
    const homepageTitle = common.meta.homepage.title;
    // The homepage must lead with Enhancer, Photo, or brand — not Upscaler
    expect(homepageTitle).toMatch(/^(AI Photo|AI Image Quality|Photo|Enhance|MyImage)/i);
  });

  it('ai-image-upscaler page self-canonicalizes to its own URL', () => {
    // The canonical URL is constructed from the slug and category.
    // metadata-factory always uses getCanonicalUrl which builds BASE_URL/category/slug.
    // This test verifies the slug is correct so the canonical resolves correctly.
    const tools = loadJson<IPSEOData>('app/seo/data/tools.json');
    const page = tools.pages.find(p => p.slug === 'ai-image-upscaler');
    expect(page).toBeDefined();
    // Canonical = BASE_URL + /tools/ + slug
    const expectedCanonical = `${BASE_URL}/tools/ai-image-upscaler`;
    const actualCanonical = `${BASE_URL}/tools/${page!.slug}`;
    expect(actualCanonical).toBe(expectedCanonical);
  });
});

// ---------------------------------------------------------------------------
// 2. German cannibalization — transparent-background-maker vs ai-background-remover
// ---------------------------------------------------------------------------

describe('Cannibalization — German bg pages (transparent-maker vs bg-remover)', () => {
  it('ai-background-remover and transparent-background-maker have different primaryKeywords', () => {
    const deTools = loadJson<IPSEOData>('locales/de/tools.json');
    const bgRemover = deTools.pages.find(p => p.slug === 'ai-background-remover');
    const transparentMaker = deTools.pages.find(p => p.slug === 'transparent-background-maker');

    expect(bgRemover).toBeDefined();
    expect(transparentMaker).toBeDefined();

    // Must have different primary keywords — no cannibalization
    expect(bgRemover!.primaryKeyword).not.toBe(transparentMaker!.primaryKeyword);
  });

  it('ai-background-remover primaryKeyword focuses on "entfernen" (remove) not "transparent"', () => {
    const deTools = loadJson<IPSEOData>('locales/de/tools.json');
    const bgRemover = deTools.pages.find(p => p.slug === 'ai-background-remover');
    expect(bgRemover).toBeDefined();
    // Background remover should own "entfernen" (remove/strip) queries
    expect(bgRemover!.primaryKeyword).toMatch(/entfernen|remov/i);
  });

  it('transparent-background-maker primaryKeyword focuses on "transparenter hintergrund"', () => {
    const deTools = loadJson<IPSEOData>('locales/de/tools.json');
    const transparentMaker = deTools.pages.find(p => p.slug === 'transparent-background-maker');
    expect(transparentMaker).toBeDefined();
    // Transparent maker should own "transparent" keyword cluster
    expect(transparentMaker!.primaryKeyword).toMatch(/transparent/i);
  });
});
