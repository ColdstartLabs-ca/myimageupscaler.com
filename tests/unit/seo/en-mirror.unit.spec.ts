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

describe('/en mirror redirects', () => {
  beforeEach(async () => {
    const { updateSession } = await import('@shared/utils/supabase/middleware');
    (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: null,
      supabaseResponse: NextResponse.next(),
    });
  });

  it('should 301 /en/scale/2k-upscaler to the root equivalent', async () => {
    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/en/scale/2k-upscaler'));

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('http://localhost/scale/2k-upscaler');
  });

  it('should preserve multiple query parameters', async () => {
    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/en/blog?page=43&x=1'));

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('http://localhost/blog?page=43&x=1');
  });
});
