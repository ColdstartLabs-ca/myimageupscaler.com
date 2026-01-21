import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Use vi.hoisted to define mock function before mocks are hoisted
const { mockHandlePageAuth } = vi.hoisted(() => ({
  mockHandlePageAuth: vi.fn(),
}));

// Mock all env exports
vi.mock('@shared/config/env', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/env')>();
  return {
    ...actual,
    serverEnv: {
      ...actual.serverEnv,
      ENV: 'development', // Not test - we want to test the auth redirect logic
    },
  };
});

// Mock handlePageAuth
vi.mock('@lib/middleware', async importOriginal => {
  const actual = await importOriginal<typeof import('@lib/middleware')>();
  return {
    ...actual,
    handlePageAuth: mockHandlePageAuth,
  };
});

// Import middleware after mocks are set up
import { middleware } from '../../middleware';

describe('landing-redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation - unauthenticated user
    mockHandlePageAuth.mockResolvedValue({
      user: null,
      response: NextResponse.next(),
    });
  });

  describe('authenticated user on root path', () => {
    test('should redirect authenticated user from / to /dashboard', async () => {
      // Mock authenticated user
      mockHandlePageAuth.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        response: NextResponse.next(),
      });

      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await middleware(request);

      // Should redirect to dashboard
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/dashboard');
    });
  });

  describe('unauthenticated user on root path', () => {
    test('should allow unauthenticated user to view landing page', async () => {
      // Mock unauthenticated user
      mockHandlePageAuth.mockResolvedValue({
        user: null,
        response: NextResponse.next(),
      });

      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await middleware(request);

      // Should NOT redirect to dashboard - the response should be a rewrite, not a redirect
      // Status 200 indicates rewrite (not a redirect)
      expect(response.status).toBe(200);
      // No location header means not a redirect
      const location = response.headers.get('location');
      expect(location).toBeNull();
    });
  });

  describe('authenticated user with login param', () => {
    test('should not redirect if login query param is present', async () => {
      // Mock authenticated user
      mockHandlePageAuth.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        response: NextResponse.next(),
      });

      const request = new NextRequest(new URL('http://localhost:3000/?login=1'));
      const response = await middleware(request);

      // Should not redirect to dashboard because login param is present
      // Rewrite to /en instead
      expect(response.status).toBe(200);
      const location = response.headers.get('location');
      expect(location).toBeNull();
    });
  });

  describe('test environment handling', () => {
    test('should skip auth redirect with x-test-env header', async () => {
      // Mock authenticated user
      mockHandlePageAuth.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        response: NextResponse.next(),
      });

      const request = new NextRequest(new URL('http://localhost:3000/'), {
        headers: { 'x-test-env': 'true' },
      });
      const response = await middleware(request);

      // Should not redirect to dashboard due to test header - rewrite instead
      expect(response.status).toBe(200);
      const location = response.headers.get('location');
      expect(location).toBeNull();
    });

    test('should skip auth redirect with x-playwright-test header', async () => {
      // Mock authenticated user
      mockHandlePageAuth.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
        response: NextResponse.next(),
      });

      const request = new NextRequest(new URL('http://localhost:3000/'), {
        headers: { 'x-playwright-test': 'true' },
      });
      const response = await middleware(request);

      // Should not redirect to dashboard due to test header - rewrite instead
      expect(response.status).toBe(200);
      const location = response.headers.get('location');
      expect(location).toBeNull();
    });
  });
});
