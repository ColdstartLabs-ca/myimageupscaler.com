import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getPlanByKey } from '@shared/config/subscription.utils';

const {
  single,
  changeSubscription,
  claimResult,
  cleanupResult,
  eventUpsert,
  getUser,
  rolloutResult,
} = vi.hoisted(() => ({
  single: vi.fn(),
  changeSubscription: vi.fn(),
  claimResult: vi.fn(),
  cleanupResult: vi.fn(),
  eventUpsert: vi.fn(),
  getUser: vi.fn(),
  rolloutResult: vi.fn(),
}));
vi.mock('@/app/api/subscription/change/route', () => ({ POST: changeSubscription }));
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: { getUser },
    from: vi.fn((table: string) => {
      if (table === 'subscription_retention_events') {
        return { upsert: eventUpsert };
      }
      if (table === 'subscription_retention_rollout') {
        return { select: () => ({ eq: () => ({ maybeSingle: rolloutResult }) }) };
      }
      const updateQuery: Record<string, ReturnType<typeof vi.fn>> = {};
      updateQuery.eq = vi.fn(() => updateQuery);
      updateQuery.is = vi.fn(() => updateQuery);
      updateQuery.select = vi.fn(() => updateQuery);
      updateQuery.maybeSingle = vi.fn();
      return {
        select: () => ({
          eq: () => ({ in: () => ({ order: () => ({ limit: () => ({ single }) }) }) }),
        }),
        update: vi.fn(payload => {
          updateQuery.maybeSingle = payload.retention_claim_id ? claimResult : cleanupResult;
          return updateQuery;
        }),
      };
    }),
  },
}));

import { POST, PUT } from '@/app/api/subscriptions/retention-offer/route';

const measurementMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260711000200_subscription_retention_measurement.sql'),
  'utf8'
);

