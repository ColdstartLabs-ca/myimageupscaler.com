import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SeoWeeklyDigestEmail } from '@/emails/templates/SeoWeeklyDigestEmail';

describe('weekly SEO digest email', () => {
  it('renders populated sections and omits empty ones', () => {
    const html = renderToStaticMarkup(
      <SeoWeeklyDigestEmail
        day="2026-10-24"
        sections={[
          { title: 'Drift', rows: ['/blog/winner: title changed'] },
          { title: 'Stop-loss', rows: [] },
        ]}
      />
    );
    expect(html).toContain('2026-10-24');
    expect(html).toContain('Drift');
    expect(html).toContain('/blog/winner: title changed');
    expect(html).not.toContain('Stop-loss');
  });

  it('escapes remote page text instead of interpreting HTML', () => {
    const html = renderToStaticMarkup(
      <SeoWeeklyDigestEmail
        day="2026-10-24"
        sections={[{ title: 'Drift', rows: ['<script>remote value</script>'] }]}
      />
    );
    expect(html).toContain('&lt;script&gt;remote value&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});
