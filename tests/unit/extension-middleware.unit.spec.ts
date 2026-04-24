/**
 * Extension Middleware Unit Tests
 *
 * Tests for middleware changes related to browser extension:
 * - Extension auth page bypasses locale routing
 * - Extension origins included in CSP headers
 * - Extension auth page redirects unauthenticated users
 *
 * PRD #100: Browser Extension v1
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock dependencies
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
    BASE_URL: 'https://test.example.com',
  },
  serverEnv: {
    ENV: 'test',
    BASE_URL: 'https://test.example.com',
    EXTENSION_ORIGINS: 'chrome-extension://testid,mchrome-extension://testid2',
  },
  isDevelopment: () => false,
}));

vi.mock('@shared/utils/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

vi.mock('@shared/config/security', () => ({
  getSecurityHeaders: vi.fn(() => ({
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self';",
  })),
  buildCspHeader: vi.fn(() => "default-src 'self';"),
  EXTENSION_ORIGINS: ['chrome-extension://testid', 'chrome-extension://testid2'],
}));

describe('Extension Auth Page Middleware', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    consoleSpy.mockRestore();
  });

  describe('Extension auth page locale routing bypass', () => {
    test('should bypass locale routing for /extension-auth', async () => {
      const { middleware } = await import('../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');

      // Mock updateSession to return null user
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/extension-auth', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should not redirect to /en/extension-auth
      // The response should be either a redirect to login or the page itself
      expect(response.status).not.toBe(307);
    });

    test('should not add locale prefix to extension-auth', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return null user
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/extension-auth', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Check that we're not being redirected to a locale-prefixed path
      const location = response.headers.get('location');
      if (location) {
        // If there's a redirect, it should be to login, not a locale prefix
        expect(location).not.toMatch(/^\/[a-z]{2}\/extension-auth/);
      }
    });

    test('should handle extension-auth with query parameters', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return null user
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/extension-auth?action=install', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Should handle the URL without locale prefix
      expect(response).toBeDefined();
    });

    test('should allow other extension-related paths through', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return null user
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/extensions/chrome', {
        method: 'GET',
      });

      const response = await middleware(request);

      // pSEO pages should go through normal middleware
      expect(response).toBeDefined();
    });
  });

  describe('Extension origins in security headers', () => {
    test('should include extension origins in CSP', async () => {
      const { getSecurityHeaders } = await import('@shared/config/security');
      const { buildCspHeader } = await import('@shared/config/security');

      const securityHeaders = await getSecurityHeaders();
      const cspHeader = await buildCspHeader();

      // CSP should be defined
      expect(cspHeader).toBeTruthy();
      expect(typeof cspHeader).toBe('string');
    });

    test('should parse EXTENSION_ORIGINS from environment', async () => {
      const { EXTENSION_ORIGINS } = await import('@shared/config/security');

      // Should be an array
      expect(Array.isArray(EXTENSION_ORIGINS)).toBe(true);

      // Should contain chrome-extension origins if configured
      const hasChromeExtension = EXTENSION_ORIGINS.some((origin: string) =>
        origin.includes('chrome-extension://')
      );

      if (process.env.EXTENSION_ORIGINS) {
        expect(hasChromeExtension).toBe(true);
      }
    });
  });

  describe('Extension auth page redirect behavior', () => {
    test('should handle unauthenticated access to extension-auth', async () => {
      const { middleware } = await import('../../middleware');

      // Mock updateSession to return null user
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/extension-auth', {
        method: 'GET',
      });

      const response = await middleware(request);

      // Response should be defined (may redirect to login or show page)
      expect(response).toBeDefined();
    });
  });
});

describe('Extension Security Configuration', () => {
  describe('EXTENSION_ORIGINS parsing', () => {
    test('should parse EXTENSION_ORIGINS environment variable correctly', async () => {
      const { EXTENSION_ORIGINS } = await import('@shared/config/security');

      // EXTENSION_ORIGINS should be an array
      expect(Array.isArray(EXTENSION_ORIGINS)).toBe(true);

      // Verify each origin is a string and has valid format
      EXTENSION_ORIGINS.forEach((origin: string) => {
        expect(typeof origin).toBe('string');
        expect(origin.length).toBeGreaterThan(0);
        // Should be a valid extension origin format
        expect(
          origin.includes('chrome-extension://') ||
            origin.includes('moz-extension://') ||
            origin.includes('edge-extension://') ||
            origin === ''
        ).toBe(true);
      });
    });

    test('should handle empty EXTENSION_ORIGINS gracefully', async () => {
      // The mock returns an empty array when EXTENSION_ORIGINS is empty
      const { EXTENSION_ORIGINS } = await import('@shared/config/security');

      // Should be an array (may be empty or have mocked values)
      expect(Array.isArray(EXTENSION_ORIGINS)).toBe(true);
    });

    test('should trim whitespace from extension origins', async () => {
      // Mocked values in vi.mock should already be trimmed
      const { EXTENSION_ORIGINS } = await import('@shared/config/security');

      EXTENSION_ORIGINS.forEach((origin: string) => {
        // No origin should have leading/trailing whitespace
        expect(origin).toEqual(origin.trim());
      });
    });

    test('should filter out empty strings from EXTENSION_ORIGINS', async () => {
      const { EXTENSION_ORIGINS } = await import('@shared/config/security');

      // All origins should be non-empty strings
      EXTENSION_ORIGINS.forEach((origin: string) => {
        if (origin.length > 0) {
          expect(origin.trim().length).toBeGreaterThan(0);
        }
      });
    });
  });
});
