/**
 * The homepage is force-static, so a server-rendered credit count is frozen at
 * build time: every visitor read "3 free credits" (restricted tier), while the
 * standard tier gets 5 and the paywalled tier gets 0. The offer must follow the
 * visitor's real tier on the client.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import messages from '@/locales/en/common.json';

const regionTier = vi.hoisted(() => ({ tier: null as string | null }));
vi.mock('@client/hooks/useRegionTier', () => ({
  useRegionTier: () => ({ tier: regionTier.tier, isLoading: regionTier.tier === null }),
}));

import { HeroCreditSubtext, HeroFreeToStart } from '@client/components/landing/HeroCreditOffer';

function renderOffer(tier: string | null) {
  regionTier.tier = tier;
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <p>
        <HeroCreditSubtext />
      </p>
      <span>
        <HeroFreeToStart />
      </span>
    </NextIntlClientProvider>
  );
}

describe('hero credit offer', () => {
  it('shows the standard tier its real 5 credits', () => {
    renderOffer('standard');
    expect(screen.getByText(/^5 free credits • No watermark/)).toBeTruthy();
    expect(screen.getByText('Free to start')).toBeTruthy();
  });

  it('shows the restricted tier 3 credits', () => {
    renderOffer('restricted');
    expect(screen.getByText(/^3 free credits •/)).toBeTruthy();
  });

  it('never promises free credits to the paywalled tier', () => {
    renderOffer('paywalled');
    expect(screen.queryByText(/free credits/i)).toBeNull();
    expect(screen.queryByText('Free to start')).toBeNull();
    expect(screen.getAllByText(/Plans available in your region/)).toHaveLength(2);
  });

  it('shows a number-free offer before the tier is known', () => {
    renderOffer(null);
    expect(screen.getByText(/^Free credits on signup •/)).toBeTruthy();
  });

  it('the static hero no longer computes the offer on the server', () => {
    const source = fs.readFileSync(
      path.resolve('client/components/landing/HeroSection.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/CF-IPCountry|welcomeCreditsFor\(/);
    expect(source).toMatch(/<HeroCreditSubtext \/>/);
  });
});
