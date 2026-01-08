/**
 * Hreflang Generator Module
 * Phase 5: Metadata & SEO with hreflang
 * Generates hreflang alternate links for multi-language SEO
 */

import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../../i18n/config';
import type { Locale } from '../../i18n/config';
import { clientEnv } from '@shared/config/env';
import type { PSEOCategory } from './url-utils';

/**
 * Generate hreflang alternates for a page path
 * Returns an object with locale keys and their corresponding URLs
 *
 * @param path - The page path without locale prefix (e.g., '/tools/ai-image-upscaler')
 * @returns Object with locale codes as keys and full URLs as values
 *
 * @example
 * ```ts
 * const alternates = generateHreflangAlternates('/tools/ai-image-upscaler');
 * // Returns:
 * // {
 * //   en: 'https://myimageupscaler.com/tools/ai-image-upscaler',
 * //   es: 'https://myimageupscaler.com/es/tools/ai-image-upscaler',
 * //   'x-default': 'https://myimageupscaler.com/tools/ai-image-upscaler'
 * // }
 * ```
 */
export function generateHreflangAlternates(path: string): Record<string, string> {
  const alternates: Record<string, string> = {};

  // Generate URL for each supported locale
  for (const locale of SUPPORTED_LOCALES) {
    const localePath = getLocalizedPath(path, locale);
    alternates[locale] = `${clientEnv.BASE_URL}${localePath}`;
  }

  // Add x-default pointing to the default locale (English)
  // This tells search engines to use the English version for unsupported languages
  alternates['x-default'] = `${clientEnv.BASE_URL}${path}`;

  return alternates;
}

/**
 * Generate hreflang alternates for a pSEO page
 * Convenience function that combines category and slug
 *
 * @param category - The pSEO category (e.g., 'tools', 'formats')
 * @param slug - The page slug
 * @returns Object with locale codes as keys and full URLs as values
 */
export function generatePSEOHreflangAlternates(
  category: PSEOCategory,
  slug: string
): Record<string, string> {
  const path = `/${category}/${slug}`;
  return generateHreflangAlternates(path);
}

/**
 * Get localized path for a given locale
 * English (default) has no prefix
 * Other locales have prefix (e.g., /es/tools)
 *
 * @param path - The original path
 * @param locale - The target locale
 * @returns Localized path
 *
 * @example
 * ```ts
 * getLocalizedPath('/tools/ai-upscaler', 'en'); // '/tools/ai-upscaler'
 * getLocalizedPath('/tools/ai-upscaler', 'es'); // '/es/tools/ai-upscaler'
 * ```
 */
export function getLocalizedPath(path: string, locale: Locale): string {
  // For default locale (English), no prefix
  if (locale === DEFAULT_LOCALE) {
    return path;
  }

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Add locale prefix for non-default locales
  return `/${locale}${normalizedPath}`;
}

/**
 * Format hreflang alternates for Next.js Metadata API
 * Returns the languages object suitable for metadata.alternates.languages
 *
 * @param alternates - The hreflang alternates object
 * @returns Formatted languages object for Next.js metadata
 *
 * @example
 * ```ts
 * const alternates = generateHreflangAlternates('/tools/ai-upscaler');
 * const languages = formatHreflangForMetadata(alternates);
 * // Returns:
 * // {
 * //   en: 'https://myimageupscaler.com/tools/ai-upscaler',
 * //   'x-default': 'https://myimageupscaler.com/tools/ai-upscaler',
 * //   es: 'https://myimageupscaler.com/es/tools/ai-upscaler'
 * // }
 * ```
 */
export function formatHreflangForMetadata(
  alternates: Record<string, string>
): Record<string, string> {
  return alternates;
}

/**
 * Generate canonical URL for a page
 * Uses the default locale (English) as the canonical version
 *
 * @param path - The page path without locale prefix
 * @returns Full canonical URL
 *
 * @example
 * ```ts
 * getCanonicalUrl('/tools/ai-upscaler');
 * // Returns: 'https://myimageupscaler.com/tools/ai-upscaler'
 * ```
 */
export function getCanonicalUrl(path: string): string {
  return `${clientEnv.BASE_URL}${path}`;
}

/**
 * Validate hreflang alternates object
 * Ensures all required locales are present and URLs are valid
 *
 * @param alternates - The hreflang alternates to validate
 * @returns True if valid, false otherwise
 */
export function validateHreflangAlternates(alternates: Record<string, string>): boolean {
  // Check for required locales
  if (!alternates['x-default']) {
    console.error('Missing x-default hreflang');
    return false;
  }

  for (const locale of SUPPORTED_LOCALES) {
    if (!alternates[locale]) {
      console.error(`Missing hreflang for locale: ${locale}`);
      return false;
    }

    // Validate URL format
    try {
      new URL(alternates[locale]);
    } catch {
      console.error(`Invalid URL for locale ${locale}: ${alternates[locale]}`);
      return false;
    }
  }

  return true;
}

/**
 * Generate locale-specific OpenGraph locale
 * Converts our locale codes to OpenGraph format
 *
 * @param locale - Our locale code (e.g., 'en', 'es')
 * @returns OpenGraph locale string (e.g., 'en_US', 'es_ES')
 *
 * @example
 * ```ts
 * getOpenGraphLocale('en'); // 'en_US'
 * getOpenGraphLocale('es'); // 'es_ES'
 * ```
 */
export function getOpenGraphLocale(locale: Locale): string {
  const ogLocaleMap: Record<Locale, string> = {
    en: 'en_US',
    es: 'es_ES',
  };

  return ogLocaleMap[locale] || 'en_US';
}
