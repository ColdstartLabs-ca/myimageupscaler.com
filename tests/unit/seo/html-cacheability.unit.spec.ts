import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('@server/rateLimit', () => ({
  rateLimit: { limit: vi.fn() },
  publicRateLimit: { limit: vi.fn() },
}));
vi.mock('@shared/config/env', () => ({
  clientEnv: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' },
  serverEnv: { ENV: 'test', AMPLITUDE_API_KEY: 'test_amplitude_api_key' },
  isDevelopment: () => false,
}));
vi.mock('@shared/utils/supabase/middleware', () => ({ updateSession: vi.fn() }));

describe('anonymous HTML cacheability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should not set any cookie when an anonymous visitor requests a page route', async () => {
    const { updateSession } = await import('@shared/utils/supabase/middleware');
    (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: null,
      supabaseResponse: NextResponse.next(),
    });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/pricing'));

    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    ['a geo-detected locale-less page', 'http://localhost/pricing', { 'CF-IPCountry': 'PT' }],
    ['an explicitly localized public page', 'http://localhost/fr/pricing', {}],
  ])('should keep %s cookie-free', async (_label, url, headers) => {
    const { updateSession } = await import('@shared/utils/supabase/middleware');
    (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: null,
      supabaseResponse: NextResponse.next(),
    });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest(url, { headers }));

    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('should preserve auth cookies returned by the session middleware', async () => {
    const { updateSession } = await import('@shared/utils/supabase/middleware');
    const authResponse = NextResponse.next();
    authResponse.cookies.set('sb-access-token', 'session');
    (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-1' },
      supabaseResponse: authResponse,
    });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/fr/dashboard'));

    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([expect.stringContaining('sb-access-token=session')])
    );
  });
});
