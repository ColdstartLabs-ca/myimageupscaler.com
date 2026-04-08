import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '@app/api/checkout/offer/route';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { STRIPE_PRICES } from '@shared/config/stripe';

// Mock dependencies
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(),
            })),
          })),
        })),
      })),
    })),
  },
}));

describe('POST /api/checkout/offer', () => {
  const mockUserId = 'user_test_123';
  const mockAuthHeader = `Bearer mock_token_${mockUserId}`;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mockRequest(authHeader: string | null, body: { priceId: string }) {
    const headers = new Headers();
    if (authHeader) {
      headers.set('authorization', authHeader);
    }

    return new Request('https://example.com/api/checkout/offer', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  describe('authentication', () => {
    test('returns 401 when no auth header is provided', async () => {
      const request = await mockRequest(null, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });

      const response = await POST(request as unknown as Request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ success: false, error: 'Unauthorized' });
    });

    test('returns 401 when auth header is malformed', async () => {
      const request = await mockRequest('InvalidHeader', { priceId: STRIPE_PRICES.HOBBY_MONTHLY });

      const response = await POST(request as unknown as Request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ success: false, error: 'Unauthorized' });
    });

    test('returns 401 when user lookup fails', async () => {
      vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });

      const response = await POST(request as unknown as Request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ success: false, error: 'Unauthorized' });
    });
  });

  describe('request validation', () => {
    beforeEach(() => {
      vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });
    });

    test('returns 400 when priceId is missing', async () => {
      const request = await mockRequest(mockAuthHeader, { priceId: '' as string });

      const response = await POST(request as unknown as Request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('not eligible');
    });

    test('returns 400 for ineligible price IDs', async () => {
      const ineligiblePrices = [
        STRIPE_PRICES.HOBBY_YEARLY,
        STRIPE_PRICES.PRO_MONTHLY,
        STRIPE_PRICES.PRO_YEARLY,
        'price_unknown',
      ];

      for (const priceId of ineligiblePrices) {
        const request = await mockRequest(mockAuthHeader, { priceId });
        const response = await POST(request as unknown as Request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.error).toContain('not eligible');
      }
    });

    test('returns 400 when request body is missing priceId', async () => {
      const headers = new Headers();
      headers.set('authorization', mockAuthHeader);

      const request = new Request('https://example.com/api/checkout/offer', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('existing subscription check', () => {
    beforeEach(() => {
      vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });
    });

    test('returns 409 when user has active subscription', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'sub_existing' },
        error: null,
      });

      // Build the mock chain
      const mockFrom = vi.mocked(supabaseAdmin.from);
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: mockMaybeSingle,
              }),
            }),
          }),
        }),
      } as never);

      const request = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });

      const response = await POST(request as unknown as Request);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data).toEqual({
        success: false,
        error: 'Existing subscriptions are not eligible for this offer',
      });
    });

    test('returns 409 when user has trialing subscription', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'sub_trialing' },
        error: null,
      });

      const mockFrom = vi.mocked(supabaseAdmin.from);
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: mockMaybeSingle,
              }),
            }),
          }),
        }),
      } as never);

      const request = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });

      const response = await POST(request as unknown as Request);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('successful offer issuance', () => {
    beforeEach(() => {
      vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });

      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      const mockFrom = vi.mocked(supabaseAdmin.from);
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: mockMaybeSingle,
              }),
            }),
          }),
        }),
      } as never);
    });

    test('returns 200 with rescue offer for eligible user', async () => {
      const request = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });

      const response = await POST(request as unknown as Request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        discountPercent: 20,
        priceId: STRIPE_PRICES.HOBBY_MONTHLY,
      });
      expect(data.data.offerToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(data.data.expiresAt).toBeDefined();
    });

    test('includes correct expiration time in offer', async () => {
      vi.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));

      const request = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });

      const response = await POST(request as unknown as Request);
      const data = await response.json();

      const expiresAt = new Date(data.data.expiresAt);
      const expectedExpiry = new Date('2026-04-07T12:10:00.000Z');

      expect(expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    test('generates unique tokens for each request', async () => {
      const request1 = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });
      const response1 = await POST(request1 as unknown as Request);
      const data1 = await response1.json();

      // Advance time to ensure different timestamps
      vi.advanceTimersByTime(1);

      const request2 = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });
      const response2 = await POST(request2 as unknown as Request);
      const data2 = await response2.json();

      expect(data1.data.offerToken).not.toBe(data2.data.offerToken);
    });
  });

  describe('error handling', () => {
    test('returns 500 on unexpected errors', async () => {
      vi.mocked(supabaseAdmin.auth.getUser).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const request = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });

      const response = await POST(request as unknown as Request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Failed to create rescue offer');
    });

    test('handles invalid JSON in request body', async () => {
      const headers = new Headers();
      headers.set('authorization', mockAuthHeader);

      const request = new Request('https://example.com/api/checkout/offer', {
        method: 'POST',
        headers,
        body: 'invalid-json',
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });

  describe('subscription query behavior', () => {
    beforeEach(() => {
      vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } },
        error: null,
      });
    });

    test('queries subscriptions table with correct filters', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      const mockIn = vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      });

      const mockEq = vi.fn().mockReturnValue({ in: mockIn });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      const mockFrom = vi.mocked(supabaseAdmin.from);
      mockFrom.mockReturnValue({
        select: mockSelect,
      } as never);

      const request = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });
      await POST(request as unknown as Request);

      expect(mockFrom).toHaveBeenCalledWith('subscriptions');
      expect(mockSelect).toHaveBeenCalledWith('id');
      expect(mockEq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockIn).toHaveBeenCalledWith('status', ['active', 'trialing']);
      expect(mockMaybeSingle).toHaveBeenCalled();
    });

    test('limits subscription query to 1 result', async () => {
      const mockLimit = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      const mockIn = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq = vi.fn().mockReturnValue({ in: mockIn });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      const mockFrom = vi.mocked(supabaseAdmin.from);
      mockFrom.mockReturnValue({
        select: mockSelect,
      } as never);

      const request = await mockRequest(mockAuthHeader, { priceId: STRIPE_PRICES.HOBBY_MONTHLY });
      await POST(request as unknown as Request);

      expect(mockLimit).toHaveBeenCalledWith(1);
    });
  });
});
