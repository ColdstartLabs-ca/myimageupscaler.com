/**
 * Page Metadata Tests — SEO Quick Wins
 * Validates optimized metadata for pages targeting pos. 16–19 keywords.
 * Covers: ai-photo-enhancer (tools), free category hub, upscale-avif-images (formats).
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock clientEnv (required by metadata-factory and localization-config)
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
  h1: string;
  [key: string]: unknown;
}

interface IPSEOData {
  category: string;
  pages: IPSEOPage[];
}

function loadCategory(category: string): IPSEOData {
  const filePath = path.join(DATA_DIR, `${category}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function findPage(data: IPSEOData, slug: string): IPSEOPage {
  const page = data.pages.find(p => p.slug === slug);
  if (!page) throw new Error(`Page with slug "${slug}" not found in category "${data.category}"`);
  return page;
}

// ---------------------------------------------------------------------------
// Phase 2: ai-photo-enhancer (tools category)
// ---------------------------------------------------------------------------

describe('Phase 2: ai-photo-enhancer metadata', () => {
  const data = loadCategory('tools');
  const page = findPage(data, 'ai-photo-enhancer');

  it('ai-photo-enhancer metaTitle includes quality enhancer', () => {
    expect(page.metaTitle).toMatch(/quality enhancer/i);
  });

  it('ai-photo-enhancer metaTitle ≤ 70 chars', () => {
    expect(page.metaTitle.length).toBeLessThanOrEqual(70);
  });

  it('ai-photo-enhancer metaDescription ≤ 160 chars', () => {
    expect(page.metaDescription.length).toBeLessThanOrEqual(160);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: free category hub
// ---------------------------------------------------------------------------

describe('Phase 3: free category metadata', () => {
  it('free category title includes free credits messaging', async () => {
    const { generateCategoryMetadata } = await import('@/lib/seo/metadata-factory');
    const metadata = generateCategoryMetadata('free');
    const freeCategoryTitle = metadata.title as string;
    expect(freeCategoryTitle).toMatch(/free/i);
  });

  it('free category title ≤ 70 chars', async () => {
    const { generateCategoryMetadata } = await import('@/lib/seo/metadata-factory');
    const metadata = generateCategoryMetadata('free');
    const freeCategoryTitle = metadata.title as string;
    expect(freeCategoryTitle.length).toBeLessThanOrEqual(70);
  });
});

// ---------------------------------------------------------------------------
// Phase 4: upscale-avif-images (formats category)
// ---------------------------------------------------------------------------

describe('Phase 4: upscale-avif-images metadata', () => {
  const data = loadCategory('formats');
  const page = findPage(data, 'upscale-avif-images');

  it('avif page metaTitle leads with AVIF', () => {
    expect(page.metaTitle).toMatch(/^avif upscaler/i);
  });

  it('avif metaTitle ≤ 70 chars', () => {
    expect(page.metaTitle.length).toBeLessThanOrEqual(70);
  });
});
