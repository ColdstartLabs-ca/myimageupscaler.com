/**
 * Middleware Redirects Unit Tests
 * Tests legacy URL redirects for SEO (misrouted URLs from GSC 404 list)
 */

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

describe('Middleware Legacy Redirects', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    consoleSpy.mockRestore();
  });

  describe('Dedicated-route tools accessed at wrong path', () => {
    test('should redirect /tools/png-to-jpg to /tools/convert/png-to-jpg', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/png-to-jpg', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/tools/convert/png-to-jpg');
    });

    test('should redirect /es/tools/png-to-jpg to /es/tools/convert/png-to-jpg preserving locale', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/es/tools/png-to-jpg', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/es/tools/convert/png-to-jpg');
    });

    test('should redirect /tools/jpg-to-png to /tools/convert/jpg-to-png', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/jpg-to-png', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/tools/convert/jpg-to-png');
    });

    test('should redirect /tools/webp-to-jpg to /tools/convert/webp-to-jpg', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/webp-to-jpg', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/tools/convert/webp-to-jpg');
    });

    test('should redirect /tools/webp-to-png to /tools/convert/webp-to-png', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/webp-to-png', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/tools/convert/webp-to-png');
    });

    test('should redirect /tools/jpg-to-webp to /tools/convert/jpg-to-webp', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/jpg-to-webp', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/tools/convert/jpg-to-webp');
    });

    test('should redirect /tools/png-to-webp to /tools/convert/png-to-webp', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/png-to-webp', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/tools/convert/png-to-webp');
    });

    test('should redirect /tools/image-compressor to /tools/compress/image-compressor', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/image-compressor', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/tools/compress/image-compressor'
      );
    });

    test('should redirect /tools/image-resizer to /tools/resize/image-resizer', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/image-resizer', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/tools/resize/image-resizer');
    });
  });

  describe('Misrouted category URLs', () => {
    test('should redirect /tools/free-ai-upscaler to /free/free-ai-upscaler', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/free-ai-upscaler', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/free/free-ai-upscaler');
    });
  });

  describe('/article/ to correct category redirects', () => {
    test('should redirect /article/upscale-arw-images to /camera-raw/upscale-arw-images', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/article/upscale-arw-images', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/camera-raw/upscale-arw-images'
      );
    });

    test('should redirect /article/photography-business-enhancement to /industry-insights/photography-business-enhancement', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/article/photography-business-enhancement', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/industry-insights/photography-business-enhancement'
      );
    });

    test('should redirect /article/family-photo-preservation to /photo-restoration/family-photo-preservation', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/article/family-photo-preservation', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/photo-restoration/family-photo-preservation'
      );
    });
  });

  describe('Wrong category slug redirects', () => {
    test('should redirect /industry-insights/real-estate-photo-enhancement to /use-cases/real-estate-photo-enhancement', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest(
        'http://localhost/industry-insights/real-estate-photo-enhancement',
        {
          method: 'GET',
        }
      );

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/use-cases/real-estate-photo-enhancement'
      );
    });
  });

  describe('/undefined/ prefix bug handling', () => {
    test('should redirect /undefined/midjourney-upscaler to /midjourney-upscaler stripping undefined', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/undefined/midjourney-upscaler', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/midjourney-upscaler');
    });

    test('should redirect /undefined/tools/png-to-jpg to /tools/png-to-jpg (strips undefined only)', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/undefined/tools/png-to-jpg', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      // The middleware strips /undefined/ and returns 301 to /tools/png-to-jpg
      // The redirectMap logic would apply on the next request to /tools/png-to-jpg
      // (middleware processes one redirect at a time)
      expect(response.headers.get('location')).toBe('http://localhost/tools/png-to-jpg');
    });
  });

  describe('Existing bulk tool redirects (regression)', () => {
    test('should redirect /tools/bulk-image-resizer to /tools/resize/bulk-image-resizer', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/bulk-image-resizer', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/tools/resize/bulk-image-resizer'
      );
    });

    test('should redirect /tools/bulk-image-compressor to /tools/compress/bulk-image-compressor', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/bulk-image-compressor', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/tools/compress/bulk-image-compressor'
      );
    });
  });

  describe('Locale preservation in redirects', () => {
    test('should preserve /de prefix when redirecting /de/tools/png-to-webp', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/de/tools/png-to-webp', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/de/tools/convert/png-to-webp'
      );
    });

    test('should preserve /fr prefix when redirecting /fr/article/upscale-arw-images', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/fr/article/upscale-arw-images', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'http://localhost/fr/camera-raw/upscale-arw-images'
      );
    });

    test('should preserve /it prefix when redirecting /it/tools/free-ai-upscaler', async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/it/tools/free-ai-upscaler', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('http://localhost/it/free/free-ai-upscaler');
    });
  });
});
