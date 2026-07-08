import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { CreditWallRecoveryEmail } from '@/emails/templates/CreditWallRecoveryEmail';

describe('CreditWallRecoveryEmail', () => {
  it('should render outcome-first copy for credit wall dismissers', async () => {
    const html = await render(
      <CreditWallRecoveryEmail
        baseUrl="https://example.com"
        supportEmail="support@example.com"
        recoveryAudience="credit_wall_dismissed"
        ctaUrl="/api/email/click?q=queue_123&url=%2Fpricing%3Frecovery%3Dcredit-wall&token=signed-token"
      />
    );

    expect(html).toContain('Finish more images without stopping');
    expect(html).toContain('keep your image workflow moving');
    expect(html).not.toContain('buy credits');
  });
});
