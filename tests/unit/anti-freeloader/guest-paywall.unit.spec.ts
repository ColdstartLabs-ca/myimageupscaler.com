import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createCanvas } from '../../helpers/test-image-generator';

// Mock supabaseAdmin
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {},
}));

// Mock serverEnv
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    NEXT_PUBLIC_STRIPE_PRICE_STARTER: 'price_test_starter',
    NEXT_PUBLIC_STRIPE_PRICE_HOBBY: 'price_test_hobby',
    NEXT_PUBLIC_STRIPE_PRICE_PRO: 'price_test_pro',
    NEXT_PUBLIC_STRIPE_PRICE_BUSINESS: 'price_test_business',
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL: 'price_test_credits_small',
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM: 'price_test_credits_medium',
    NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE: 'price_test_credits_large',
  },
  serverEnv: { ENV: 'test' },
}));

// Mock logger
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock guest-rate-limiter
vi.mock('@server/services/guest-rate-limiter', () => ({
  checkGuestLimits: vi.fn().mockResolvedValue({ allowed: true }),
  incrementGuestUsage: vi.fn().mockResolvedValue(undefined),
}));

// Mock guest-processor
vi.mock('@server/services/guest-processor', () => ({
  processGuestImage: vi.fn().mockResolvedValue({
    imageUrl: 'https://example.com/result.png',
    expiresAt: new Date().toISOString(),
    mimeType: 'image/png',
  }),
}));

// Mock analytics
vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(),
}));

// Import AFTER mocks
import { POST } from '../../../app/api/upscale/guest/route';
import { PAYWALLED_COUNTRIES } from '@/lib/anti-freeloader/region-classifier';

function makeGuestRequest(
  options: { country?: string; body?: Record<string, unknown> } = {}
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'cf-connecting-ip': '1.2.3.4',
  };
  if (options.country) {
    headers['x-test-country'] = options.country;
  }

  const body = options.body ?? {
    imageData: 'data:image/png;base64,' + 'a'.repeat(200),
    mimeType: 'image/png',
    visitorId: 'test-visitor-id-12345',
  };

  return new NextRequest('http://localhost/api/upscale/guest', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/upscale/guest - Country Paywall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any countries added to paywall set
    PAYWALLED_COUNTRIES.clear();
  });

  it('should return 403 for paywalled country', async () => {
    // Add a test country to the paywall set
    PAYWALLED_COUNTRIES.add('XX');

    const req = makeGuestRequest({ country: 'XX' });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('not available in your region');
    expect(body.error.details?.upgradeUrl).toBe('/pricing');
  });

  it('should allow non-paywalled country', async () => {
    // US is not paywalled
    const req = makeGuestRequest({ country: 'US' });
    const res = await POST(req);

    // Should not be 403 (might be 200 or 429, but not 403)
    expect(res.status).not.toBe(403);
  });

  it('should allow when no country header present', async () => {
    // No country header - should proceed (safe default)
    const req = makeGuestRequest({ country: undefined });
    const res = await POST(req);

    // Should not be 403
    expect(res.status).not.toBe(403);
  });

  it('should allow restricted country (not paywalled)', async () => {
    // IN is restricted but not paywalled
    const req = makeGuestRequest({ country: 'IN' });
    const res = await POST(req);

    // Should not be 403 (restricted users can still use guest upscaler)
    expect(res.status).not.toBe(403);
  });

  it('should return FORBIDDEN error code for paywalled country', async () => {
    PAYWALLED_COUNTRIES.add('XX');

    const req = makeGuestRequest({ country: 'XX' });
    const res = await POST(req);
    const body = await res.json();

    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('should not call rate limiter for paywalled country (early exit)', async () => {
    PAYWALLED_COUNTRIES.add('XX');

    const { checkGuestLimits } = await import('@server/services/guest-rate-limiter');

    const req = makeGuestRequest({ country: 'XX' });
    await POST(req);

    // Rate limiter should not be called since we exit early
    expect(checkGuestLimits).not.toHaveBeenCalled();
  });

  it('should not call guest processor for paywalled country (early exit)', async () => {
    PAYWALLED_COUNTRIES.add('XX');

    const { processGuestImage } = await import('@server/services/guest-processor');

    const req = makeGuestRequest({ country: 'XX' });
    await POST(req);

    // Processor should not be called since we exit early
    expect(processGuestImage).not.toHaveBeenCalled();
  });

  it('should reject oversized guest image dimensions before processing', async () => {
    const { processGuestImage } = await import('@server/services/guest-processor');

    const req = makeGuestRequest({
      country: 'US',
      body: {
        imageData: createCanvas(2000, 2000),
        mimeType: 'image/png',
        visitorId: 'test-visitor-id-12345',
      },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('IMAGE_TOO_LARGE');
    expect(processGuestImage).not.toHaveBeenCalled();
  });

  it('should track paywall_shown event for paywalled country', async () => {
    PAYWALLED_COUNTRIES.add('XX');

    const { trackServerEvent } = await import('@server/analytics');

    const req = makeGuestRequest({ country: 'XX' });
    await POST(req);

    // Analytics should be called with paywall_shown event
    expect(trackServerEvent).toHaveBeenCalledWith(
      'paywall_shown',
      { country: 'XX', context: 'guest_api' },
      { apiKey: undefined }
    );
  });

  it('should not track paywall_shown event for non-paywalled country', async () => {
    const { trackServerEvent } = await import('@server/analytics');

    const req = makeGuestRequest({ country: 'US' });
    await POST(req);

    // Analytics should not be called for paywall_shown
    expect(trackServerEvent).not.toHaveBeenCalledWith(
      'paywall_shown',
      expect.any(Object),
      expect.any(Object)
    );
  });
});
