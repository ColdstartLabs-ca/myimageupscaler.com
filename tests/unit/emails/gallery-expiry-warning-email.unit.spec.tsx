import { readFileSync } from 'node:fs';
import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { GalleryExpiryWarningEmail } from '@/emails/templates/GalleryExpiryWarning';

const baseProps = {
  baseUrl: 'https://myimageupscaler.com',
  supportEmail: 'support@myimageupscaler.com',
};

describe('GalleryExpiryWarningEmail', () => {
  it('states the 30-day inactivity rule, the 7-day warning and the free-account scope', async () => {
    const html = await render(<GalleryExpiryWarningEmail {...baseProps} />);
    const text = html.replaceAll('<!-- -->', '');

    expect(text).toContain('inactive for 23 days');
    expect(text).toContain('may expire after 30 days of inactivity');
    expect(text).toContain('at least 7 days');
    expect(text).toContain('Sign in or open your gallery to keep your images');
    expect(text).toContain('free accounts only');
    expect(text).toContain('Paid users are exempt');
  });

  it('links the CTA to the dashboard gallery and honours an override', async () => {
    const defaultHtml = await render(<GalleryExpiryWarningEmail {...baseProps} />);
    expect(defaultHtml).toContain('https://myimageupscaler.com/dashboard/gallery');

    const overrideHtml = await render(
      <GalleryExpiryWarningEmail {...baseProps} ctaUrl="https://myimageupscaler.com/tracked" />
    );
    expect(overrideHtml).toContain('https://myimageupscaler.com/tracked');
  });

  it('does not claim the rollout is complete or that originals vanish in an hour', async () => {
    const text = (await render(<GalleryExpiryWarningEmail {...baseProps} />)).replaceAll(
      '<!-- -->',
      ''
    );

    expect(text).not.toMatch(/one hour|1 hour|deleted at/i);
    expect(text).not.toMatch(/welcome credits/i);
  });

  it('registers the template and its subject in the provider adapter', () => {
    const source = readFileSync(
      'server/services/email-providers/base-email-provider-adapter.ts',
      'utf8'
    );

    expect(source).toContain("'gallery-expiry-warning': 'GalleryExpiryWarningEmail'");
    expect(source).toContain(
      "'gallery-expiry-warning': () => import('@/emails/templates/GalleryExpiryWarning')"
    );
    expect(source).toContain("'gallery-expiry-warning': d =>");
  });
});
