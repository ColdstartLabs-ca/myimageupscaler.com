import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, fromMock, retrieve, cancel, track, settingsUpdate, attemptUpdate } = vi.hoisted(
  () => ({
    getUser: vi.fn(),
    fromMock: vi.fn(),
    retrieve: vi.fn(),
    cancel: vi.fn(),
    track: vi.fn(),
    settingsUpdate: vi.fn(),
    attemptUpdate: vi.fn(),
  })
);

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { auth: { getUser }, from: fromMock },
}));
vi.mock('@server/stripe', () => ({
  stripe: { paymentIntents: { retrieve, cancel } },
}));
vi.mock('@server/services/revenue-feature-rollout.service', () => ({
  isRevenueFeatureEligible: vi.fn(),
}));
vi.mock('@server/analytics', () => ({ trackServerEvent: track }));
vi.mock('@shared/config/env', () => ({ serverEnv: { AMPLITUDE_API_KEY: 'test-key' } }));

import { PUT } from '@app/api/auto-top-up/settings/route';

function chain(result: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['eq', 'in', 'order', 'limit', 'select']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query;
}

function request() {
  return new NextRequest('http://localhost/api/auto-top-up/settings', {
    method: 'PUT',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  });
}

describe('PUT /api/auto-top-up/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    retrieve.mockResolvedValue({ id: 'pi-1', status: 'requires_confirmation' });
    cancel.mockResolvedValue({ id: 'pi-1', status: 'canceled' });
    track.mockResolvedValue(true);
    settingsUpdate.mockImplementation(() => {
      const query = chain({ data: { enabled: false, pending_enabled: false }, error: null });
      query.eq = vi.fn(() => query);
      return query;
    });
    attemptUpdate.mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === 'auto_top_up_attempts') {
        return {
          select: vi.fn(() =>
            chain({ data: { id: 'attempt-1', stripe_payment_intent_id: 'pi-1' }, error: null })
          ),
          update: attemptUpdate.mockImplementation(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === 'auto_top_up_settings') {
        return { update: settingsUpdate };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  test('treats an already canceled PaymentIntent as proof and then releases the lease', async () => {
    retrieve.mockResolvedValue({ id: 'pi-1', status: 'canceled' });

    const response = await PUT(request());

    expect(response.status).toBe(200);
    expect(cancel).not.toHaveBeenCalled();
    expect(settingsUpdate).toHaveBeenCalled();
    expect(attemptUpdate).toHaveBeenCalled();
  });

  test('keeps the lease when Stripe cancellation cannot be proven', async () => {
    cancel.mockRejectedValue(new Error('Stripe unavailable'));

    const response = await PUT(request());

    expect(response.status).toBe(503);
    expect(settingsUpdate).not.toHaveBeenCalled();
    expect(attemptUpdate).not.toHaveBeenCalled();
  });
});
