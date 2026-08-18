import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockClaimFreeCreditGrant, mockTrackServerEvent } = vi.hoisted(() => ({
  mockClaimFreeCreditGrant: vi.fn(),
  mockTrackServerEvent: vi.fn(),
}));

vi.mock('@server/services/free-credit-grant.service', () => ({
  claimFreeCreditGrant: mockClaimFreeCreditGrant,
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'test', AMPLITUDE_API_KEY: 'test-amplitude-api-key' },
}));

vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { POST } from '../../../app/api/users/setup/route';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

function makeRequest(
  options: {
    userId?: string | null;
    country?: string;
    ip?: string;
    userAgent?: string;
    attribution?: Record<string, unknown>;
  } = {}
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.userId !== undefined && options.userId !== null)
    headers['X-User-Id'] = options.userId;
  if (options.country) headers['x-test-country'] = options.country;
  if (options.ip) headers['CF-Connecting-IP'] = options.ip;
  if (options.userAgent) headers['user-agent'] = options.userAgent;

  return new NextRequest('http://localhost/api/users/setup', {
    method: 'POST',
    headers,
    body: JSON.stringify(options.attribution ? { attribution: options.attribution } : {}),
  });
}

function makeProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    region_tier: null,
    subscription_tier: null,
    subscription_status: null,
    subscription_credits_balance: 0,
    purchased_credits_balance: 0,
    signup_country: null,
    ...overrides,
  };
}

function mockProfile(profile = makeProfile()): void {
  const from = supabaseAdmin.from as ReturnType<typeof vi.fn>;
  from.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: profile }) })),
    })),
    update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
  });
}

