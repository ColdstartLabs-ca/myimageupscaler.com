import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { ProviderIncidentEmail } from '@/emails/templates/ProviderIncidentEmail';

const baseProps = {
  attempts: 508,
  failures: 261,
  failureRatioPercent: 51,
  billingFailures: 16,
  circuitStatus: 'upscale_completion_rate_below_0.95',
};

describe('ProviderIncidentEmail', () => {
  it('should render daily completion context when the alert includes a date and rate', async () => {
    const html = await render(
      <ProviderIncidentEmail
        {...baseProps}
        completionRatePercent={49}
        completionRateDate="2026-08-03"
      />
    );
    const text = html.replaceAll('<!-- -->', '');

    expect(text).toContain('49% of 508 upscale attempts completed on 2026-08-03');
    expect(text).not.toContain('last 10 minutes');
  });

  it('should preserve the rolling provider-health wording without daily context', async () => {
    const html = await render(<ProviderIncidentEmail {...baseProps} />);
    const text = html.replaceAll('<!-- -->', '');

    expect(text).toContain('261 of 508 processing attempts failed in the last 10 minutes (51%).');
  });
});
