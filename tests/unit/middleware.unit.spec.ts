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
}));

vi.mock('@shared/utils/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

describe('Authentication Middleware', () => {
  let consoleSpy: any;

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

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as any).mockResolvedValue({
        user: null,
        supabaseResponse: new NextResponse(),
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

});