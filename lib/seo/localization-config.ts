/**
 * pSEO localization policy derived from rendered production coverage.
 * Re-run `yarn seo:measure:locales` to refresh the committed evidence.
 */
import coverageArtifact from '@/seo-reports/locale-coverage-2026-08-25.json';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import { PSEO_CATEGORIES, type PSEOCategory } from './url-utils';

interface ILocaleCoveragePair {
  category: string;
  locale: string;
  sampled: number;
  translated: number;
  englishMirror: number;
  soft404: number;
  missing: number;
}

const coveragePairs = (coverageArtifact as { pairs: ILocaleCoveragePair[] }).pairs;

/** A pair is translated only when every rendered sample differs cleanly from English. */
export function isTranslatedPair(category: PSEOCategory, locale: Locale): boolean {
  if (locale === 'en') return true;
  const pair = coveragePairs.find(row => row.category === category && row.locale === locale);
  return Boolean(
    pair &&
    pair.sampled > 0 &&
    pair.translated === pair.sampled &&
    pair.englishMirror === 0 &&
    pair.soft404 === 0 &&
    pair.missing === 0
  );
}

/** Categories with at least one measured non-English translation pair. */
export const LOCALIZED_CATEGORIES: PSEOCategory[] = PSEO_CATEGORIES.filter(category =>
  SUPPORTED_LOCALES.some(locale => locale !== 'en' && isTranslatedPair(category, locale))
);

/** Categories intentionally routed only in English. */
export const ENGLISH_ONLY_CATEGORIES: PSEOCategory[] = [
  'compare',
  'comparisons-expanded',
  'platforms',
  'bulk-tools',
  'content',
  'photo-restoration',
  'camera-raw',
  'industry-insights',
  'device-optimization',
  'ai-features',
  'technical-guides',
  'personas-expanded',
  'use-cases-expanded',
  'ai-photo-editor',
];

export const ALL_CATEGORIES: PSEOCategory[] = [...PSEO_CATEGORIES];

export function isCategoryLocalized(category: PSEOCategory, locale: Locale): boolean {
  return isTranslatedPair(category, locale);
}

export function isCategoryEnglishOnly(category: PSEOCategory): boolean {
  return ENGLISH_ONLY_CATEGORIES.includes(category);
}

export function getEnglishOnlyCategories(): PSEOCategory[] {
  return [...ENGLISH_ONLY_CATEGORIES];
}

export function getLocalizedCategories(): PSEOCategory[] {
  return [...LOCALIZED_CATEGORIES];
}

export function shouldShowEnglishOnlyBanner(
  category: PSEOCategory,
  locale: Locale,
  hasTranslation: boolean
): boolean {
  if (locale === 'en') return false;
  return !hasTranslation || !isTranslatedPair(category, locale);
}

export function getEnglishPath(currentPath: string): string {
  const pathWithoutLocale = currentPath.replace(/^\/[a-z]{2}(\/|$)/, '/');
  return pathWithoutLocale.startsWith('/') ? pathWithoutLocale : `/${pathWithoutLocale}`;
}

export const LOCALIZATION_STATUS = Object.fromEntries(
  PSEO_CATEGORIES.map(category => {
    const supportedLocales = SUPPORTED_LOCALES.filter(locale => isTranslatedPair(category, locale));
    return [
      category,
      {
        localized: supportedLocales.length > 1,
        supportedLocales,
        notes: `Derived from ${coverageArtifact.generatedAt} rendered locale coverage`,
      },
    ];
  })
) as Record<PSEOCategory, { localized: boolean; supportedLocales: Locale[]; notes: string }>;
