import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, trackServerEvent } = vi.hoisted(() => ({
  from: vi.fn(),
  trackServerEvent: vi.fn(),
}));

vi.mock('@server/analytics', () => ({ trackServerEvent }));
vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: { from } }));
vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'production', AMPLITUDE_API_KEY: 'test-amplitude-key' },
}));

import { recordPaymentFailure, trackPaymentRecovered } from '@server/analytics/paymentRecovery';

function chain<T>(result: T) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['eq', 'in', 'is', 'order', 'limit']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.upsert = vi.fn().mockResolvedValue(result);
  query.update = vi.fn(() => query);
  return query;
}

describe('payment recovery correlation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackServerEvent.mockResolvedValue(true);
  });

  it('persists a bounded failure record with stable source identity', async () => {
    const failureTable = chain({ error: null });
    from.mockReturnValue(failureTable);

    await recordPaymentFailure({
      failureObjectId: 'pi_failed_1',
      userId: 'user_1',
      purchaseType: 'credit_pack',
      amountCents: 499.9,
      currency: ' USD ',
      failureType: 'Card Declined',
      recoveryChannel: 'email retry',
    });

    expect(failureTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        failure_object_id: 'pi_failed_1',
        amount_cents: 499,
        currency: 'usd',
        failure_type: 'card_declined',
        recovery_channel: 'email_retry',
      }),
      { onConflict: 'failure_object_id', ignoreDuplicates: true }
    );
  });

  it('emits payment_recovered with the original failure and marks it once', async () => {
    const lookup = chain({
      data: {
        failure_object_id: 'in_failed_1',
        purchase_type: 'subscription',
        failure_type: 'card_declined',
        recovery_channel: 'invoice_retry',
      },
      error: null,
    });
    const update = chain({ error: null });
    const updateCall = vi.fn(() => update);
    from.mockReturnValue({ select: vi.fn(() => lookup), update: updateCall });

    await expect(
      trackPaymentRecovered({
        userId: 'user_1',
        candidateFailureObjectIds: ['in_failed_1', 'pi_failed_1', 'in_failed_1'],
        sourceObjectId: 'in_recovered_1',
        purchaseType: 'subscription',
        amountCents: 1900,
        currency: 'USD',
        recoveryChannel: 'invoice_retry',
      })
    ).resolves.toBe(true);

    expect(trackServerEvent).toHaveBeenCalledWith(
      'payment_recovered',
      expect.objectContaining({
        sourceObjectId: 'in_recovered_1',
        originalFailureObjectId: 'in_failed_1',
        currency: 'usd',
      }),
      expect.objectContaining({
        sourceObjectId: 'in_failed_1',
        lifecycleAction: 'payment_recovered',
        deduplicate: true,
      })
    );
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({ recovery_source_object_id: 'in_recovered_1' })
    );
  });

  it('does not emit recovery without an open failure record', async () => {
    const lookup = chain({ data: null, error: null });
    from.mockReturnValue({ select: vi.fn(() => lookup) });

    await expect(
      trackPaymentRecovered({
        userId: 'user_1',
        candidateFailureObjectIds: ['pi_unknown'],
        sourceObjectId: 'pi_success',
        purchaseType: 'credit_pack',
        amountCents: 499,
        currency: 'usd',
        recoveryChannel: 'retry',
      })
    ).resolves.toBe(false);
    expect(trackServerEvent).not.toHaveBeenCalled();
  });
});
