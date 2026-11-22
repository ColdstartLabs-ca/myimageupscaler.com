import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockClaimFreeCreditGrant, mockTrackServerEvent, mockWaitUntil, mockGetUserById } =
  vi.hoisted(() => ({
    mockClaimFreeCreditGrant: vi.fn(),
    mockTrackServerEvent: vi.fn(),
    mockWaitUntil: vi.fn(),
    mockGetUserById: vi.fn(),
  }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ ctx: { waitUntil: mockWaitUntil } }),
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
    auth: { admin: { getUserById: mockGetUserById } },
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
    provider?: string | null;
  } = {}
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.provider !== null) {
    const claims = { app_metadata: { provider: options.provider ?? 'email' } };
    headers.Authorization = `Bearer h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`;
  }
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

function mockAuthUserCreatedAt(createdAt: string | null): void {
  mockGetUserById.mockResolvedValue({
    data: { user: createdAt === null ? null : { created_at: createdAt } },
    error: null,
  });
}

/** Same outcome as the real RPC: a unique user row gives exactly one winner. */
function mockSingleWinnerGrant(): void {
  let claimed = false;
  mockClaimFreeCreditGrant.mockImplementation(async () => {
    const existingGrant = claimed;
    claimed = true;
    return { grantedCredits: 5, existingGrant, matchedAccountCount: 0, newTotalBalance: 5 };
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
    mockAuthUserCreatedAt(new Date(Date.now() - 5_000).toISOString());
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

  it('registers account_created as background work so the Workers runtime cannot cancel it', async () => {
    let resolveTracked: (value: boolean) => void = () => {};
    const tracked = new Promise<boolean>(resolve => {
      resolveTracked = resolve;
    });
    mockTrackServerEvent.mockImplementationOnce(() => tracked);

    const res = await POST(makeRequest({ userId: 'user-waituntil', country: 'US' }));

    expect(res.status).toBe(200);
    expect(mockWaitUntil).toHaveBeenCalledTimes(1);
    const background = mockWaitUntil.mock.calls[0][0] as Promise<void>;
    let settled = false;
    void background.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveTracked(true);
    await background;
    expect(settled).toBe(true);
  });

  it('registers no background tracking work for a repeat setup', async () => {
    mockProfile(makeProfile({ region_tier: 'standard', signup_country: 'US' }));

    const res = await POST(makeRequest({ userId: 'user-repeat', country: 'US' }));

    expect(res.status).toBe(200);
    expect(mockWaitUntil).not.toHaveBeenCalled();
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

  describe('new-account signal for the browser sign_up conversion', () => {
    const userId = '00000000-0000-4000-8000-000000000009';
    const LEGACY_CREATED_AT = '2026-02-20T10:00:00.000Z';
    const accountCreatedMethod = (): unknown =>
      mockTrackServerEvent.mock.calls.find(([name]) => name === 'account_created')?.[1]?.method;
    const setup = async (
      provider: string | null = 'google'
    ): Promise<{ status: number; body: Record<string, unknown> }> => {
      const res = await POST(makeRequest({ userId, country: 'US', provider }));
      return { status: res.status, body: await res.json() };
    };

    describe('genuinely new account', () => {
      it('reports it with the real auth provider', async () => {
        const { body } = await setup('google');

        expect(body.accountCreated).toBe(true);
        expect(body.signupMethod).toBe('google');
        expect(body.signupUserId).toBe(userId);
        expect(accountCreatedMethod()).toBe('google');
      });

      it('keeps email signups labeled email', async () => {
        const { body } = await setup('email');

        expect(body.signupMethod).toBe('email');
        expect(accountCreatedMethod()).toBe('email');
      });

      it('labels an unreadable token unknown instead of guessing email', async () => {
        const { body } = await setup(null);

        expect(body.signupMethod).toBe('unknown');
        expect(accountCreatedMethod()).toBe('unknown');
      });

      it('reads creation from the auth user of this request', async () => {
        await setup();

        expect(mockGetUserById).toHaveBeenCalledWith(userId);
      });
    });

    describe('returning accounts', () => {
      it('does not report a legacy free user with no region and no grant', async () => {
        mockAuthUserCreatedAt(LEGACY_CREATED_AT);

        const { status, body } = await setup();

        expect(status).toBe(200);
        expect(mockClaimFreeCreditGrant).toHaveBeenCalled();
        expect(body.accountCreated).toBeUndefined();
        expect(body.signupMethod).toBeUndefined();
        expect(body.signupUserId).toBeUndefined();
      });

      it('does not report a legacy paid user, who has no grant path', async () => {
        mockAuthUserCreatedAt(LEGACY_CREATED_AT);
        mockProfile(makeProfile({ subscription_tier: 'pro', subscription_status: 'active' }));

        const { status, body } = await setup();

        expect(status).toBe(200);
        expect(mockClaimFreeCreditGrant).not.toHaveBeenCalled();
        expect(body.accountCreated).toBeUndefined();
      });

      it('does not report a new paid user without a single-winner grant', async () => {
        mockProfile(makeProfile({ subscription_tier: 'pro', subscription_status: 'active' }));

        const { body } = await setup();

        expect(body.accountCreated).toBeUndefined();
      });

      it('does not report a classified login', async () => {
        mockAuthUserCreatedAt(LEGACY_CREATED_AT);
        mockProfile(makeProfile({ region_tier: 'standard', signup_country: 'US' }));
        mockClaimFreeCreditGrant.mockResolvedValue({
          grantedCredits: 5,
          existingGrant: true,
          matchedAccountCount: 0,
          newTotalBalance: 5,
        });

        const { body } = await setup();

        expect(body.accountCreated).toBeUndefined();
        expect(mockGetUserById).not.toHaveBeenCalled();
      });

      it('does not report an account past the first-session window', async () => {
        mockAuthUserCreatedAt(new Date(Date.now() - 301_000).toISOString());

        const { body } = await setup();

        expect(body.accountCreated).toBeUndefined();
      });
    });

    describe('unknown creation evidence fails closed and never blocks setup', () => {
      it.each([
        ['a missing user', { data: { user: null }, error: null }],
        ['a lookup error', { data: { user: null }, error: { message: 'boom' } }],
        ['no creation time', { data: { user: {} }, error: null }],
        ['an invalid creation time', { data: { user: { created_at: 'never' } }, error: null }],
        [
          'a creation time in the future',
          { data: { user: { created_at: '2099-01-01T00:00:00.000Z' } }, error: null },
        ],
      ])('%s', async (_label, result) => {
        mockGetUserById.mockResolvedValue(result);

        const { status, body } = await setup();

        expect(status).toBe(200);
        expect(body.setupStatus).toBe('complete');
        expect(body.accountCreated).toBeUndefined();
      });

      it('a lookup that hangs does not stall setup', async () => {
        mockGetUserById.mockReturnValue(new Promise(() => {}));
        const startedAt = Date.now();

        const { status, body } = await setup();

        expect(Date.now() - startedAt).toBeLessThan(2_500);
        expect(status).toBe(200);
        expect(body.setupStatus).toBe('complete');
        expect(body.accountCreated).toBeUndefined();
      }, 4_000);

      it('a lookup that throws before returning a promise', async () => {
        mockGetUserById.mockImplementation(() => {
          throw new Error('client error');
        });

        const { status, body } = await setup();

        expect(status).toBe(200);
        expect(body.setupStatus).toBe('complete');
        expect(body.accountCreated).toBeUndefined();
      });

      it('a lookup that throws', async () => {
        mockGetUserById.mockRejectedValue(new Error('network'));

        const { status, body } = await setup();

        expect(status).toBe(200);
        expect(body.setupStatus).toBe('complete');
        expect(body.accountCreated).toBeUndefined();
      });
    });

    describe('grant outcomes', () => {
      it('does not report a failed grant, then reports the retry that wins it', async () => {
        mockClaimFreeCreditGrant.mockRejectedValueOnce(new Error('rpc down'));

        const failed = await setup();
        expect(failed.body.creditGrantDeferred).toBe(true);
        expect(failed.body.accountCreated).toBeUndefined();

        mockProfile(makeProfile({ region_tier: 'standard', signup_country: 'US' }));
        mockSingleWinnerGrant();

        expect((await setup()).body.accountCreated).toBe(true);
        expect((await setup()).body.accountCreated).toBeUndefined();
      });

      it('does not report a legacy retry after a failed grant', async () => {
        mockAuthUserCreatedAt(LEGACY_CREATED_AT);
        mockClaimFreeCreditGrant.mockRejectedValueOnce(new Error('rpc down'));
        await setup();
        mockSingleWinnerGrant();

        expect((await setup()).body.accountCreated).toBeUndefined();
      });

      it('does not report a pending setup', async () => {
        const res = await POST(makeRequest({ userId, provider: 'google' }));
        const body = await res.json();

        expect(res.status).toBe(202);
        expect(body.setupStatus).toBe('pending');
        expect(body.accountCreated).toBeUndefined();
      });

      it('does not report a missing profile', async () => {
        mockProfile(null as unknown as Record<string, unknown>);

        const { body } = await setup();

        expect(body.creditGrantDeferred).toBe(true);
        expect(body.accountCreated).toBeUndefined();
      });
    });

    describe('single winner', () => {
      it('reports one of two repeated setups', async () => {
        mockSingleWinnerGrant();

        const results = [await setup(), await setup()];

        expect(results.filter(r => r.body.accountCreated === true)).toHaveLength(1);
      });

      it('reports one of five overlapping callbacks', async () => {
        mockSingleWinnerGrant();

        const results = await Promise.all([setup(), setup(), setup(), setup(), setup()]);

        expect(results.map(r => r.status)).toEqual([200, 200, 200, 200, 200]);
        expect(results.filter(r => r.body.accountCreated === true)).toHaveLength(1);
      });
    });
  });
});
