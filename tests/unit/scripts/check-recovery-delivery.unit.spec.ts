import { describe, expect, it } from 'vitest';
import {
  assertControlledDeliveryArgs,
  buildControlledDeliveryQueuePayload,
  buildDeliveryClickUrl,
  parseControlledDeliveryArgs,
} from '@/scripts/check-recovery-delivery';

describe('check-recovery-delivery script helpers', () => {
  it('should require explicit send mode, user id, and recipient email', () => {
    expect(() => assertControlledDeliveryArgs(parseControlledDeliveryArgs([]))).toThrow(
      'Refusing to send email'
    );
    expect(() => assertControlledDeliveryArgs(parseControlledDeliveryArgs(['--send']))).toThrow(
      '--user-id is required'
    );
    expect(() =>
      assertControlledDeliveryArgs(parseControlledDeliveryArgs(['--send', '--user-id', 'user_123']))
    ).toThrow('--email is required');
    expect(() =>
      assertControlledDeliveryArgs(
        parseControlledDeliveryArgs([
          '--send',
          '--user-id',
          'user_123',
          '--email',
          'test@example.com',
        ])
      )
    ).not.toThrow();
  });

  it('should build a signed lifecycle click route without raw recovery tokens', () => {
    const clickUrl = buildDeliveryClickUrl({
      queueId: 'queue_123',
      token: 'signed-token',
    });

    expect(clickUrl).toBe(
      '/api/email/click?q=queue_123&url=%2Fpricing%3Fintent%3Dcheckout_abandoner%26recovery%3Dcheckout-abandoned&token=signed-token'
    );
    expect(clickUrl).not.toContain('recovery_token');
  });

  it('should build a tagged sent queue row for click attribution', () => {
    const payload = buildControlledDeliveryQueuePayload({
      runId: 'run_123',
      userId: 'user_123',
      email: 'test@example.com',
      clickUrl: '/api/email/click?q=queue_123',
    });

    expect(payload).toMatchObject({
      campaign_key: 'checkout-abandoned-24h',
      user_id: 'user_123',
      recipient_email: 'test@example.com',
      status: 'sent',
      template_data: {
        ctaUrl: '/api/email/click?q=queue_123',
        recoveryAudience: 'checkout_abandoner',
      },
      metadata: {
        verifier: 'controlled_delivery_self_verify',
        verifier_run_id: 'run_123',
      },
    });
  });
});