describe('POST /api/users/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile();
    mockClaimFreeCreditGrant.mockResolvedValue({
      grantedCredits: 5,
      existingGrant: false,
      matchedAccountCount: 0,
      newTotalBalance: 5,
    });
    mockTrackServerEvent.mockResolvedValue(true);
  });

  it('returns 401 without an authenticated user', async () => {
    const res = await POST(makeRequest({ userId: null }));
    expect(res.status).toBe(401);
  });

  it('grants a first free account exactly once through the server-side grant service', async () => {
    const res = await POST(
      makeRequest({
        userId: '00000000-0000-4000-8000-000000000001',
        country: 'US',
        ip: '203.0.113.42',
      })
    );

    expect(res.status).toBe(200);
    expect(mockClaimFreeCreditGrant).toHaveBeenCalledWith(
      expect.any(NextRequest),
      '00000000-0000-4000-8000-000000000001',
      'standard'
    );
  });

  it('delegates setup retries to the idempotent grant service', async () => {
    mockProfile(makeProfile({ region_tier: 'standard', signup_country: 'US' }));

    const res = await POST(makeRequest({ userId: 'user-123', country: 'US' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.alreadySetup).toBe(true);
    expect(mockClaimFreeCreditGrant).toHaveBeenCalledOnce();
  });

  it('never grants free credits to a paid account', async () => {
    mockProfile(makeProfile({ subscription_tier: 'pro', subscription_status: 'active' }));

    const res = await POST(makeRequest({ userId: 'user-123', country: 'US' }));

    expect(res.status).toBe(200);
    expect(mockClaimFreeCreditGrant).not.toHaveBeenCalled();
  });

  it('returns a retryable pending response when a free profile cannot be classified', async () => {
    const res = await POST(makeRequest({ userId: 'user-123' }));

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({
      success: false,
      setupStatus: 'pending',
      retryable: true,
    });
    expect(mockClaimFreeCreditGrant).not.toHaveBeenCalled();
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('completes setup instead of 404ing when the profile row has not been created yet', async () => {
    mockProfile(null as unknown as Record<string, unknown>);

    const res = await POST(makeRequest({ userId: 'user-123', country: 'US' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      setupStatus: 'complete',
      creditGrantDeferred: true,
    });
    expect(mockClaimFreeCreditGrant).not.toHaveBeenCalled();
  });

  it('completes setup instead of 500ing when the free credit grant fails', async () => {
    mockClaimFreeCreditGrant.mockRejectedValue(new Error('claim_free_credit_grant failed'));

    const res = await POST(makeRequest({ userId: 'user-123', country: 'US', ip: '203.0.113.42' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      setupStatus: 'complete',
      creditGrantDeferred: true,
    });
  });

  it('does not report a deferred grant when the grant succeeds', async () => {
    const res = await POST(makeRequest({ userId: 'user-123', country: 'US', ip: '203.0.113.42' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.creditGrantDeferred).toBeUndefined();
  });

  it('tracks a reduced grant without storing a raw IP or browser fingerprint', async () => {
    mockClaimFreeCreditGrant.mockResolvedValue({
      grantedCredits: 3,
      existingGrant: false,
      matchedAccountCount: 1,
      newTotalBalance: 3,
    });

    await POST(makeRequest({ userId: 'user-123', country: 'US', ip: '203.0.113.42' }));

    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'free_credits_reduced',
      expect.objectContaining({ requestedCredits: 5, grantedCredits: 3 }),
      expect.any(Object)
    );
    expect(JSON.stringify(mockTrackServerEvent.mock.calls)).not.toContain('203.0.113.42');
    expect(JSON.stringify(mockTrackServerEvent.mock.calls)).not.toContain('fingerprint');
  });

  it('emits account_created once without request identity data when an auth page replays', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const identity = { country: 'US', ip: '203.0.113.42', userAgent: 'private-test-agent' };

    const initial = await POST(makeRequest({ userId, ...identity }));
    mockProfile(makeProfile({ region_tier: 'standard', signup_country: 'US' }));
    mockClaimFreeCreditGrant.mockResolvedValueOnce({
      grantedCredits: 5,
      existingGrant: true,
      matchedAccountCount: 0,
      newTotalBalance: 5,
    });
    const replay = await POST(makeRequest({ userId, ...identity }));

    const accountCreatedEvents = mockTrackServerEvent.mock.calls.filter(
      ([eventName]) => eventName === 'account_created'
    );

    expect(initial.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(accountCreatedEvents).toEqual([
      [
        'account_created',
        {
          method: 'email',
          pricingRegion: 'standard',
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          attributionAvailable: false,
        },
        expect.objectContaining({ userId }),
      ],
    ]);

    const serialized = JSON.stringify({
      responses: [await initial.json(), await replay.json()],
      events: accountCreatedEvents,
    });
    expect(serialized).not.toContain(identity.ip);
    expect(serialized).not.toContain(identity.userAgent);
    expect(serialized).not.toContain('identity_hash');
  });

  it('normalizes first-touch attribution and drops landing URLs from account_created', async () => {
    await POST(
      makeRequest({
        userId: 'user-attributed',
        country: 'US',
        attribution: {
          utmSource: 'Google Ads',
          utmMedium: 'CPC',
          utmCampaign: 'Spring 2026',
          attributionAvailable: true,
          landingPage: 'https://example.com/private?email=user@example.com',
        },
      })
    );

    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'account_created',
      {
        method: 'email',
        pricingRegion: 'standard',
        utmSource: 'google_ads',
        utmMedium: 'cpc',
        utmCampaign: 'spring_2026',
        attributionAvailable: true,
      },
      expect.objectContaining({ userId: 'user-attributed' })
    );
    expect(JSON.stringify(mockTrackServerEvent.mock.calls)).not.toContain('example.com');
    expect(JSON.stringify(mockTrackServerEvent.mock.calls)).not.toContain('user@example.com');
  });

  it('records direct traffic as available attribution with null UTM values', async () => {
    await POST(
      makeRequest({
        userId: 'user-direct',
        country: 'US',
        attribution: { attributionAvailable: true },
      })
    );

    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'account_created',
      expect.objectContaining({
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        attributionAvailable: true,
      }),
      expect.objectContaining({ userId: 'user-direct' })
    );
  });
});
