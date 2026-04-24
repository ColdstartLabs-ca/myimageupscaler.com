/**
 * Cannibalization Redirects Unit Tests — Phase 4
 *
 * Verifies that cannibalizing blog URLs are 301-redirected
 * to their canonical targets via the middleware redirectMap.
 *
 * Redirect map:
 *   /blog/photo-enhancement-upscaling-vs-quality → /blog/ai-image-upscaling-vs-sharpening-explained
 *   /blog/best-free-ai-image-upscaler-tools-2026 → /blog/best-free-ai-image-upscaler-2026-tested-compared
 *   /blog/restore-old-photos-online → /use-cases/old-photo-restoration
 *   /blog/free-upscaler-no-sign-up → /blog/free-ai-upscaler-no-watermark
 *   /blog/upscale-image-online-free → /blog/free-ai-upscaler-no-watermark
 *   /blog/ai-vs-traditional-image-upscaling → /blog/ai-image-upscaling-vs-sharpening-explained
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock all middleware dependencies
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

const CANNIBALIZATION_REDIRECTS = [
  {
    from: '/blog/photo-enhancement-upscaling-vs-quality',
    to: '/blog/ai-image-upscaling-vs-sharpening-explained',
  },
  {
    from: '/blog/best-free-ai-image-upscaler-tools-2026',
    to: '/blog/best-free-ai-image-upscaler-2026-tested-compared',
  },
  {
    from: '/blog/restore-old-photos-online',
    to: '/use-cases/old-photo-restoration',
  },
  {
    from: '/blog/free-upscaler-no-sign-up',
    to: '/blog/free-ai-upscaler-no-watermark',
  },
  {
    from: '/blog/upscale-image-online-free',
    to: '/blog/free-ai-upscaler-no-watermark',
  },
  {
    from: '/blog/ai-vs-traditional-image-upscaling',
    to: '/blog/ai-image-upscaling-vs-sharpening-explained',
  },
];

describe('Cannibalization Redirects', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    consoleSpy.mockRestore();
  });

  for (const { from, to } of CANNIBALIZATION_REDIRECTS) {
    test(`should 301 redirect ${from} to ${to}`, async () => {
      const { middleware } = await import('../../../middleware');
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest(`http://localhost${from}`, {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(`http://localhost${to}`);
    });
  }
});
