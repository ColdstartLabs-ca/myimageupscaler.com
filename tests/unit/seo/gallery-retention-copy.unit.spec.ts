/**
 * Locks the PRD-SQR-04 gallery-retention disclosure in the English gallery UI and
 * in every published terms locale. The wording states the 30-day inactivity rule,
 * the 7-day warning window, that signing in keeps images, and that paid users are
 * exempt. It must not reintroduce the "welcome credits" phrasing the free-offer
 * guard already retired.
 */
import { describe, expect, it } from 'vitest';
import deTerms from '@/locales/de/terms.json';
import en from '@/locales/en/dashboard.json';
import enTerms from '@/locales/en/terms.json';
import esTerms from '@/locales/es/terms.json';
import frTerms from '@/locales/fr/terms.json';
import itTerms from '@/locales/it/terms.json';
import jaTerms from '@/locales/ja/terms.json';
import ptTerms from '@/locales/pt/terms.json';

/** The locale's own word for the free-credit grant, read from its current terms copy. */
const FREE_CREDIT_WORD: Record<string, RegExp> = {
  en: /free credits/i,
  de: /kostenlose Guthaben/i,
  es: /créditos gratuitos/i,
  fr: /crédits gratuits/i,
  it: /crediti gratuiti/i,
  ja: /無料クレジット/,
  pt: /créditos gratuitos/i,
};

const PAID_EXEMPT_WORD: Record<string, RegExp> = {
  en: /exempt/i,
  de: /ausgenommen/i,
  es: /exentas/i,
  fr: /exempt/i,
  it: /esenti/i,
  ja: /対象外/,
  pt: /isentas/i,
};

const TERMS_LOCALES = {
  en: enTerms,
  de: deTerms,
  es: esTerms,
  fr: frTerms,
  it: itTerms,
  ja: jaTerms,
  pt: ptTerms,
} as const;

describe('gallery retention copy', () => {
  it('English gallery UI discloses the 30-day inactivity rule and the 7-day warning', () => {
    const note = en.gallery.retentionNote;

    expect(note).toMatch(/30 days of inactivity/);
    expect(note).toMatch(/at least 7 days/);
    expect(note).toMatch(/signing in keeps them/i);
    expect(note).toMatch(/paid plans are exempt/i);
  });

  it('English gallery UI does not reintroduce retired free-offer phrasing', () => {
    expect(en.gallery.retentionNote).not.toMatch(/welcome credits/i);
  });

  it('all seven locales keep the free-credit wording and add the retention disclosure', () => {
    for (const [locale, terms] of Object.entries(TERMS_LOCALES)) {
      const free = terms.credits.free.description;

      expect(free, `${locale} keeps the free-credit offer`).toMatch(FREE_CREDIT_WORD[locale]);
      expect(free, `${locale} states the 30-day rule`).toMatch(/30/);
      expect(free, `${locale} states the 7-day warning`).toMatch(/7/);
      expect(free, `${locale} names the paid exemption`).toMatch(PAID_EXEMPT_WORD[locale]);
    }
  });

  it('English terms preserve the free-credit offer sentence', () => {
    expect(enTerms.credits.free.description).toMatch(/New users receive free credits/i);
    expect(enTerms.credits.free.description).not.toMatch(/welcome credits/i);
  });
});
