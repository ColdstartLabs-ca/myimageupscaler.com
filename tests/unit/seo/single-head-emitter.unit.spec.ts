/**
 * Single head emitter for canonical, hreflang and title.
 *
 * Live crawl 2026-10-13: every English pSEO detail page shipped two
 * <link rel="canonical"> tags and two hreflang sets, because the page set
 * `alternates` through the metadata factory AND rendered <SeoMetaTags> /
 * <HreflangLinks> in its body. The body set listed all 7 locales, so English
 * /scale, /free and /guides pages pointed hreflang at `noindex` locale pages.
 * Hub titles rendered "| MyImageUpscaler | MyImageUpscaler" because their title
 * already ended in the brand and the layout template appended it again.
 */

import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
  serverEnv: { ENV: 'test' },
}));

import { generateCategoryMetadata, generateMetadata } from '@/lib/seo/metadata-factory';
import type { PSEOCategory } from '@/lib/seo/url-utils';

const APP_NAME = 'MyImageUpscaler';

function pageFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(full);
    return entry.name === 'page.tsx' ? [full] : [];
  });
}

/** The <title> text Next.js renders under the `%s | APP_NAME` layout template. */
function renderedTitle(title: Metadata['title']): string {
  if (typeof title === 'string') return `${title} | ${APP_NAME}`;
  if (title && typeof title === 'object' && 'absolute' in title) return String(title.absolute);
  throw new Error(`Unexpected title shape: ${JSON.stringify(title)}`);
}

const factoryPages = pageFiles(path.resolve('app')).filter(file => {
  const source = fs.readFileSync(file, 'utf8');
  return /generatePageMetadata\(|generateCategoryMetadata\(/.test(source);
});

describe('single head emitter', () => {
  it('finds the factory-backed pages', () => {
    expect(factoryPages.length).toBeGreaterThan(40);
  });

  it.each(factoryPages.map(file => [path.relative(process.cwd(), file)]))(
    '%s does not render body canonical/hreflang next to factory alternates',
    file => {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/<SeoMetaTags\b/);
      expect(source).not.toMatch(/<HreflangLinks\b/);
    }
  );

  it('the localized homepage sets hreflang once', () => {
    const source = fs.readFileSync(path.resolve('app/[locale]/page.tsx'), 'utf8');
    expect(source).toMatch(/alternates:/);
    expect(source).not.toMatch(/<HreflangLinks\b/);
  });

  it('factory detail metadata keeps canonical, translation-aware hreflang and og:locale', () => {
    const metadata = generateMetadata(
      {
        slug: 'upscale-to-4k',
        title: 'Upscale to 4K',
        metaTitle: 'Upscale Images to 4K Resolution with AI | MyImageUpscaler',
        metaDescription: 'Upscale images to 4K resolution with AI.',
        h1: 'Upscale to 4K',
        intro: 'Intro',
        primaryKeyword: 'upscale to 4k',
        secondaryKeywords: [],
        lastUpdated: '2026-10-13',
        category: 'scale',
      } as never,
      'scale',
      'en'
    );

    expect(metadata.alternates?.canonical).toBe('https://myimageupscaler.com/scale/upscale-to-4k');
    expect(Object.keys(metadata.alternates?.languages ?? {}).sort()).toEqual(['en', 'x-default']);
    expect(metadata.openGraph?.locale).toBe('en_US');
    expect(renderedTitle(metadata.title)).toBe(
      'Upscale Images to 4K Resolution with AI | MyImageUpscaler'
    );
  });

  it.each(['tools', 'scale', 'free', 'formats', 'alternatives'] as PSEOCategory[])(
    '%s hub title carries the brand once',
    category => {
      const title = renderedTitle(generateCategoryMetadata(category, 'en').title);
      expect(title.split(APP_NAME)).toHaveLength(2);
    }
  );

  it('keeps a brand that is part of the title text, not a suffix', () => {
    const metadata = generateMetadata(
      {
        slug: 'vs-topaz',
        title: 'vs Topaz',
        metaTitle: 'MyImageUpscaler vs Topaz Gigapixel - Better Text & Web',
        metaDescription: 'Compare.',
        h1: 'vs Topaz',
        intro: 'Intro',
        primaryKeyword: 'topaz alternative',
        secondaryKeywords: [],
        lastUpdated: '2026-10-13',
        category: 'alternatives',
      } as never,
      'alternatives',
      'en'
    );
    expect(renderedTitle(metadata.title)).toBe(
      'MyImageUpscaler vs Topaz Gigapixel - Better Text & Web | MyImageUpscaler'
    );
  });
});
