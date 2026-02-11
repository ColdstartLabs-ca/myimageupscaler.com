/**
 * pSEO Localization Configuration
 *
 * Defines which categories are localized and which are English-only.
 * Used to determine when to show English-only banner.
 */
import type { PSEOCategory } from './url-utils';
import { Locale } from '@/i18n/config';

/**
 * Categories that have full translations for all supported locales
 * Updated: 2026-01-31 - Categories with complete translations for all 7 languages
 */
export const LOCALIZED_CATEGORIES: PSEOCategory[] = [
  'tools',
  'formats',
  'free',
  'guides',
  'scale',
  'alternatives',
  'use-cases',
  'format-scale',
  'platform-format',
  'device-use',
];

/**
 * Categories that are English-only (no translations available)
 * Updated: 2026-02-11 - Added ai-features as English-only category
 * These categories only exist in English and should not generate hreflang links
 */
export const ENGLISH_ONLY_CATEGORIES: PSEOCategory[] = [
  'compare',
  'platforms',
  'bulk-tools',
  'content',
  'photo-restoration',
  'camera-raw',
  'industry-insights',
  'device-optimization',
  'ai-features',
];

/**
 * All pSEO categories
 * Note: Not all categories are currently included in LOCALIZED_CATEGORIES or ENGLISH_ONLY_CATEGORIES
 * This is a transitional state during localization work
 */
export const ALL_CATEGORIES: PSEOCategory[] = [...LOCALIZED_CATEGORIES, ...ENGLISH_ONLY_CATEGORIES];

/**
 * Check if a category is localized for a given locale
 * @param category - The pSEO category to check
 * @param locale - The locale to check against
 * @returns true if category is localized for locale
 */
export function isCategoryLocalized(category: PSEOCategory, locale: Locale): boolean {
  // English is always supported
  if (locale === 'en') {
    return true;
  }

  // Check if category is in localized list
  return LOCALIZED_CATEGORIES.includes(category);
}

/**
 * Check if a category is English-only
 * @param category - The pSEO category to check
 * @returns true if category is English-only
 */
export function isCategoryEnglishOnly(category: PSEOCategory): boolean {
  return ENGLISH_ONLY_CATEGORIES.includes(category);
}

/**
 * Get English-only categories list
 * @returns Array of English-only category names
 */
export function getEnglishOnlyCategories(): PSEOCategory[] {
  return [...ENGLISH_ONLY_CATEGORIES];
}

/**
 * Get localized categories list
 * @returns Array of localized category names
 */
export function getLocalizedCategories(): PSEOCategory[] {
  return [...LOCALIZED_CATEGORIES];
}

/**
 * Check if a page should show English-only banner
 * @param category - The pSEO category
 * @param locale - The current locale
 * @param hasTranslation - Whether a translation exists for specific page
 * @returns true if banner should be shown
 */
export function shouldShowEnglishOnlyBanner(
  category: PSEOCategory,
  locale: Locale,
  hasTranslation: boolean
): boolean {
  // Don't show for English locale
  if (locale === 'en') {
    return false;
  }

  // Show if category is English-only
  if (isCategoryEnglishOnly(category)) {
    return true;
  }

  // Show if category is localized but translation doesn't exist
  if (isCategoryLocalized(category, locale) && !hasTranslation) {
    return true;
  }

  return false;
}

/**
 * Get English version path for a page
 * @param currentPath - The current localized path
 * @returns The English version path
 */
export function getEnglishPath(currentPath: string): string {
  // Remove locale prefix if present
  const pathWithoutLocale = currentPath.replace(/^\/[a-z]{2}(\/|$)/, '/');

  // Ensure it starts with /
  return pathWithoutLocale.startsWith('/') ? pathWithoutLocale : `/${pathWithoutLocale}`;
}

/**
 * All supported locales for localized categories
 * Updated: 2026-01-07 - All 7 languages now have complete translations
 */
const ALL_SUPPORTED_LOCALES: Locale[] = ['en', 'es', 'pt', 'de', 'fr', 'it', 'ja'];

/**
 * Configuration for each category's localization status
 * Updated: 2026-02-11 - Added ai-features as English-only category
 */
export const LOCALIZATION_STATUS = {
  tools: {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Core tool pages fully localized for all 7 languages',
  },
  formats: {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Format guide pages fully localized for all 7 languages',
  },
  free: {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Free tool pages fully localized for all 7 languages',
  },
  guides: {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Guide pages fully localized for all 7 languages',
  },
  scale: {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Scale pages fully localized for all 7 languages',
  },
  alternatives: {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Alternative pages fully localized for all 7 languages (updated 2025-01-15)',
  },
  'use-cases': {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Use case pages fully localized for all 7 languages (updated 2025-01-15)',
  },
  'format-scale': {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Format-scale multiplier pages fully localized for all 7 languages (updated 2025-01-15)',
  },
  'platform-format': {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Platform-format multiplier pages fully localized for all 7 languages (updated 2025-01-15)',
  },
  'device-use': {
    localized: true,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'Device-use pages fully localized for all 7 languages (updated 2025-01-15)',
  },
  compare: {
    localized: false,
    supportedLocales: ['en'] as Locale[],
    notes: 'Comparison pages are English-only',
  },
  platforms: {
    localized: false,
    supportedLocales: ['en'] as Locale[],
    notes: 'Platform pages are English-only',
  },
  'bulk-tools': {
    localized: false,
    supportedLocales: ['en'] as Locale[],
    notes: 'Bulk tools pages are English-only (2026-01-31)',
  },
  content: {
    localized: false,
    supportedLocales: ['en'] as Locale[],
    notes: 'Content category pages are English-only (2026-01-31)',
  },
  'photo-restoration': {
    localized: false,
    supportedLocales: ['en'] as Locale[],
    notes: 'Photo restoration pages are English-only (2026-01-31)',
  },
  'camera-raw': {
    localized: false,
    supportedLocales: ['en'] as Locale[],
    notes: 'Camera RAW pages are English-only (2026-01-31)',
  },
  'industry-insights': {
    localized: false,
    supportedLocales: ['en'] as Locale[],
    notes: 'Industry insights pages are English-only (2026-01-31)',
  },
  'device-optimization': {
    localized: false,
    supportedLocales: ['en'] as Locale[],
    notes: 'Device optimization pages are English-only (2026-01-31)',
  },
  'ai-features': {
    localized: false,
    supportedLocales: ALL_SUPPORTED_LOCALES,
    notes: 'AI enhancement features pages (updated 2026-02-11)',
  },
} as const;
