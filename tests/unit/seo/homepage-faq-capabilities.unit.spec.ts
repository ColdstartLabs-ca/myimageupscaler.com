import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import de from '@/locales/de/common.json';
import en from '@/locales/en/common.json';
import es from '@/locales/es/common.json';
import fr from '@/locales/fr/common.json';
import itLocale from '@/locales/it/common.json';
import ja from '@/locales/ja/common.json';
import pt from '@/locales/pt/common.json';
import { PRODUCT_CAPABILITIES } from '@shared/config/product-capabilities';

const LOCALES = { en, de, es, fr, it: itLocale, ja, pt } as const;

const SCALE_QUESTION = 'What scale factors and file formats are supported?';
const FREE_QUESTION = 'Is there a free option?';

type HomepageMessages = Record<string, unknown> & {
  faq5Question?: string;
  faq5Answer?: string;
  faq6Question?: string;
  faq6Answer?: string;
  faqItems?: { question: string; answer: string }[];
};

const homepageOf = (messages: unknown): HomepageMessages =>
  (messages as { homepage: HomepageMessages }).homepage;

const HARDCODED_CREDITS = /\b\d+\s*(?:free\s+)?credits\b/i;

describe('homepage FAQ states real capabilities', () => {
  it('renders the two new FAQ items on the homepage', () => {
    const source = readFileSync('client/components/pages/HomePageClient.tsx', 'utf8');

    expect(source).toContain("t('faq5Question')");
    expect(source).toContain("t('faq5Answer')");
    expect(source).toContain("t('faq6Question')");
    expect(source).toContain("t('faq6Answer')");
  });

  it('English FAQ asks about scale factors and upload formats', () => {
    expect(en.homepage.faq5Question).toBe(SCALE_QUESTION);
    const answer = en.homepage.faq5Answer;

    expect(answer).toMatch(/2x/i);
    expect(answer).toMatch(/4x/i);
    expect(answer).toMatch(/8x/i);
    for (const format of PRODUCT_CAPABILITIES.directUploadFormats) {
      expect(answer).toContain(format);
    }
  });

  it('English FAQ asks about the free option without a fixed credit number', () => {
    expect(en.homepage.faq6Question).toBe(FREE_QUESTION);
    const answer = en.homepage.faq6Answer;

    expect(answer).toMatch(/free credits/i);
    expect(answer).toMatch(/no credit card/i);
    expect(answer).toMatch(/region/i);
    expect(answer).not.toMatch(HARDCODED_CREDITS);
  });

  it('English visible FAQ and FAQPage JSON-LD include both new items verbatim', () => {
    expect(en.homepage.faqItems).toEqual(
      expect.arrayContaining([
        { question: en.homepage.faq5Question, answer: en.homepage.faq5Answer },
        { question: en.homepage.faq6Question, answer: en.homepage.faq6Answer },
      ])
    );
  });

  it('the homepage FAQPage schema emits both new questions', async () => {
    const { generateHomepageSchema } = await import('@lib/seo/schema-generator');
    const schema = generateHomepageSchema('en') as {
      '@graph': { '@type': string; mainEntity?: { name: string }[] }[];
    };
    const faqPage = schema['@graph'].find(node => node['@type'] === 'FAQPage');
    const names = (faqPage?.mainEntity ?? []).map(item => item.name);

    expect(names).toContain(SCALE_QUESTION);
    expect(names).toContain(FREE_QUESTION);
  });

  it.each(Object.entries(LOCALES))('%s has both new FAQ keys with answers', (_locale, messages) => {
    const homepage = homepageOf(messages);

    expect(homepage.faq5Question?.trim()).toBeTruthy();
    expect(homepage.faq5Answer?.trim()).toBeTruthy();
    expect(homepage.faq6Question?.trim()).toBeTruthy();
    expect(homepage.faq6Answer?.trim()).toBeTruthy();
  });

  it('no homepage FAQ answer states a fixed number of free credits', () => {
    for (const messages of Object.values(LOCALES)) {
      const homepage = homepageOf(messages);

      for (const [key, value] of Object.entries(homepage)) {
        if (!/^faq\d+Answer$/.test(key)) continue;
        expect(String(value), key).not.toMatch(HARDCODED_CREDITS);
      }
      for (const item of homepage.faqItems ?? []) {
        expect(item.answer, item.question).not.toMatch(HARDCODED_CREDITS);
      }
    }
  });
});
