/** The homepage FAQ stays covered by a general test because the SEO lock does not cover FAQ content. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(process.cwd(), 'locales');

interface IFaqItem {
  question: string;
  answer: string;
}

interface ILocaleCommon {
  homepage: { faq3Question: string; faq3Answer: string; faqItems: IFaqItem[] };
}

const localeCommon = (locale: string): ILocaleCommon =>
  JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'common.json'), 'utf8'));

describe('protected homepage FAQ', () => {
  // "how to upscale images for free" is a top organic query; the deleted FAQ entry was
  // the page that matched it. The rendered FAQ and the FAQPage JSON-LD must agree.
  it('keeps the "How to upscale images for free?" FAQ question on the homepage', () => {
    const { homepage } = localeCommon('en');
    expect(homepage.faq3Question).toMatch(/upscale images for free/i);
    const rendered = homepage.faqItems.find(item => item.question === homepage.faq3Question);
    expect(rendered?.answer).toBe(homepage.faq3Answer);
  });
});
