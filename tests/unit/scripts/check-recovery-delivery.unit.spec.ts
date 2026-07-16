import { describe, expect, it, vi } from 'vitest';
import {
  assertControlledClickResponse,
  assertControlledDeliveryArgs,
  assertControlledDeliveryProvider,
  assertVerifierCleanupResult,
  buildControlledDeliveryQueuePayload,
  buildDeliveryClickUrl,
  parseControlledDeliveryArgs,
  requestControlledClickRoute,
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

  it('should reject a non-Brevo marketing result', () => {
    expect(() => assertControlledDeliveryProvider('cloudflare')).toThrow('did not use Brevo');
    expect(() => assertControlledDeliveryProvider('brevo')).not.toThrow();
  });

  it('should exercise the signed click route and require an attributed HTTP redirect', async () => {
    const headers = new Headers({
      location: 'https://example.com/pricing?utm_source=email&utm_campaign=checkout-abandoned-24h',
    });
    const fetcher = vi.fn().mockResolvedValue({ status: 302, headers });

    const redirect = await requestControlledClickRoute(
      '/api/email/click?q=queue_123&token=signed-token',
      fetcher,
      'https://example.com'
    );

    expect(fetcher).toHaveBeenCalledWith(
      'https://example.com/api/email/click?q=queue_123&token=signed-token',
      { redirect: 'manual' }
    );
    expect(redirect).toContain('utm_source=email');
    expect(() => assertControlledClickResponse({ status: 401, headers })).toThrow(
      'signed click route'
    );
  });

  it('should fail when verifier cleanup reports a database error or remaining rows', () => {
    expect(() =>
      assertVerifierCleanupResult('events delete', { message: 'database unavailable' })
    ).toThrow('events delete');
    expect(() => assertVerifierCleanupResult('queue verification', null, 1)).toThrow(
      'remaining row'
    );
    expect(() => assertVerifierCleanupResult('queue verification', null, 0)).not.toThrow();
  });
});
