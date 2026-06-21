import { describe, test, expect, vi, beforeEach } from 'vitest';
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
    PRIMARY_DOMAIN: 'myimageupscaler.com',
  },
  serverEnv: {
    ENV: 'test',
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost',
    AMPLITUDE_API_KEY: 'test_amplitude_api_key',
  },
  isDevelopment: () => false,
}));

vi.mock('@shared/utils/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

describe('pSEO middleware auth CPU guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('does not refresh Supabase session for public unlocalized pSEO pages', async () => {
    const { middleware } = await import('../../../middleware');
    const { updateSession } = await import('@shared/utils/supabase/middleware');

    const request = new NextRequest('http://localhost/tools/ai-image-upscaler', {
      method: 'GET',
    });

    const response = await middleware(request);

    expect(updateSession).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  test('still refreshes Supabase session for locale-prefixed dashboard routes', async () => {
    const { middleware } = await import('../../../middleware');
    const { updateSession } = await import('@shared/utils/supabase/middleware');
    (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-123', email: 'test@example.com' },
      supabaseResponse: NextResponse.next(),
    });

    const request = new NextRequest('http://localhost/pt/dashboard', {
      method: 'GET',
    });

    const response = await middleware(request);

    expect(updateSession).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });
});
