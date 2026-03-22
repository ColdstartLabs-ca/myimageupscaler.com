/**
 * Tool Data Loader Unit Tests
 * Tests getToolDataWithLocale() to ensure it searches both tools.json and interactive-tools.json
 * Phase 1 fix for GSC 404 errors - localized interactive tool pages
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock serverEnv before any imports that use it
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    ENV: 'test',
  },
}));

describe('getToolDataWithLocale', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should return static tool data for English locale', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');

    // 'ai-image-upscaler' is a static tool in tools.json
    const result = await getToolDataWithLocale('ai-image-upscaler', 'en');

    expect(result.data).not.toBeNull();
    expect(result.data?.slug).toBe('ai-image-upscaler');
    expect(result.hasTranslation).toBe(true);
    expect(result.isLocalizedCategory).toBe(true);
  });

  it('should return interactive tool data for English locale', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');

    // 'pdf-to-png' is an interactive tool (not in DEDICATED_ROUTE_SLUGS)
    const result = await getToolDataWithLocale('pdf-to-png', 'en');

    expect(result.data).not.toBeNull();
    expect(result.data?.slug).toBe('pdf-to-png');
    expect(result.hasTranslation).toBe(true);
    expect(result.isLocalizedCategory).toBe(true);
  });

  it('should return localized interactive tool data for non-English locale', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');

    // 'image-compressor' exists in localized interactive-tools.json files (e.g., es, de)
    const result = await getToolDataWithLocale('image-compressor', 'es');

    expect(result.data).not.toBeNull();
    expect(result.data?.slug).toBe('image-compressor');
    expect(result.hasTranslation).toBe(true);
    expect(result.isLocalizedCategory).toBe(true);
  });

  it('should return null for non-existent slug', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');

    const result = await getToolDataWithLocale('non-existent-slug-xyz-123', 'en');

    expect(result.data).toBeNull();
    expect(result.hasTranslation).toBe(false);
    expect(result.isLocalizedCategory).toBe(true);
  });

  it('should return static tool data when slug exists in tools.json', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');

    // 'ai-image-upscaler' exists in tools.json (static tools)
    const result = await getToolDataWithLocale('ai-image-upscaler', 'en');

    expect(result.data?.slug).toBe('ai-image-upscaler');
    expect(result.hasTranslation).toBe(true);
  });

  it('should fallback to English for non-English locale when translation unavailable', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');

    // Some slugs may not have translations - should fallback to English data
    const result = await getToolDataWithLocale('ai-image-upscaler', 'de');

    // The function returns the English data as fallback
    expect(result.data).not.toBeNull();
    expect(result.data?.slug).toBe('ai-image-upscaler');
  });
});

describe('getAllToolSlugs', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should not include DEDICATED_ROUTE_SLUGS in getAllToolSlugs', async () => {
    const { getAllToolSlugs } = await import('@/lib/seo/data-loader');
    const slugs = await getAllToolSlugs();

    // These slugs have dedicated sub-routes and should be filtered out
    expect(slugs).not.toContain('png-to-jpg');
    expect(slugs).not.toContain('jpg-to-png');
    expect(slugs).not.toContain('webp-to-jpg');
    expect(slugs).not.toContain('webp-to-png');
    expect(slugs).not.toContain('jpg-to-webp');
    expect(slugs).not.toContain('png-to-webp');
    expect(slugs).not.toContain('image-resizer');
    expect(slugs).not.toContain('image-compressor');
  });

  it('should include interactive tool slugs that are not dedicated routes', async () => {
    const { getAllToolSlugs } = await import('@/lib/seo/data-loader');
    const slugs = await getAllToolSlugs();

    // These interactive tools should be included (not in DEDICATED_ROUTE_SLUGS)
    expect(slugs).toContain('pdf-to-png');
    expect(slugs).toContain('pdf-to-jpg');
    expect(slugs).toContain('image-to-pdf');
    expect(slugs).toContain('image-to-text');
    expect(slugs).toContain('heic-to-jpg');
    expect(slugs).toContain('background-changer');
  });

  it('should include static tool slugs', async () => {
    const { getAllToolSlugs } = await import('@/lib/seo/data-loader');
    const slugs = await getAllToolSlugs();

    // Static tools from tools.json should always be included
    expect(slugs).toContain('ai-image-upscaler');
  });
});
