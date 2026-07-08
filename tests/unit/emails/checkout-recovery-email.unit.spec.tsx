import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { CheckoutRecoveryEmail } from '@/emails/templates/CheckoutRecoveryEmail';

describe('CheckoutRecoveryEmail', () => {
  it('should render checkout recovery CTA with no raw token leak', async () => {
    const html = await render(
      <CheckoutRecoveryEmail
        baseUrl="https://example.com"
        supportEmail="support@example.com"
        recoveryAudience="checkout_abandoner"
        ctaUrl="/api/email/click?q=queue_123&url=%2Fpricing%3Frecovery%3Dcheckout-abandoned&token=signed-token"
      />
    );

    expect(html).toContain('Return to checkout');
    expect(html).toContain('/api/email/click');
    expect(html).not.toContain('super-secret-signing-key');
  });
});
