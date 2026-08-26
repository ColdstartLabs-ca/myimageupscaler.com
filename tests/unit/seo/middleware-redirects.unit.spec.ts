/**
 * Middleware redirect tests for pattern-based edge normalization.
 * Static legacy redirects are covered by legacy-redirects.unit.spec.ts.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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

async function runMiddleware(pathname: string) {
  const { updateSession } = await import('@shared/utils/supabase/middleware');
  (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: null,
    supabaseResponse: NextResponse.next(),
  });
  const { middleware } = await import('../../../middleware');
  return middleware(new NextRequest(`http://localhost${pathname}`, { method: 'GET' }));
}

describe('Middleware pattern redirects', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('rewrites an unprefixed blog URL to the English route without changing the public URL', async () => {
    const { middleware } = await import('../../../middleware');
    const request = new NextRequest('http://localhost/blog/mejorar-calidad-imagen-ia-gratis', {
      headers: { 'accept-language': 'es-ES,es;q=0.9' },
    });

    const response = await middleware(request);

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/en/blog/mejorar-calidad-imagen-ia-gratis'
    );
  });

  test('redirects locale-prefixed blog URLs to the canonical unprefixed URL', async () => {
    const { middleware } = await import('../../../middleware');
    const response = await middleware(
      new NextRequest('http://localhost/es/blog/mejorar-calidad-imagen-ia-gratis')
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'http://localhost/blog/mejorar-calidad-imagen-ia-gratis'
    );
  });

  test.each([
    ['/tools/Converter/jpg-to-webp', '/tools/convert/jpg-to-webp'],
    ['/tools/resize/resize-image-for-YouTube', '/tools/resize/resize-image-for-youtube'],
  ])('normalizes tool casing: %s', async (source, destination) => {
    const response = await runMiddleware(source);

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(`http://localhost${destination}`);
  });

  test.each([
    [
      '/tools/resize/redimensionner-image-pour-instagram',
      '/tools/resize/resize-image-for-instagram',
    ],
    ['/tools/compress/compresseur-image-lot', '/tools/compress/bulk-image-compressor'],
  ])('normalizes translated tool slugs: %s', async (source, destination) => {
    const response = await runMiddleware(source);

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(`http://localhost${destination}`);
  });

  test.each(['/&', '/$', '/5'])('redirects junk path %s to the homepage', async source => {
    const response = await runMiddleware(source);

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('http://localhost/');
  });

  test('redirects an undefined platform prefix to its real owner route', async () => {
    const response = await runMiddleware('/undefined/midjourney-upscaler');

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('http://localhost/platforms/midjourney-upscaler');
  });

  test('adds a noindex header to dashboard redirects so Google can remove private app URLs', async () => {
    const response = await runMiddleware('/dashboard');

    expect(response.headers.get('x-robots-tag')).toBe('noindex, follow');
  });

  test('adds a noindex header to locale-prefixed dashboard responses', async () => {
    const response = await runMiddleware('/pt/dashboard/history');

    expect(response.headers.get('x-robots-tag')).toBe('noindex, follow');
  });

  test.each(['/', '/pricing'])(
    'should not redirect %s for a stored Spanish locale',
    async pathname => {
      const { middleware } = await import('../../../middleware');
      const response = await middleware(
        new NextRequest(`http://localhost${pathname}`, {
          headers: { cookie: 'locale=es', 'x-test-env': 'true' },
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-middleware-rewrite')).toBe(
        `http://localhost/en${pathname === '/' ? '' : pathname}`
      );
    }
  );

  test('should not redirect pricing on a geo header', async () => {
    const { middleware } = await import('../../../middleware');
    const response = await middleware(
      new NextRequest('http://localhost/pricing', { headers: { 'x-test-country': 'ES' } })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  test('strips a locale from an English-only pSEO route', async () => {
    const response = await runMiddleware('/fr/photo-restoration');

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('http://localhost/photo-restoration');
  });
});
