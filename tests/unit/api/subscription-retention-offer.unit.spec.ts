import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getPlanByKey } from '@shared/config/subscription.utils';

const { single, changeSubscription } = vi.hoisted(() => ({
  single: vi.fn(),
  changeSubscription: vi.fn(),
}));
vi.mock('@/app/api/subscription/change/route', () => ({ POST: changeSubscription }));
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ in: () => ({ order: () => ({ limit: () => ({ single }) }) }) }),
      }),
    })),
  },
}));

import { POST, PUT } from '@/app/api/subscriptions/retention-offer/route';

describe('subscription retention offer route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    single.mockResolvedValue({
      data: { id: 'sub-1', price_id: getPlanByKey('pro')?.stripePriceId },
    });
    changeSubscription.mockResolvedValue(
      Response.json({ success: true, data: { status: 'scheduled' } })
    );
  });

  test('requires authentication', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', { method: 'POST' })
    );
    expect(response.status).toBe(401);
  });

  test('uses authoritative subscription and returns only the approved lower plan', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.offer).toMatchObject({ targetPlanKey: 'hobby' });
  });

  test('returns no offer for product-quality reasons', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'technical_issues' }),
      })
    );
    expect((await response.json()).data.offer).toBeNull();
  });

  test('executes only the server-resolved downgrade and rejects arbitrary offer fields', async () => {
    const response = await PUT(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: 'too_expensive',
          targetPriceId: 'price_attacker_selected',
          coupon: 'arbitrary_coupon',
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(changeSubscription).not.toHaveBeenCalled();
  });

  test('schedules the authoritative lower plan through the existing change path', async () => {
    const response = await PUT(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect(response.status).toBe(200);
    const delegatedRequest = changeSubscription.mock.calls[0][0] as NextRequest;
    expect(await delegatedRequest.json()).toEqual({
      targetPriceId: getPlanByKey('hobby')?.stripePriceId,
    });
  });

  test('returns the existing scheduled downgrade on retry without another Stripe change', async () => {
    single.mockResolvedValue({
      data: {
        id: 'sub-1',
        price_id: getPlanByKey('pro')?.stripePriceId,
        scheduled_price_id: getPlanByKey('hobby')?.stripePriceId,
        scheduled_change_date: '2026-08-01T00:00:00.000Z',
      },
    });
    const response = await PUT(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect((await response.json()).data.idempotent_replay).toBe(true);
    expect(changeSubscription).not.toHaveBeenCalled();
  });

  test('passes through Stripe failure without mutating retention state', async () => {
    changeSubscription.mockResolvedValue(
      Response.json({ success: false, error: { code: 'STRIPE_ERROR' } }, { status: 500 })
    );
    const response = await PUT(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect(response.status).toBe(500);
    expect(single).toHaveBeenCalledTimes(1);
  });
});
