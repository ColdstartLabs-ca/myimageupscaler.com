import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { BlogEducationEmail } from '@/emails/templates/BlogEducationEmail';

describe('BlogEducationEmail', () => {
  it('renders article and product CTAs', async () => {
    const html = await render(
      <BlogEducationEmail
        articleTitle="Restore old photos"
        articleUrl="https://example.com/blog/restore-old-photos"
        productCtaUrl="https://example.com/upscale?mode=face"
        supportEmail="support@example.com"
      />
    );

    expect(html).toContain('https://example.com/blog/restore-old-photos');
    expect(html).toContain('https://example.com/upscale?mode=face');
  });
});
