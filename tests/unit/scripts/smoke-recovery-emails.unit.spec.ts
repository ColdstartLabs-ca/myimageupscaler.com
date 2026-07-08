import React from 'react';
import { describe, expect, it } from 'vitest';
import { buildLifecycleClickUrl, smokeRecoveryEmailCase } from '@/scripts/smoke-recovery-emails';
import { CheckoutRecoveryEmail } from '@/emails/templates/CheckoutRecoveryEmail';

const service = {
  createClickToken: (queueId: string, destination: string) => `signed:${queueId}:${destination}`,
};

describe('smoke-recovery-emails script helpers', () => {
  it('should build signed lifecycle click URLs without exposing raw recovery tokens', () => {
    const clickUrl = buildLifecycleClickUrl({
      service,
      queueId: 'queue_123',
      destination: '/pricing?intent=checkout_abandoner&recovery=checkout-abandoned',
    });

    expect(clickUrl).toContain('/api/email/click');
    expect(clickUrl).toContain('q=queue_123');
    expect(clickUrl).toContain('token=');
    expect(clickUrl).not.toContain('raw_token');
    expect(clickUrl).not.toContain('recovery_token');
  });

  it('should render recovery email smoke cases with click tracking', async () => {
    const result = await smokeRecoveryEmailCase(
      {
        label: 'checkout recovery',
        queueId: 'queue_123',
        destination: '/pricing?intent=checkout_abandoner&recovery=checkout-abandoned',
        render: ctaUrl =>
          React.createElement(CheckoutRecoveryEmail, {
            baseUrl: 'https://myimageupscaler.com',
            supportEmail: 'support@myimageupscaler.com',
            appName: 'MyImageUpscaler',
            ctaUrl,
            preferenceUrl: '/dashboard/settings',
            recoveryAudience: 'checkout_abandoner',
          }),
      },
      service
    );

    expect(result.containsClickUrl).toBe(true);
    expect(result.containsRawTokenWord).toBe(false);
    expect(result.htmlLength).toBeGreaterThan(500);
  });
});
