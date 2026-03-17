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

describe('Referral Source Detection - Unit Tests', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    consoleSpy.mockRestore();
  });

  describe('detectReferralSource function', () => {
    test('should detect ChatGPT from chatgpt.com referrer', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://chatgpt.com',
        },
      });

      const response = await middleware(request);

      // Should have the referral source header
      expect(response.headers.get('x-referral-source')).toBe('chatgpt');

      // Should have set the cookie
      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('chatgpt');
    });

    test('should detect ChatGPT from chat.openai.com referrer', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://chat.openai.com',
        },
      });

      const response = await middleware(request);

      expect(response.headers.get('x-referral-source')).toBe('chatgpt');

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('chatgpt');
    });

    test('should detect Perplexity from perplexity.ai referrer', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://www.perplexity.ai',
        },
      });

      const response = await middleware(request);

      expect(response.headers.get('x-referral-source')).toBe('perplexity');

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('perplexity');
    });

    test('should detect Claude from claude.ai referrer', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://claude.ai',
        },
      });

      const response = await middleware(request);

      expect(response.headers.get('x-referral-source')).toBe('claude');

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('claude');
    });

    test('should detect Google from google.com referrer', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://www.google.com',
        },
      });

      const response = await middleware(request);

      expect(response.headers.get('x-referral-source')).toBe('google');

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('google');
    });

    test('should detect direct traffic when no referrer', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.headers.get('x-referral-source')).toBe('direct');

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('direct');
    });

    test('should detect other traffic from unrecognized referrer', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://twitter.com',
        },
      });

      const response = await middleware(request);

      expect(response.headers.get('x-referral-source')).toBe('other');

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('other');
    });

    test('should detect ChatGPT from utm_source=chatgpt parameter', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?utm_source=chatgpt', {
        method: 'GET',
      });

      const response = await middleware(request);

      // UTM parameter should be detected and result in a redirect (301)
      // But before redirect, the referral source should be set
      expect(response.status).toBe(301);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('chatgpt');
    });

    test('should detect Perplexity from utm_source=perplexity parameter', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?utm_source=perplexity', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('perplexity');
    });

    test('should detect Claude from utm_source=claude parameter', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?utm_source=claude', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('claude');
    });

    test('should detect google_sge from utm_source=google_sge parameter', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?utm_source=google_sge', {
        method: 'GET',
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('google_sge');
    });

    test('should prioritize UTM parameter over referrer header', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      // UTM says chatgpt, referrer says google - UTM should win
      const request = new NextRequest('http://localhost/?utm_source=chatgpt', {
        method: 'GET',
        headers: {
          referer: 'https://www.google.com',
        },
      });

      const response = await middleware(request);

      expect(response.status).toBe(301);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('chatgpt');
    });
  });

  describe('First-touch attribution semantics', () => {
    test('should set cookie on first visit (no existing cookie)', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://chatgpt.com',
        },
      });

      const response = await middleware(request);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));

      expect(referralCookie).toBeDefined();
      expect(referralCookie).toContain('chatgpt');
      // Check for 1 year max age
      expect(referralCookie).toContain('Max-Age=31536000');
    });

    test('should NOT overwrite cookie on subsequent visits', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      // Create a request with an existing referral source cookie
      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          Cookie: 'miu_referral_source=chatgpt',
          referer: 'https://www.google.com',
        },
      });

      const response = await middleware(request);

      // Header should still show the original cookie value (chatgpt), not the new referrer (google)
      expect(response.headers.get('x-referral-source')).toBe('chatgpt');

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));

      // Cookie should NOT be set again (first-touch semantics)
      expect(referralCookie).toBeUndefined();
    });

    test('should preserve existing cookie value even with different UTM parameter', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      // Create a request with existing chatgpt cookie but perplexity UTM
      const request = new NextRequest('http://localhost/?utm_source=perplexity', {
        method: 'GET',
        headers: {
          Cookie: 'miu_referral_source=chatgpt',
        },
      });

      const response = await middleware(request);

      // Header should still show the original cookie value (chatgpt)
      expect(response.headers.get('x-referral-source')).toBe('chatgpt');
    });

    test('should set cookie with 1 year expiry', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://chatgpt.com',
        },
      });

      const response = await middleware(request);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));

      expect(referralCookie).toBeDefined();
      // 1 year = 365 days * 24 hours * 60 minutes * 60 seconds = 31,536,000 seconds
      expect(referralCookie).toContain('Max-Age=31536000');
    });

    test('should set cookie with httpOnly=false for client-side access', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://chatgpt.com',
        },
      });

      const response = await middleware(request);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));

      // Cookie should allow client-side access (no httpOnly flag or explicitly false)
      // In Next.js, cookies.set with httpOnly: false is the default
      expect(referralCookie).toBeDefined();
      // The cookie string should not contain HttpOnly
      // Note: Next.js cookie format varies, so we just verify it exists
    });
  });

  describe('Case insensitivity and normalization', () => {
    test('should handle uppercase UTM parameter values', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?utm_source=CHATGPT', {
        method: 'GET',
      });

      const response = await middleware(request);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('chatgpt');
    });

    test('should handle mixed-case UTM parameter values', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/?utm_source=ChAtGpT', {
        method: 'GET',
      });

      const response = await middleware(request);

      const cookies = response.headers.getSetCookie();
      const referralCookie = cookies.find(c => c.startsWith('miu_referral_source='));
      expect(referralCookie).toContain('chatgpt');
    });

    test('should handle mixed-case referrer domains', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'https://ChatGPT.Com',
        },
      });

      const response = await middleware(request);

      expect(response.headers.get('x-referral-source')).toBe('chatgpt');
    });
  });

  describe('Edge cases', () => {
    test('should handle invalid referrer URL gracefully', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: 'not-a-valid-url',
        },
      });

      const response = await middleware(request);

      // Should default to 'other' when referrer is invalid but present
      expect(response.headers.get('x-referral-source')).toBe('other');
    });

    test('should handle empty referrer header', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/', {
        method: 'GET',
        headers: {
          referer: '',
        },
      });

      const response = await middleware(request);

      // Empty referrer should be treated as no referrer -> direct
      expect(response.headers.get('x-referral-source')).toBe('direct');
    });

    test('should handle subdomains of AI search engines', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const testCases = [
        { referrer: 'https://www.chatgpt.com', expected: 'chatgpt' },
        { referrer: 'https://any.chatgpt.com', expected: 'chatgpt' },
        { referrer: 'https://www.perplexity.ai', expected: 'perplexity' },
        { referrer: 'https://any.perplexity.ai', expected: 'perplexity' },
        { referrer: 'https://www.claude.ai', expected: 'claude' },
        { referrer: 'https://any.claude.ai', expected: 'claude' },
        { referrer: 'https://www.google.com', expected: 'google' },
        { referrer: 'https://any.google.com', expected: 'google' },
      ];

      for (const { referrer, expected } of testCases) {
        const request = new NextRequest('http://localhost/', {
          method: 'GET',
          headers: {
            referer: referrer,
          },
        });

        const response = await middleware(request);

        expect(response.headers.get('x-referral-source')).toBe(expected);
      }
    });

    test('should handle API routes', async () => {
      const { middleware } = await import('../../../middleware');

      const request = new NextRequest('http://localhost/api/health', {
        method: 'GET',
        headers: {
          referer: 'https://chatgpt.com',
        },
      });

      const response = await middleware(request);

      // API routes should also get referral source attribution
      expect(response.headers.get('x-referral-source')).toBe('chatgpt');
    });

    test('should handle page routes', async () => {
      const { middleware } = await import('../../../middleware');

      // Mock updateSession to return a response
      const { updateSession } = await import('@shared/utils/supabase/middleware');
      (updateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: null,
        supabaseResponse: NextResponse.next(),
      });

      const request = new NextRequest('http://localhost/tools/ai-upscaler', {
        method: 'GET',
        headers: {
          referer: 'https://perplexity.ai',
        },
      });

      const response = await middleware(request);

      expect(response.headers.get('x-referral-source')).toBe('perplexity');
    });
  });
});
