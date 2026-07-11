import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getPlanByKey } from '@shared/config/subscription.utils';

const single = vi.fn();
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

import { POST } from '@/app/api/subscriptions/retention-offer/route';

describe('subscription retention offer route', () => {
  beforeEach(() =>
    single.mockResolvedValue({ data: { price_id: getPlanByKey('pro')?.stripePriceId } })
  );

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
});