describe('subscription retention offer route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    single.mockResolvedValue({
      data: { id: 'sub-1', price_id: getPlanByKey('pro')?.stripePriceId },
    });
    changeSubscription.mockResolvedValue(
      Response.json({ success: true, data: { status: 'scheduled' } })
    );
    claimResult.mockResolvedValue({ data: { id: 'sub-1' }, error: null });
    cleanupResult.mockResolvedValue({ data: { id: 'sub-1' }, error: null });
    eventUpsert.mockResolvedValue({ error: null });
    rolloutResult.mockResolvedValue({
      data: { enabled: true, treatment_percent: 10 },
      error: null,
    });
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
    expect(eventUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'offer_shown',
        variant: 'treatment',
        current_monthly_cents: 4900,
        target_monthly_cents: 1900,
      }),
      { onConflict: 'event_key', ignoreDuplicates: true }
    );
  });

  test('keeps the deterministic holdout from seeing or accepting an offer', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null });
    const shown = await POST(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect((await shown.json()).data.offer).toBeNull();
    expect(eventUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'holdout_assigned', variant: 'holdout' }),
      expect.anything()
    );

    const accepted = await PUT(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect(accepted.status).toBe(409);
    expect(changeSubscription).not.toHaveBeenCalled();
  });

  test('honors the server-side rollout kill switch', async () => {
    rolloutResult.mockResolvedValue({
      data: { enabled: false, treatment_percent: 10 },
      error: null,
    });
    const response = await POST(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect((await response.json()).data.offer).toBeNull();
    expect(eventUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'holdout_assigned' }),
      expect.anything()
    );
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
    expect(eventUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'offer_accepted', variant: 'treatment' }),
      { onConflict: 'event_key', ignoreDuplicates: true }
    );
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

  test('allows only one concurrent request to claim Stripe execution', async () => {
    claimResult
      .mockResolvedValueOnce({ data: { id: 'sub-1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const makeRequest = () =>
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      });
    const responses = await Promise.all([PUT(makeRequest()), PUT(makeRequest())]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 202]);
    expect(changeSubscription).toHaveBeenCalledTimes(1);
  });

  test('returns processing for a fresh interrupted claim without replaying Stripe', async () => {
    single.mockResolvedValue({
      data: {
        id: 'sub-1',
        price_id: getPlanByKey('pro')?.stripePriceId,
        scheduled_price_id: getPlanByKey('hobby')?.stripePriceId,
        retention_claim_id: '5af78248-58f4-4a9f-bfe6-a847a7015978',
        retention_claimed_at: new Date().toISOString(),
      },
    });
    const response = await PUT(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect(response.status).toBe(202);
    expect(changeSubscription).not.toHaveBeenCalled();
  });

  test('atomically reclaims a stale interrupted claim and retries Stripe', async () => {
    single.mockResolvedValue({
      data: {
        id: 'sub-1',
        price_id: getPlanByKey('pro')?.stripePriceId,
        scheduled_price_id: getPlanByKey('hobby')?.stripePriceId,
        retention_claim_id: '5af78248-58f4-4a9f-bfe6-a847a7015978',
        retention_claimed_at: '2026-01-01T00:00:00.000Z',
      },
    });
    const response = await PUT(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect(response.status).toBe(200);
    expect(changeSubscription).toHaveBeenCalledTimes(1);
  });

  test('rejects retention after cancellation has claimed the subscription', async () => {
    single.mockResolvedValue({
      data: {
        id: 'sub-1',
        price_id: getPlanByKey('pro')?.stripePriceId,
        cancel_at_period_end: true,
      },
    });
    const response = await PUT(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect(response.status).toBe(409);
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

  test('reports rollback failure instead of hiding a stranded claim', async () => {
    changeSubscription.mockResolvedValue(
      Response.json({ success: false, error: { code: 'STRIPE_ERROR' } }, { status: 500 })
    );
    cleanupResult.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    const response = await PUT(
      new NextRequest('http://localhost/api/subscriptions/retention-offer', {
        method: 'PUT',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'too_expensive' }),
      })
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to finalize retention change' });
  });
});

describe('subscription retention durable measurement', () => {
  test('reports treatment versus holdout at 30/60 days with revenue and harm guardrails', () => {
    expect(measurementMigration).toContain('event_key text NOT NULL UNIQUE');
    expect(measurementMigration).toContain(
      'subscription_id text NOT NULL REFERENCES public.subscriptions(id)'
    );
    expect(measurementMigration).toContain('treatment_percent integer NOT NULL DEFAULT 10');
    expect(measurementMigration).toContain('get_subscription_retention_health');
    expect(measurementMigration).toContain("interval '30 days'");
    expect(measurementMigration).toContain("interval '60 days'");
    expect(measurementMigration).toContain('incremental_retained_revenue_cents');
    expect(measurementMigration).toContain("paid.event_type = 'invoice_paid'");
    expect(measurementMigration).toContain("hm.variant = 'holdout'");
    for (const harm of [
      'refund_cents',
      'chargeback_cents',
      'later_cancellation_count',
      'complaint_count',
      'billing_error_count',
    ]) {
      expect(measurementMigration).toContain(harm);
    }
    expect(measurementMigration).toContain('stop_recommended');
    expect(measurementMigration).toContain('SECURITY INVOKER');
    expect(measurementMigration).toContain('TO service_role');
    expect(measurementMigration).toContain('AFTER INSERT ON public.dispute_events');
    expect(measurementMigration).toContain('CREATE TABLE IF NOT EXISTS public.dispute_events');
    expect(measurementMigration).toContain(
      'ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY'
    );
    for (const triggerFunction of [
      'capture_subscription_retention_state',
      'block_stale_retention_email',
      'capture_subscription_retention_chargeback',
    ]) {
      expect(measurementMigration).toContain(`REVOKE ALL ON FUNCTION public.${triggerFunction}()`);
    }
    expect(measurementMigration).toContain('record_subscription_retention_refund');
    expect(measurementMigration).toContain('amount_cents = GREATEST(');
  });

  test('pauses pending retention email whenever cancellation state changes', () => {
    expect(measurementMigration).toContain('AFTER UPDATE OF cancel_at_period_end, status');
    expect(measurementMigration).toContain("status = 'cancelled'");
    expect(measurementMigration).toContain("campaign_key = 'cancelled-period-ending'");
    expect(measurementMigration).toContain("reason = 'subscription_cancellation_state_changed'");
    expect(measurementMigration).toContain("NEW.status = 'canceled'");
    expect(measurementMigration).toContain('BEFORE INSERT OR UPDATE OF status');
    expect(measurementMigration).toContain('ON CONFLICT (event_key) DO NOTHING');
  });
});
