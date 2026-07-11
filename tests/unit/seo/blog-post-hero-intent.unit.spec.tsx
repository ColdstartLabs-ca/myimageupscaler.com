import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { BlogPostHeroSection } from '@client/components/blog/BlogPostHeroSection';

vi.mock('@client/components/blog/BlogGuideNav', () => ({
  BlogGuideNav: () => null,
}));

describe('blog post hero search-intent disclosure', () => {
  test('shows a direct official-tool link before generic product CTAs', () => {
    render(
      <BlogPostHeroSection
        title="Pixelcut AI Photo Editor vs MyImageUpscaler: 2026 Analysis"
        description="Independent comparison"
        category="Reviews"
        readingTime="10 min read"
        publishedDate="Jul 10, 2026"
        tryLabel="Try Free Now"
        pricingLabel="View Pricing"
        tableOfContents={[]}
        intentNotice={{
          text: 'Independent comparison — looking for Pixelcut itself?',
          href: 'https://www.pixelcut.ai/',
          linkLabel: 'Open the official Pixelcut editor',
        }}
      />
    );

    expect(screen.getByText('Independent comparison — looking for Pixelcut itself?')).toBeVisible();
    expect(screen.getByRole('link', { name: /official Pixelcut editor/i })).toHaveAttribute(
      'href',
      'https://www.pixelcut.ai/'
    );
  });
});
