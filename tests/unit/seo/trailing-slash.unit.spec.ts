import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock all dependencies
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

describe('Trailing Slash Normalization', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    consoleSpy.mockRestore();
  });

  describe('Locale paths with trailing slashes', () => {
    test('should 301 redirect /ja/ to /ja', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/ja/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/ja');
    });

    test('should 301 redirect /pt/ to /pt', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/pt/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/pt');
    });

    test('should 301 redirect /de/ to /de', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/de/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/de');
    });

    test('should 301 redirect /fr/ to /fr', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/fr/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/fr');
    });

    test('should 301 redirect /es/ to /es', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/es/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/es');
    });

    test('should 301 redirect /it/ to /it', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/it/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/it');
    });
  });

  describe('Nested paths with trailing slashes', () => {
    test('should 301 redirect /de/tools/transparent-background-maker/ to without slash', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest(
        'http://localhost/de/tools/transparent-background-maker/',
        {
          method: 'GET',
        }
      );

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/de/tools/transparent-background-maker'
      );
    });

    test('should 301 redirect /tools/image-upscaler/ to without slash', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/image-upscaler/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/tools/image-upscaler');
    });

    test('should 301 redirect /ja/scale/ to without slash', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/ja/scale/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/ja/scale');
    });

    test('should 301 redirect /formats/webp/ to without slash', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/formats/webp/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/formats/webp');
    });
  });

  describe('Special paths that should NOT redirect', () => {
    test('should NOT redirect root /', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Root should not be a 301 redirect for trailing slash
      expect(response.status).not.toBe(301);
    });

    test('should NOT redirect /api/ routes', async () => {
      const { middleware } = await import('../../../middleware');
      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await middleware(request);

      // API routes should not get a trailing slash redirect
      expect(response.status).not.toBe(301);
    });

    test('should NOT redirect /api/ routes with trailing slash', async () => {
      const { middleware } = await import('../../../middleware');
      const request = new NextRequest('http://localhost/api/webhooks/stripe/', {
        method: 'POST',
      });

      const response = await middleware(request);

      // API routes should not get a trailing slash redirect
      const location = response.headers.get('location');
      if (location && response.status === 301) {
        // If there's a 301 redirect, it should not be for trailing slash removal
        expect(location).not.toBe('http://localhost/api/webhooks/stripe');
      }
    });

    test('should NOT redirect static files with extensions', async () => {
      const { middleware } = await import('../../../middleware');
      const request = new NextRequest('http://localhost/favicon.ico/', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Files with extensions should not redirect for trailing slash
      expect(response.status).not.toBe(301);
    });

    test('should NOT redirect _next/ internals', async () => {
      const { middleware } = await import('../../../middleware');
      const request = new NextRequest('http://localhost/_next/static/chunks/main.js/', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Next.js internals should not redirect for trailing slash
      expect(response.status).not.toBe(301);
    });
  });

  describe('Query parameters and hash preservation', () => {
    test('should preserve query params during redirect', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/ja/?page=2', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      const location = response.headers.get('location') || '';
      expect(location).toContain('/ja');
      expect(location).not.toContain('/ja/');
      expect(location).toContain('page=2');
    });

    test('should preserve multiple query params during redirect', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/de/tools/test/?page=2&sort=name', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      const location = response.headers.get('location') || '';
      expect(location).toContain('/de/tools/test');
      expect(location).not.toContain('/de/tools/test/');
      // Non-tracking params should be preserved
      expect(location).toContain('page=2');
      expect(location).toContain('sort=name');
    });

    test('should preserve hash during redirect', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/ja/#section', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      const location = response.headers.get('location') || '';
      expect(location).toContain('/ja');
      expect(location).not.toContain('/ja/');
      expect(location).toContain('#section');
    });
  });

  describe('Paths without trailing slashes should not redirect', () => {
    test('should NOT redirect /ja (no trailing slash)', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/ja', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should not be a 301 redirect for trailing slash
      // (might be other responses like rewrite, but not 301 redirect for trailing slash)
      const location = response.headers.get('location');
      if (location && response.status === 301) {
        // If there's a 301, ensure it's not just adding/removing trailing slash
        expect(location).not.toBe('http://localhost/ja');
      }
    });

    test('should NOT redirect /tools/image-upscaler (no trailing slash)', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/image-upscaler', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should not be a 301 redirect for trailing slash
      const location = response.headers.get('location');
      if (location && response.status === 301) {
        expect(location).not.toBe('http://localhost/tools/image-upscaler');
      }
    });
  });
});
