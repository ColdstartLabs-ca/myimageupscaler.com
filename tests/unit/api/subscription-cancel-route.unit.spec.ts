import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { single, updateEq, updatePayloads } = vi.hoisted(() => ({
  single: vi.fn(),
  updateEq: vi.fn(),
  updatePayloads: [] as Record<string, unknown>[],
}));

vi.mock('@server/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn(), update: vi.fn() },
    subscriptionSchedules: { release: vi.fn() },
  },
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ in: () => ({ order: () => ({ limit: () => ({ single }) }) }) }),
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        const query = {
          eq: updateEq,
          select: vi.fn(() => query),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { updated_at: '2026-07-11T20:00:00.000Z' },
            error: null,
          }),
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve),
        };
        updateEq.mockImplementation(() => query);
        return query;
      }),
    })),
  },
}));

import { POST } from '@/app/api/subscriptions/cancel/route';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

describe('subscription cancellation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePayloads.length = 0;
    vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    } as never);
    single.mockResolvedValue({ data: { id: 'sub-1', status: 'active' }, error: null });
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: 'sub-1',
      schedule: 'sub_sched_retention',
    } as never);
    vi.mocked(stripe.subscriptionSchedules.release).mockResolvedValue({} as never);
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({
      id: 'sub-1',
      cancel_at_period_end: true,
      current_period_end: 1780000000,
    } as never);
  });

  test('releases an attached retention schedule before cancellation', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/subscriptions/cancel', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Too expensive' }),
      })
    );
    expect(response.status).toBe(200);
    expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sub_sched_retention');
    expect(updateEq.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(stripe.subscriptionSchedules.release).mock.invocationCallOrder[0]
    );
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub-1', {
      cancel_at_period_end: true,
    });
    expect(
      vi.mocked(stripe.subscriptionSchedules.release).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(stripe.subscriptions.update).mock.invocationCallOrder[0]);
  });

  test('does not schedule cancellation when releasing the pending change fails', async () => {
    vi.mocked(stripe.subscriptionSchedules.release).mockRejectedValue(new Error('release failed'));
    const response = await POST(
      new NextRequest('http://localhost/api/subscriptions/cancel', {
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({}),
      })
    );
    expect(response.status).toBe(500);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  test('rolls back the database cancellation claim when Stripe cancellation fails', async () => {
    single.mockResolvedValue({
      data: {
        id: 'sub-1',
        status: 'active',
        cancel_at_period_end: false,
        scheduled_price_id: 'price_hobby',
        scheduled_change_date: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    });
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: 'sub-1',
      schedule: null,
    } as never);
    vi.mocked(stripe.subscriptions.update).mockRejectedValue(new Error('Stripe unavailable'));

    const response = await POST(
      new NextRequest('http://localhost/api/subscriptions/cancel', {
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(500);
    expect(updatePayloads).toEqual([
      expect.objectContaining({ cancel_at_period_end: true }),
      expect.objectContaining({
        cancel_at_period_end: false,
        scheduled_price_id: 'price_hobby',
        scheduled_change_date: '2026-08-01T00:00:00.000Z',
      }),
    ]);
  });
});
