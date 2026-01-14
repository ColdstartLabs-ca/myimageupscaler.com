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

describe('Authentication Middleware', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    consoleSpy.mockRestore();
  });

  describe('Basic functionality', () => {
    test('should import middleware function', async () => {
      // Test that the middleware can be imported
      const { middleware } = await import('../../middleware');
      expect(typeof middleware).toBe('function');
    });
  });

  describe('Security headers', () => {
    test('should apply security headers to API responses', async () => {
      const { middleware } = await import('../../middleware');
      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    test('should apply security headers to page responses', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response with NextResponse.next()
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });
  });

  describe('Tracking parameter cleanup for SEO', () => {
    test('should redirect URLs with only tracking params to clean URL', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?signup=1', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should redirect to clean URL
      // Note: Next.js redirects include the full URL
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/');
    });

    test('should redirect URLs with UTM parameters to clean URL', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest(
        'http://localhost/?utm_source=google&utm_medium=cpc&utm_campaign=test',
        {
          method: 'GET',
        }
      );

      const response = await middleware(request);

      // Should redirect to clean URL (Next.js includes full URL)
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/');
    });

    test('should redirect URLs with Facebook Click ID to clean URL', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?fbclid=abc123', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should redirect to clean URL (Next.js includes full URL)
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/');
    });

    test('should redirect URLs with Google Click ID to clean URL', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?gclid=xyz789', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should redirect to clean URL (Next.js includes full URL)
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/');
    });

    test('should preserve non-tracking query parameters', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?page=2&sort=name', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should not redirect - non-tracking params are preserved
      expect(response.status).not.toBe(301);
    });

    test('should strip tracking params while preserving functional params', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?page=2&utm_source=google&signup=1', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should redirect to URL with only functional params (Next.js includes full URL)
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/?page=2');
    });

    test('should preserve original tracking params in headers for app use', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?page=2&signup=1', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should be a redirect
      expect(response.status).toBe(301);

      // Original tracking param should be in headers
      expect(response.headers.get('x-original-signup')).toBe('1');
    });

    test('should handle multiple tracking parameters together', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest(
        'http://localhost/?signup=1&ref=email&utm_source=newsletter&fbclid=test',
        {
          method: 'GET',
        }
      );

      const response = await middleware(request);

      // Should redirect to clean URL (all params are tracking params)
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/');
    });

    test('should handle tracking params on pSEO pages', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/ai-upscaler?signup=1', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should redirect to clean pSEO URL (Next.js includes full URL, trailingSlash adds /)
      expect(response.status).toBe(301);
      // Note: The trailingSlash config will add the trailing slash
      const location = response.headers.get('location') || '';
      expect(location).toContain('/tools/ai-upscaler');
      expect(location).not.toContain('signup');
    });

    test('should handle tracking params on localized pages', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/es/tools/ai-upscaler?signup=1', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should redirect to clean localized URL (Next.js includes full URL)
      expect(response.status).toBe(301);
      // Note: The trailingSlash config will add the trailing slash
      const location = response.headers.get('location') || '';
      expect(location).toContain('/es/tools/ai-upscaler');
      expect(location).not.toContain('signup');
    });
  });
});
