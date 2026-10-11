/**
 * Gallery Thumbnail Cookie Auth Unit Tests (SQR02)
 *
 * The thumbnail image is loaded by <img> tags, which cannot send an Authorization
 * header. The middleware must therefore allow GET /api/gallery/thumb/<id> to
 * authenticate from the existing Supabase session cookie (handlePageAuth) while
 * every other API stays bearer-only.
 *
 * Contract under test:
 * - GET thumb without Authorization calls handlePageAuth, copies any refreshed
 *   session cookies onto the response, and authenticates the verified user.
 * - The verified user overrides any client-supplied X-User-Id, and is used for
 *   user rate limiting.
 * - An unauthenticated cookie is rejected with 401.
 * - A present-but-invalid Bearer token must NOT fall back to the cookie.
 * - Other API routes (list, DELETE thumb) keep the bearer-only behavior.
 *
 * The real middleware is imported; only the `@lib/middleware` barrel entry points
 * are replaced, matching the existing middleware unit tests.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  handlePageAuth: vi.fn(),
  verifyApiAuth: vi.fn(),
  applyUserRateLimit: vi.fn(),
}));

vi.mock('@lib/middleware', async importOriginal => {
  const actual = await importOriginal<typeof import('@lib/middleware')>();
  return {
    ...actual,
    handlePageAuth: mocks.handlePageAuth,
    verifyApiAuth: mocks.verifyApiAuth,
    applyUserRateLimit: mocks.applyUserRateLimit,
  };
});

vi.mock('@server/rateLimit', () => ({
  rateLimit: { limit: vi.fn() },
  publicRateLimit: { limit: vi.fn() },
  upscaleStatusRateLimit: { limit: vi.fn() },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    ENV: 'test',
    NODE_ENV: 'test',
    PLAYWRIGHT_TEST: '0',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    AMPLITUDE_API_KEY: 'test-amplitude',
  },
  clientEnv: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
  isDevelopment: () => false,
}));

vi.mock('@shared/utils/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

import { middleware } from '../../../middleware';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const THUMB_PATH = `/api/gallery/thumb/${USER_ID}`;
const COOKIE = 'sb-access-token=access; sb-refresh-token=refresh';

function unauthorized() {
  return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
}

function request(path = THUMB_PATH, method = 'GET', extraHeaders: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { cookie: COOKIE, ...extraHeaders },
  });
}

describe('Gallery thumbnail cookie auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyApiAuth.mockResolvedValue({ error: unauthorized() });
    mocks.handlePageAuth.mockResolvedValue({ user: null, response: NextResponse.next() });
    mocks.applyUserRateLimit.mockResolvedValue(null);
  });

  test('authenticates a cookie-only GET thumb via handlePageAuth', async () => {
    mocks.handlePageAuth.mockResolvedValue({
      user: { id: 'real-user', email: 'real@example.com' },
      response: NextResponse.next(),
    });

    const req = request();
    const res = await middleware(req);

    expect(mocks.handlePageAuth).toHaveBeenCalledWith(req);
    expect(mocks.verifyApiAuth).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-request-x-user-id')).toBe('real-user');
    expect(mocks.applyUserRateLimit).toHaveBeenCalledWith('real-user', expect.anything(), req);
  });

  test('overrides a forged X-User-Id with the verified cookie user', async () => {
    mocks.handlePageAuth.mockResolvedValue({
      user: { id: 'real-user' },
      response: NextResponse.next(),
    });

    const res = await middleware(request(THUMB_PATH, 'GET', { 'X-User-Id': 'forged-user' }));

    expect(res.headers.get('x-middleware-request-x-user-id')).toBe('real-user');
    expect(res.headers.get('x-middleware-request-x-user-id')).not.toBe('forged-user');
  });

  test('copies refreshed session cookies from handlePageAuth onto the response', async () => {
    const sessionResponse = NextResponse.next();
    sessionResponse.cookies.set('sb-refresh-token', 'rotated-refresh', { path: '/' });
    mocks.handlePageAuth.mockResolvedValue({
      user: { id: 'real-user' },
      response: sessionResponse,
    });

    const res = await middleware(request());

    expect(res.cookies.get('sb-refresh-token')?.value).toBe('rotated-refresh');
  });

  test('rejects an unauthenticated cookie with 401', async () => {
    mocks.handlePageAuth.mockResolvedValue({ user: null, response: NextResponse.next() });

    const res = await middleware(request());

    expect(mocks.handlePageAuth).toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect(mocks.applyUserRateLimit).not.toHaveBeenCalled();
  });

  test('propagates cleared session cookies on a 401 cookie-auth rejection', async () => {
    const sessionResponse = NextResponse.next();
    sessionResponse.cookies.set('sb-access-token', '', { path: '/', maxAge: 0 });
    sessionResponse.cookies.set('sb-refresh-token', '', { path: '/', maxAge: 0 });
    mocks.handlePageAuth.mockResolvedValue({ user: null, response: sessionResponse });

    const res = await middleware(request());

    expect(res.status).toBe(401);
    expect(res.cookies.get('sb-access-token')?.value).toBe('');
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('');
  });

  test('propagates refreshed cookie attributes on a 429 rate-limit response', async () => {
    const sessionResponse = NextResponse.next();
    sessionResponse.cookies.set('sb-refresh-token', 'rotated-refresh', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 3600,
    });
    mocks.handlePageAuth.mockResolvedValue({
      user: { id: 'real-user' },
      response: sessionResponse,
    });
    mocks.applyUserRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    );

    const res = await middleware(request());

    expect(res.status).toBe(429);
    const cookie = res.cookies.get('sb-refresh-token');
    expect(cookie?.value).toBe('rotated-refresh');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.secure).toBe(true);
    expect(cookie?.maxAge).toBe(3600);
  });

  test('does not fall back to the cookie when an invalid Bearer token is present', async () => {
    mocks.verifyApiAuth.mockResolvedValue({ error: unauthorized() });

    const res = await middleware(
      request(THUMB_PATH, 'GET', { Authorization: 'Bearer not-a-valid-jwt' })
    );

    expect(res.status).toBe(401);
    expect(mocks.verifyApiAuth).toHaveBeenCalled();
    expect(mocks.handlePageAuth).not.toHaveBeenCalled();
  });

  test('keeps other API routes bearer-only', async () => {
    mocks.verifyApiAuth.mockResolvedValue({ error: unauthorized() });

    const res = await middleware(request('/api/gallery'));

    expect(res.status).toBe(401);
    expect(mocks.handlePageAuth).not.toHaveBeenCalled();
  });

  test('does not allow cookie auth for DELETE thumb', async () => {
    mocks.verifyApiAuth.mockResolvedValue({ error: unauthorized() });

    const res = await middleware(request(THUMB_PATH, 'DELETE'));

    expect(res.status).toBe(401);
    expect(mocks.handlePageAuth).not.toHaveBeenCalled();
  });
});
