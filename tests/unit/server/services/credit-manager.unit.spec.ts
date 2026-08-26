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

  it('persists provider output before reporting success', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const manager = new CreditManager();

    await expect(
      manager.completeReservation('user-1', '11111111-1111-4111-8111-111111111111', {
        imageUrl: 'https://output.test/image.png',
        mimeType: 'image/png',
        expiresAt: '2026-08-27T00:00:00.000Z',
      })
    ).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledWith('complete_processing_credit_reservation', {
      p_user_id: 'user-1',
      p_job_id: '11111111-1111-4111-8111-111111111111',
      p_output_url: 'https://output.test/image.png',
      p_output_mime_type: 'image/png',
      p_output_expires_at: '2026-08-27T00:00:00.000Z',
    });
  });

  it('refunds from server-owned reservation state rather than caller pool hints', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const manager = new CreditManager();

    await expect(
      manager.refundCredits('user-1', {
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
});
