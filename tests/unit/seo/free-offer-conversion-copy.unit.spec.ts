/**
 * Regression guard for the 2026-09-10 "Product Truth" deploy (b90c56da, d4781071,
 * 0fff2b59), which stripped "free" framing from the homepage and pSEO copy in the
 * name of accuracy and cut signups ~40% (101/day -> 61/day) starting Sep 12.
 *
 * The credit grant is real and region-based (welcomeCreditsFor/welcomeCreditsForTier
 * in shared/config/product-capabilities.ts). Free framing is truthful wherever the
 * grant is > 0 credits, and this suite locks that framing in place. If you need to
 * remove "free" wording again, that is a deliberate product/marketing decision —
 * not a "truthfulness" cleanup — and this test should be updated consciously, not
 * silently broken.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import de from '@/locales/de/common.json';
import en from '@/locales/en/common.json';
import es from '@/locales/es/common.json';
import fr from '@/locales/fr/common.json';
import itLocale from '@/locales/it/common.json';
import ja from '@/locales/ja/common.json';
import pt from '@/locales/pt/common.json';
import { welcomeCreditCopy } from '@shared/config/product-capabilities';

const LOCALES = { en, de, es, fr, it: itLocale, ja, pt } as const;

describe('free-offer conversion copy', () => {
  it('welcomeCreditCopy claims "free" only when credits are actually granted', () => {
    expect(welcomeCreditCopy(5)).toMatch(/free/i);
    expect(welcomeCreditCopy(3)).toMatch(/free/i);
    expect(welcomeCreditCopy(0)).not.toMatch(/free/i);
  });

  it('locales/en/common.json restores the free-offer wording', () => {
    const homepage = en.homepage as Record<string, string>;
    expect(homepage.creditOfferCount).toMatch(/free/i);
    expect(homepage.ctaFixImagesFree).toMatch(/Free/);
    expect(homepage.ctaSubtext).toMatch(/No credit card required/i);
  });

  it.each(Object.entries(LOCALES))(
    '%s/common.json has a non-empty creditOfferCount with {credits} and a ctaFixImagesFree',
    (_locale, messages) => {
      const homepage = messages.homepage as Record<string, string>;
      expect(homepage.creditOfferCount).toBeTruthy();
      expect(homepage.creditOfferCount).toContain('{credits}');
      expect(homepage.ctaFixImagesFree).toBeTruthy();
    }
  );

  it('HeroSection restores the "Free to start" and "No credit card required" badges', () => {
    const source = readFileSync('client/components/landing/HeroSection.tsx', 'utf8');
    expect(source).toContain('Free to start');
    expect(source).toContain('No credit card required');
  });

  it('pSEO CTASection leads with "No credit card required", not "Account required"', () => {
    const source = readFileSync('app/(pseo)/_components/pseo/sections/CTASection.tsx', 'utf8');
    expect(source).toContain('No credit card required');
    expect(source).not.toMatch(/Account required/);
  });

  it('never reintroduces "welcome credits" wording in owned English or SEO copy', () => {
    const files = [
      ...readdirSync('locales/en')
        .filter(name => name.endsWith('.json'))
        .map(name => `locales/en/${name}`),
      ...readdirSync('app/seo/data')
        .filter(name => name.endsWith('.json'))
        .map(name => `app/seo/data/${name}`),
    ];

    const offenders = files.filter(file => /welcome credits/i.test(readFileSync(file, 'utf8')));

    expect(offenders, `files still saying "welcome credits": ${offenders.join(', ')}`).toEqual([]);
  });
});
