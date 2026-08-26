import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import formatsData from '@/app/seo/data/formats.json';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('@server/rateLimit', () => ({
  rateLimit: { limit: vi.fn() },
  publicRateLimit: { limit: vi.fn() },
}));

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
  serverEnv: {
    ENV: 'test',
    AMPLITUDE_API_KEY: 'test_amplitude_api_key',
  },
  isDevelopment: () => false,
}));

vi.mock('@shared/utils/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

const GIF_SCALE_SLUGS = [
  'gif-upscale-2x',
  'gif-upscale-4x',
  'gif-upscale-8x',
  'gif-upscale-16x',
] as const;

describe('GIF search-intent consolidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(GIF_SCALE_SLUGS)('301 redirects /format-scale/%s to the truthful owner', async slug => {
    const { middleware } = await import('../../../middleware');
    const request = new NextRequest(`http://localhost/format-scale/${slug}`);

    const response = await middleware(request);

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('http://localhost/formats/upscale-gif-images');
  });

  test.each(['pt', 'es', 'de', 'fr', 'it', 'ja'])(
    'collapses %s GIF scale variants to the truthful English owner',
    async locale => {
      const { middleware } = await import('../../../middleware');
      const request = new NextRequest(`http://localhost/${locale}/format-scale/gif-upscale-4x`);

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/formats/upscale-gif-images');
    }
  );

  test('removes GIF scale URLs from static generation, loaders, and the sitemap', async () => {
    const {
      getAllFormatScale,
      getAllFormatScaleSlugs,
      getFormatScaleData,
      getFormatScaleDataWithLocale,
    } = await import('@/lib/seo/data-loader');
    const { GET } = await import('@/app/sitemap-format-scale.xml/route');

    expect(await getAllFormatScaleSlugs()).not.toEqual(
      expect.arrayContaining([...GIF_SCALE_SLUGS])
    );
    expect((await getAllFormatScale()).some(page => page.format === 'GIF')).toBe(false);

    for (const slug of GIF_SCALE_SLUGS) {
      expect(await getFormatScaleData(slug)).toBeNull();
      expect((await getFormatScaleDataWithLocale(slug, 'ja')).data).toBeNull();
    }

    const sitemap = await (await GET()).text();
    expect(sitemap).not.toMatch(/gif-upscale-(2x|4x|8x|16x)/);
  });

  test('keeps one truthful owner that discloses the supported static-frame workflow', () => {
    const page = formatsData.pages.find(candidate => candidate.slug === 'upscale-gif-images');
    const copy = JSON.stringify(page).toLowerCase();

    expect(page).toBeDefined();
    expect(copy).toContain('animated gif processing is not currently supported');
    expect(copy).toContain('export');
    expect(copy).toContain('png');
    expect(page?.lastUpdated).toBe('2026-08-03T00:00:00Z');
    expect(copy).not.toContain('no registration');
  });

  test('should keep serving the localized owner copy', async () => {
    const { middleware } = await import('../../../middleware');

    const response = await middleware(
      new NextRequest('http://localhost/es/formats/upscale-gif-images')
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
