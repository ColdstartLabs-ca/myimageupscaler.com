/**
 * Multi-locale retention copy guard (dashboard gallery note + tool privacy FAQ).
 *
 * Two disclosures must stay honest in every published locale:
 *  1. The dashboard gallery note (`dashboard.gallery.retentionNote`) states the
 *     30-day inactivity rule, the 7-day warning, that signing in keeps images,
 *     and that paid plans are exempt.
 *  2. The ai-image-upscaler privacy FAQ answer no longer claims deletion
 *     "within 1 hour of processing" (false: the R2 `inputs/` lifecycle rule only
 *     schedules deletion two days after upload, and Cloudflare may run later).
 *     It states the two-day schedule, that cleanup may take longer, and that
 *     saved gallery images follow a separate retention policy.
 *
 * The existing `gallery-retention-copy.unit.spec.ts` covers the English note and
 * the terms locales; this file adds the six translated dashboard notes and the
 * six translated privacy answers.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'ja', 'pt'] as const;
type Locale = (typeof LOCALES)[number];

function loadJson<T>(relativePath: string): T {
  const raw = readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8');
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${relativePath} is not valid JSON: ${detail}`);
  }
}

/** ICU MessageFormat sanity: braces must balance and never close before opening. */
function assertIcuBalanced(message: string, label: string): void {
  let depth = 0;
  for (const char of message) {
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    if (depth < 0) throw new Error(`${label} has an unbalanced '}'`);
  }
  if (depth !== 0) throw new Error(`${label} has an unbalanced '{'`);
}

interface IDashboard {
  gallery?: { retentionNote?: string };
}
interface IQuestion {
  question: string;
  answer: string;
}
interface IPage {
  slug: string;
  commonQuestions?: IQuestion[];
}
interface ITools {
  pages: IPage[];
}

// Locale-appropriate markers. Each list holds words a real translation uses, so
// an English fallback or a machine translation that misses the meaning fails.
const PAID_EXEMPT: Record<Locale, RegExp> = {
  en: /exempt/i,
  de: /ausgenommen/i,
  es: /exentos/i,
  fr: /exempt/i,
  it: /esenti/i,
  ja: /対象外/,
  pt: /isentos/i,
};

const PRIVACY_QUESTION: Record<Locale, RegExp> = {
  en: /stored on your servers/i,
  de: /Servern/i,
  es: /servidores/i,
  fr: /serveurs/i,
  it: /\bserver\b/i,
  ja: /サーバー/,
  pt: /servidores/i,
};

const OLD_ONE_HOUR = /1 hour|one hour|1 hora|1 heure|dans l'heure|1 Stunde|1 ora|entro 1 ora|1時間/;
const HARD_DEADLINE =
  /after processing|within 2 days|expire within|después del procesamiento|après le traitement|nach der Verarbeitung|dopo l'elaborazione|処理後|após o processamento|entro 2 giorni|dans les 2 jours|innerhalb von 2 Tagen|dentro de 2 días|2日以内/;

const TWO_DAY_SCHEDULE: Record<Locale, RegExp> = {
  en: /two days/i,
  de: /zwei Tagen/i,
  es: /dos días/i,
  fr: /deux jours/i,
  it: /due giorni/i,
  ja: /2日/,
  pt: /dois dias/i,
};

const SEPARATE_POLICY: Record<Locale, RegExp> = {
  en: /separate retention policy/i,
  de: /separat/i,
  es: /aparte/i,
  fr: /distincte/i,
  it: /separata/i,
  ja: /別の/,
  pt: /separada/i,
};

function retentionNote(locale: Locale): string {
  return loadJson<IDashboard>(`locales/${locale}/dashboard.json`).gallery?.retentionNote ?? '';
}

function privacyAnswer(locale: Locale): string {
  const tools = loadJson<ITools>(`locales/${locale}/tools.json`);
  const question = PRIVACY_QUESTION[locale];
  for (const page of tools.pages) {
    const faq = (page.commonQuestions ?? []).find(entry => question.test(entry.question));
    if (faq) return faq.answer;
  }
  throw new Error(`${locale}: missing the "stored on your servers" privacy FAQ entry`);
}

describe('multi-locale gallery retention note', () => {
  it('is present and non-empty in all seven locales', () => {
    for (const locale of LOCALES) {
      const note = retentionNote(locale);
      expect(typeof note, `${locale} retentionNote is a string`).toBe('string');
      expect(note.trim().length, `${locale} retentionNote is not empty`).toBeGreaterThan(0);
      assertIcuBalanced(note, `${locale} retentionNote`);
    }
  });

  it('carries the 30-day inactivity rule, the 7-day warning and the paid exemption in every locale', () => {
    for (const locale of LOCALES) {
      const note = retentionNote(locale);
      expect(note, `${locale} states the 30-day rule`).toMatch(/30/);
      expect(note, `${locale} states the 7-day warning`).toMatch(/7/);
      expect(note, `${locale} names the paid exemption`).toMatch(PAID_EXEMPT[locale]);
    }
  });
});

describe('multi-locale privacy FAQ retention copy', () => {
  it('no longer claims deletion within one hour of processing', () => {
    for (const locale of LOCALES) {
      expect(privacyAnswer(locale), `${locale} dropped the false 1-hour claim`).not.toMatch(
        OLD_ONE_HOUR
      );
    }
  });

  it('does not promise a hard deletion deadline', () => {
    for (const locale of LOCALES) {
      expect(privacyAnswer(locale), `${locale} has no hard deadline`).not.toMatch(HARD_DEADLINE);
    }
  });

  it('states temporary uploads are scheduled for deletion after two days', () => {
    for (const locale of LOCALES) {
      expect(privacyAnswer(locale), `${locale} states the two-day schedule`).toMatch(
        TWO_DAY_SCHEDULE[locale]
      );
    }
  });

  it('keeps saved-gallery retention separate from temporary uploads', () => {
    for (const locale of LOCALES) {
      expect(privacyAnswer(locale), `${locale} separates gallery retention`).toMatch(
        SEPARATE_POLICY[locale]
      );
    }
  });

  it('keeps every answer ICU-safe', () => {
    for (const locale of LOCALES) {
      assertIcuBalanced(privacyAnswer(locale), `${locale} privacy answer`);
    }
  });
});
