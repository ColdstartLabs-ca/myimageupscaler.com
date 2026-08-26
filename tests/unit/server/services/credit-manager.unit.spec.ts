import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  queueLowCreditAlert: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: vi.fn(),
  },
}));
vi.mock('@server/services/email-lifecycle.service', () => ({
  getEmailLifecycleService: () => ({ queueLowCreditAlert: mocks.queueLowCreditAlert }),
}));

import { CreditManager } from '@server/services/replicate/utils/credit-manager';

describe('CreditManager durable reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueLowCreditAlert.mockResolvedValue(undefined);
  });

  it('atomically debits against the caller-owned job reservation', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          new_total_balance: 4,
          consumed_subscription: 1,
          consumed_purchased: 0,
        },
      ],
      error: null,
    });
    const manager = new CreditManager();

    const result = await manager.deductCredits(
      'user-1',
      1,
      'Replicate',
      '11111111-1111-4111-8111-111111111111'
    );

    expect(mocks.rpc).toHaveBeenCalledWith('consume_credits_v3', {
      p_user_id: 'user-1',
      p_amount: 1,
      p_job_id: '11111111-1111-4111-8111-111111111111',
      p_description: 'Image processing via Replicate (1 credits)',
    });
    expect(result.jobId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('records provider output without completing billing before browser receipt', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const manager = new CreditManager();

    await expect(
      manager.recordDeliverableOutput('user-1', '11111111-1111-4111-8111-111111111111', {
        imageUrl: 'https://output.test/image.png',
        mimeType: 'image/png',
        expiresAt: 1795737600000,
        deliveryTokenHash: 'hash-123',
      })
    ).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledWith('record_processing_credit_reservation_output', {
      p_user_id: 'user-1',
      p_job_id: '11111111-1111-4111-8111-111111111111',
      p_output_url: 'https://output.test/image.png',
      p_output_mime_type: 'image/png',
      p_output_expires_at: '2026-11-27T00:00:00.000Z',
      p_delivery_token_hash: 'hash-123',
    });
  });

  it('retrieves staged output using only the hashed capability', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          output_url: 'https://replicate.delivery/output.png',
          output_mime_type: 'image/png',
          output_expires_at: '2026-08-27T00:00:00.000Z',
        },
      ],
      error: null,
    });
    const manager = new CreditManager();

    await expect(
      manager.retrieveDeliverableOutput(
        'user-1',
        '11111111-1111-4111-8111-111111111111',
        'secret-token'
      )
    ).resolves.toEqual({
      imageUrl: 'https://replicate.delivery/output.png',
      mimeType: 'image/png',
      expiresAt: '2026-08-27T00:00:00.000Z',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('retrieve_processing_credit_reservation_output', {
      p_user_id: 'user-1',
      p_job_id: '11111111-1111-4111-8111-111111111111',
      p_delivery_token_hash: '930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94',
    });
  });

  it('acknowledges browser receipt using exact server-recorded output metadata', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const manager = new CreditManager();

    await expect(
      manager.acknowledgeReceipt('user-1', '11111111-1111-4111-8111-111111111111', {
        imageUrl: 'https://output.test/image.png',
        mimeType: 'image/png',
        expiresAt: '2026-08-27T00:00:00.000Z',
        deliveryToken: 'secret-token',
      })
    ).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledWith('acknowledge_processing_credit_reservation', {
      p_user_id: 'user-1',
      p_job_id: '11111111-1111-4111-8111-111111111111',
      p_output_url: 'https://output.test/image.png',
      p_output_mime_type: 'image/png',
      p_output_expires_at: '2026-08-27T00:00:00.000Z',
      p_delivery_token_hash: '930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94',
    });
  });

  it('reconciles stale unacknowledged reservations using a caller supplied threshold', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ refunded_count: 2, quarantined_count: 1 }],
      error: null,
    });
    const manager = new CreditManager();

    await expect(manager.reconcileStaleReservations(600, 100)).resolves.toEqual({
      refundedCount: 2,
      quarantinedCount: 1,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('reconcile_stale_credit_reservations', {
      p_stale_before: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      p_limit: 100,
    });
  });

  it('refunds from server-owned reservation state rather than caller pool hints', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const manager = new CreditManager();

    await expect(
      manager.refundReservation('user-1', {
        amount: 99,
        jobId: '11111111-1111-4111-8111-111111111111',
        subscriptionAmount: 99,
        purchasedAmount: 0,
      })
    ).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledWith('refund_processing_credit_reservation', {
      p_user_id: 'user-1',
      p_job_id: '11111111-1111-4111-8111-111111111111',
      p_failure_reason: 'Credit refund for failed processing',
    });
  });

  it('reports when a reservation refund did not transition any processing row', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const manager = new CreditManager();

    await expect(
      manager.refundReservation('user-1', {
        amount: 1,
        jobId: '11111111-1111-4111-8111-111111111111',
        subscriptionAmount: 1,
        purchasedAmount: 0,
      })
    ).resolves.toBe(false);
  });

  it('preserves legacy pool-aware refunds for non-reservation processors', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const manager = new CreditManager();

    await expect(
      manager.refundCredits('user-1', {
        amount: 3,
        jobId: 'gen_123_abc',
        subscriptionAmount: 2,
        purchasedAmount: 1,
      })
    ).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledWith('refund_consumed_credits', {
      p_user_id: 'user-1',
      p_amount: 3,
      p_job_id: 'gen_123_abc',
      p_subscription_amount: 2,
      p_purchased_amount: 1,
      p_description: 'Credit refund for failed processing',
    });
  });
});
