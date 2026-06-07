import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { LowCreditsEmail } from '@/emails/templates/LowCreditsEmail';

describe('LowCreditsEmail', () => {
  it('renders finish image CTA when return URL exists', async () => {
    const html = await render(
      <LowCreditsEmail
        baseUrl="https://example.com"
        supportEmail="support@example.com"
        creditsRemaining={0}
        requiredCredits={8}
        returnUrl="https://example.com/upscale?job=123"
        variant="insufficient"
      />
    );

    expect(html).toContain('Finish this image');
    expect(html).toContain('https://example.com/upscale?job=123');
  });
});
