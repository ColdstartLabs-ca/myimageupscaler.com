import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import de from '@/locales/de/common.json';
import en from '@/locales/en/common.json';
import es from '@/locales/es/common.json';
import fr from '@/locales/fr/common.json';
import itLocale from '@/locales/it/common.json';
import ja from '@/locales/ja/common.json';
import pt from '@/locales/pt/common.json';
import { welcomeCreditOfferKey } from '@shared/config/product-capabilities';

const LOCALES = { en, de, es, fr, it: itLocale, ja, pt } as const;

/** Every homepage component that renders a `*Subtext` template. */
const CALLER_FILES = [
  'client/components/landing/HeroSection.tsx',
  'client/components/landing/SectionSignupCTA.tsx',
  'client/components/pages/HomePageClient.tsx',
];

/** Regional eligibility cases produced by `welcomeCreditsForTier`. */
const ELIGIBILITY_CASES = [
  { name: 'unknown region', credits: null, expectedKey: 'creditOfferUnknown', numeric: false },
  { name: 'no-free-offer region', credits: 0, expectedKey: 'creditOfferNone', numeric: false },
  { name: 'reduced region', credits: 3, expectedKey: 'creditOfferCount', numeric: true },
  { name: 'standard region', credits: 5, expectedKey: 'creditOfferCount', numeric: true },
] as const;

/** `t('someSubtext', { a, b })` → { someSubtext: ['a', 'b'] } */
function subtextCallsIn(file: string): Record<string, string[]> {
  const source = readFileSync(join(process.cwd(), file), 'utf8');
  const calls: Record<string, string[]> = {};

  for (const [, key, args] of source.matchAll(/t\('(\w*[Ss]ubtext)',\s*\{([^}]*)\}\)/g)) {
    calls[key] = args
      .split(',')
      .map(arg => arg.split(':')[0].trim())
      .filter(Boolean);
  }

  return calls;
}

function placeholdersIn(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
}

const CALLS = CALLER_FILES.flatMap(file =>
  Object.entries(subtextCallsIn(file)).map(([key, vars]) => ({ file, key, vars }))
);

describe('homepage credit offer locale contract', () => {
  it('should find every *Subtext caller', () => {
    expect(CALLS.map(call => call.key).sort()).toEqual([
      'ctaSubtext',
      'ctaSubtext',
      'finalCtaSubtext',
    ]);
  });

  it.each(CALLS)('$file supplies every $key variable in all locales', ({ key, vars }) => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const template = (messages.homepage as Record<string, string>)[key];

      expect(template, `${locale}.homepage.${key} is missing`).toBeTypeOf('string');

      for (const placeholder of placeholdersIn(template)) {
        expect(vars, `${locale}.homepage.${key} needs {${placeholder}}`).toContain(placeholder);
      }
    }
  });

  it.each(ELIGIBILITY_CASES)(
    'renders the $name offer in every locale with no raw key',
    ({ credits, expectedKey, numeric }) => {
      for (const [locale, messages] of Object.entries(LOCALES)) {
        const homepage = messages.homepage as Record<string, string>;
        const t = createTranslator({
          locale,
          messages,
          namespace: 'homepage',
          onError: error => {
            throw error;
          },
        });

        const creditOffer = t(welcomeCreditOfferKey(credits), { credits: credits ?? 0 });

        expect(creditOffer, `${locale} offer wording`).toBe(
          homepage[expectedKey].replace('{credits}', String(credits ?? 0))
        );

        for (const { key, vars } of CALLS) {
          const values = Object.fromEntries(
            vars.map(name => [name, name === 'creditOffer' ? creditOffer : (credits ?? 0)])
          );
          const rendered = t(key, values);

          expect(rendered, `${locale}.${key}`).toContain(creditOffer);
          expect(rendered, `${locale}.${key} rendered a raw key`).not.toContain('homepage.');
          expect(rendered, `${locale}.${key} left a placeholder`).not.toMatch(/\{\w+\}/);

          if (!numeric) {
            expect(rendered, `${locale}.${key} advertises a credit count`).not.toMatch(/\b0\b/);
          }
        }
      }
    }
  );
});
