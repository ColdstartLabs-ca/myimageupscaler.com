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

  // Remove trailing slash for consistency (including root for homepage)
  const normalizedPath = path.replace(/\/$/, '');

  // Generate URL for each supported locale
  for (const locale of SUPPORTED_LOCALES) {
    const localePath = getLocalizedPath(normalizedPath, locale);
    alternates[locale] = `${clientEnv.BASE_URL}${localePath}`;
  }

  // Add x-default pointing to the default locale (English)
  // This tells search engines to use the English version for unsupported languages
  // For root path, use BASE_URL without trailing slash
  alternates['x-default'] =
    normalizedPath === '' ? clientEnv.BASE_URL : `${clientEnv.BASE_URL}${normalizedPath}`;

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
 * getLocalizedPath('/', 'en'); // ''
 * getLocalizedPath('/', 'es'); // '/es'
 * ```
 */
export function getLocalizedPath(path: string, locale: Locale): string {
  // For default locale (English), return path as-is
  if (locale === DEFAULT_LOCALE) {
    return path;
  }

  // Handle root path specially - return just the locale prefix
  if (path === '' || path === '/') {
    return `/${locale}`;
  }

  // Remove leading slash before adding locale prefix to avoid double slashes
  const pathWithoutSlash = path.startsWith('/') ? path.slice(1) : path;

  // Add locale prefix for non-default locales
  return `/${locale}/${pathWithoutSlash}`;
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
 * Strips any locale prefix from the path
 *
 * @param path - The page path (may or may not include locale prefix)
 * @returns Full canonical URL
 *
 * @example
 * ```ts
 * getCanonicalUrl('/tools/ai-upscaler');
 * // Returns: 'https://myimageupscaler.com/tools/ai-upscaler'
 *
 * getCanonicalUrl('/es/tools/upscaler');
 * // Returns: 'https://myimageupscaler.com/tools/upscaler'
 * ```
 */
export function getCanonicalUrl(path: string): string {
  // Strip locale prefix if present (e.g., /es/tools -> /tools)
  const pathWithoutLocale = SUPPORTED_LOCALES.reduce((acc, locale) => {
    const prefix = `/${locale}/`;
    if (acc.startsWith(prefix)) {
      return acc.slice(prefix.length - 1); // Keep leading slash
    }
    return acc;
  }, path);

  // Remove trailing slash for consistency (including root for homepage)
  const normalizedPath = pathWithoutLocale.replace(/\/$/, '');

  // If normalizedPath is empty (was root), return BASE_URL without trailing slash
  if (normalizedPath === '') {
    return clientEnv.BASE_URL;
  }

  return `${clientEnv.BASE_URL}${normalizedPath}`;
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
 * @param locale - Our locale code (e.g., 'en', 'es', 'pt')
 * @returns OpenGraph locale string (e.g., 'en_US', 'es_ES', 'pt_BR')
 *
 * @example
 * ```ts
 * getOpenGraphLocale('en'); // 'en_US'
 * getOpenGraphLocale('es'); // 'es_ES'
 * getOpenGraphLocale('pt'); // 'pt_BR'
 * ```
 */
export function getOpenGraphLocale(locale: Locale): string {
  const ogLocaleMap: Record<Locale, string> = {
    en: 'en_US',
    es: 'es_ES',
    pt: 'pt_BR',
    de: 'de_DE',
    fr: 'fr_FR',
    it: 'it_IT',
    ja: 'ja_JP',
  };

  return ogLocaleMap[locale] || 'en_US';
}

/**
 * Generate hreflang links for sitemap XML entries
 * Returns XHTML link elements for all language alternates
 *
 * @param path - The page path without locale prefix (e.g., '/tools/ai-image-upscaler')
 * @returns Array of XHTML link elements for sitemap
 *
 * @example
 * ```ts
 * const links = generateSitemapHreflangLinks('/tools/ai-image-upscaler');
 * // Returns array of <xhtml:link> elements for all 7 locales + x-default
 * ```
 */
export function generateSitemapHreflangLinks(path: string): string[] {
  const links: string[] = [];
  const baseUrl = clientEnv.BASE_URL;

  // Generate xhtml:link for each locale
  for (const locale of SUPPORTED_LOCALES) {
    const localePath = getLocalizedPath(path, locale);
    const url = `${baseUrl}${localePath}`;
    links.push(`    <xhtml:link rel="alternate" hreflang="${locale}" href="${url}"/>`);
  }

  // Add x-default
  links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}${path}"/>`);

  return links;
}
