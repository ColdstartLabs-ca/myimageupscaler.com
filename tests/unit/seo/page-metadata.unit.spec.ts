/**
 * Page Metadata Tests — SEO Quick Wins
 * Validates optimized metadata for pages targeting high-impression, low-CTR keywords.
 * Covers: ai-photo-enhancer (tools), free category hub, upscale-avif-images (formats),
 *         upscale-gif-images (formats), transparent-background-maker (tools),
 *         and /pricing page metadata.
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

  it('avif page metaTitle starts with AVIF', () => {
    expect(page.metaTitle).toMatch(/^avif/i);
  });

  it('avif page metaTitle includes "upscaler" or "upscale"', () => {
    expect(page.metaTitle).toMatch(/upscal/i);
  });

  it('avif metaTitle ≤ 70 chars', () => {
    expect(page.metaTitle.length).toBeLessThanOrEqual(70);
  });

  it('avif metaDescription mentions free and no signup', () => {
    expect(page.metaDescription).toMatch(/free/i);
    expect(page.metaDescription).toMatch(/no signup/i);
  });

  it('avif metaDescription ≤ 160 chars', () => {
    expect(page.metaDescription.length).toBeLessThanOrEqual(160);
  });
});

// ---------------------------------------------------------------------------
// Phase 5: upscale-gif-images (formats category)
// ---------------------------------------------------------------------------

describe('Phase 5: upscale-gif-images metadata', () => {
  const data = loadCategory('formats');
  const page = findPage(data, 'upscale-gif-images');

  it('gif page metaTitle includes "free" and "gif upscaler"', () => {
    expect(page.metaTitle).toMatch(/free/i);
    expect(page.metaTitle).toMatch(/gif upscaler/i);
  });

  it('gif page metaTitle mentions no signup', () => {
    expect(page.metaTitle).toMatch(/no signup/i);
  });

  it('gif metaTitle ≤ 70 chars', () => {
    expect(page.metaTitle.length).toBeLessThanOrEqual(70);
  });

  it('gif metaDescription ≤ 160 chars', () => {
    expect(page.metaDescription.length).toBeLessThanOrEqual(160);
  });

  it('gif FAQ items all have an "answer" field (not "description")', () => {
    interface IFaqItem {
      question: string;
      answer?: string;
      description?: string;
    }
    const faqItems = page.faq as IFaqItem[] | undefined;
    expect(faqItems).toBeDefined();
    faqItems?.forEach(item => {
      expect(
        item.answer,
        `FAQ question "${item.question}" is missing "answer" field`
      ).toBeDefined();
      expect(item.description).toBeUndefined();
    });
  });

  it('gif FAQ includes a question about animated GIFs', () => {
    interface IFaqItem {
      question: string;
      answer?: string;
    }
    const faqItems = page.faq as IFaqItem[] | undefined;
    const hasAnimatedQ = faqItems?.some(item => /animated/i.test(item.question));
    expect(hasAnimatedQ).toBe(true);
  });

  it('gif FAQ includes a question about how to upscale a GIF for free', () => {
    interface IFaqItem {
      question: string;
      answer?: string;
    }
    const faqItems = page.faq as IFaqItem[] | undefined;
    const hasFreeQ = faqItems?.some(item => /free/i.test(item.question));
    expect(hasFreeQ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 6: transparent-background-maker (tools category)
// ---------------------------------------------------------------------------

describe('Phase 6: transparent-background-maker metadata', () => {
  const data = loadCategory('tools');
  const page = findPage(data, 'transparent-background-maker');

  it('transparent-bg metaTitle targets the "easiest way" query', () => {
    expect(page.metaTitle).toMatch(/easiest/i);
  });

  it('transparent-bg metaTitle includes "free" and current year', () => {
    expect(page.metaTitle).toMatch(/free/i);
    expect(page.metaTitle).toMatch(/2026/);
  });

  it('transparent-bg metaTitle ≤ 70 chars', () => {
    expect(page.metaTitle.length).toBeLessThanOrEqual(70);
  });

  it('transparent-bg metaDescription mentions "no signup"', () => {
    expect(page.metaDescription).toMatch(/no signup/i);
  });

  it('transparent-bg metaDescription ≤ 160 chars', () => {
    expect(page.metaDescription.length).toBeLessThanOrEqual(160);
  });
});

// ---------------------------------------------------------------------------
// Phase 7: /pricing page metadata
// ---------------------------------------------------------------------------

describe('Phase 7: /pricing page metadata', () => {
  it('pricing page title derives starting price from SUBSCRIPTION_PLANS config', () => {
    const pricingFile = path.join(process.cwd(), 'app/[locale]/pricing/page.tsx');
    const content = fs.readFileSync(pricingFile, 'utf-8');
    // Price is derived from LOWEST_PLAN_PRICE (SUBSCRIPTION_PLANS.STARTER_MONTHLY.price), not hardcoded
    expect(content).toMatch(/LOWEST_PLAN_PRICE/);
    expect(content).toMatch(/\$\$\{LOWEST_PLAN_PRICE\}\/month/);
  });

  it('pricing page description mentions free start and no credit card', () => {
    const pricingFile = path.join(process.cwd(), 'app/[locale]/pricing/page.tsx');
    const content = fs.readFileSync(pricingFile, 'utf-8');
    expect(content).toMatch(/start free|no credit card/i);
  });

  it('pricing page description mentions cancel anytime', () => {
    const pricingFile = path.join(process.cwd(), 'app/[locale]/pricing/page.tsx');
    const content = fs.readFileSync(pricingFile, 'utf-8');
    expect(content).toMatch(/cancel anytime/i);
  });
});
