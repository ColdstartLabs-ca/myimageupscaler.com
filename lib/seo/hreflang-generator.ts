/**
 * Hreflang Generator Module
 * Phase 5: Metadata & SEO with hreflang
 * Generates hreflang alternate links for multi-language SEO
 */

import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../../i18n/config';
import type { Locale } from '../../i18n/config';
import { clientEnv } from '@shared/config/env';
import type { PSEOCategory } from './url-utils';
import { isCategoryLocalized } from './localization-config';

/**
 * Get available locales for a category
 * Returns only locales where the category is localized
 *
 * @param category - The pSEO category (optional, for filtering)
 * @returns Array of available locales for the category
 */
function getAvailableLocales(category?: PSEOCategory): Locale[] {
  // If no category specified, return all supported locales
  if (!category) {
    return [...SUPPORTED_LOCALES];
  }

  // Filter locales to only those where this category is localized
  return SUPPORTED_LOCALES.filter(locale => isCategoryLocalized(category, locale));
}

/**
 * Generate hreflang alternates for a page path
 * Returns an object with locale keys and their corresponding URLs
 *
 * @param path - The page path without locale prefix (e.g., '/tools/ai-image-upscaler')
 * @param category - The pSEO category (optional, for filtering locales)
 * @returns Object with locale codes as keys and full URLs as values
 *
 * @example
 * ```ts
 * const alternates = generateHreflangAlternates('/tools/ai-image-upscaler', 'tools');
 * // Returns:
 * // {
 * //   en: 'https://myimageupscaler.com/tools/ai-image-upscaler',
 * //   es: 'https://myimageupscaler.com/es/tools/ai-image-upscaler',
 * //   'x-default': 'https://myimageupscaler.com/tools/ai-image-upscaler'
 * // }
 *
 * const compareAlternates = generateHreflangAlternates('/compare/best-ai-upscalers', 'compare');
 * // Returns (only English for compare category):
 * // {
 * //   en: 'https://myimageupscaler.com/compare/best-ai-upscalers',
 * //   'x-default': 'https://myimageupscaler.com/compare/best-ai-upscalers'
 * // }
 * ```
 */
export function generateHreflangAlternates(
  path: string,
  category?: PSEOCategory
): Record<string, string> {
  const alternates: Record<string, string> = {};

  // Remove trailing slash for consistency (including root for homepage)
  const normalizedPath = path.replace(/\/$/, '');

  // Get available locales for this category
  const availableLocales = getAvailableLocales(category);

  // Generate URL for each available locale
  for (const locale of availableLocales) {
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
  return generateHreflangAlternates(path, category);
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
 * IMPORTANT: All localized pages canonicalize to the English version
 * This is the SEO best practice for multi-language sites
 *
 * @param path - The page path without locale prefix (e.g., '/tools/ai-upscaler')
 * @param locale - The locale of the page (default: 'en') - NOT used for canonical URL
 * @returns Full canonical URL (always English version)
 *
 * @example
 * ```ts
 * getCanonicalUrl('/tools/ai-upscaler', 'en');
 * // Returns: 'https://myimageupscaler.com/tools/ai-upscaler'
 *
 * getCanonicalUrl('/tools/ai-upscaler', 'es');
 * // Returns: 'https://myimageupscaler.com/tools/ai-upscaler' (same!)
 *
 * getCanonicalUrl('/', 'es');
 * // Returns: 'https://myimageupscaler.com'
 * ```
 */
export function getCanonicalUrl(path: string, _locale: Locale = DEFAULT_LOCALE): string {
  // Remove trailing slash for consistency
  const normalizedPath = path.replace(/\/$/, '') || '/';

  // Always use the English version for canonical URL
  // This ensures all localized variations point to the same canonical
  const englishPath = getLocalizedPath(normalizedPath, DEFAULT_LOCALE);

  // For root path, return BASE_URL without trailing slash
  if (englishPath === '/' || englishPath === '') {
    return clientEnv.BASE_URL;
  }

  return `${clientEnv.BASE_URL}${englishPath}`;
}

/**
 * Validate hreflang alternates object
 * Ensures x-default is present and all URLs are valid
 * Note: Does not require all SUPPORTED_LOCALES to be present, as some categories
 * may only be localized for a subset of locales
 *
 * @param alternates - The hreflang alternates to validate
 * @returns True if valid, false otherwise
 */
export function validateHreflangAlternates(alternates: Record<string, string>): boolean {
  // Check for x-default (required)
  if (!alternates['x-default']) {
    console.error('Missing x-default hreflang');
    return false;
  }

  // Check for English (required as it's the default locale)
  if (!alternates['en']) {
    console.error('Missing hreflang for locale: en');
    return false;
  }

  // Validate all present locales have valid URLs
  for (const [locale, url] of Object.entries(alternates)) {
    // Skip x-default in URL validation loop
    if (locale === 'x-default') {
      continue;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      console.error(`Invalid URL for locale ${locale}: ${url}`);
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
 * Generate OpenGraph metadata for a page
 * Returns a complete openGraph object with url and images
 *
 * @param path - The page path without locale prefix (e.g., '/privacy', '/help')
 * @param title - The page title
 * @param description - The page description
 * @param locale - The locale for this page instance (default: 'en')
 * @param ogImageUrl - Optional custom OG image URL (default: '/og-image.png')
 * @returns OpenGraph metadata object for Next.js Metadata
 *
 * @example
 * ```ts
 * const og = getOpenGraphMetadata('/privacy', 'Privacy Policy', 'Our privacy policy', 'en');
 * // Returns:
 * // {
 * //   url: 'https://myimageupscaler.com/privacy',
 * //   siteName: 'MyImageUpscaler',
 * //   type: 'website',
 * //   title: 'Privacy Policy',
 * //   description: 'Our privacy policy',
 * //   locale: 'en_US',
 * //   images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Privacy Policy' }]
 * // }
 * ```
 */
export function getOpenGraphMetadata(
  path: string,
  title: string,
  description: string,
  locale: Locale = 'en',
  ogImageUrl = '/og-image.png'
): {
  url: string;
  siteName: string;
  type: 'website';
  title: string;
  description: string;
  locale: string;
  images: Array<{
    url: string;
    width: number;
    height: number;
    alt: string;
  }>;
} {
  const canonicalUrl = getCanonicalUrl(path, locale);
  const ogLocale = getOpenGraphLocale(locale);

  return {
    url: canonicalUrl,
    siteName: clientEnv.APP_NAME,
    type: 'website',
    title,
    description,
    locale: ogLocale,
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: title,
      },
    ],
  };
}

/**
 * Generate hreflang links for sitemap XML entries
 * Returns XHTML link elements for language alternates that actually exist
 *
 * IMPORTANT: Only generates hreflang for locales where the page exists.
 * For English-only categories, only English hreflang is generated.
 * For localized categories, all supported locales are included.
 *
 * @param path - The page path without locale prefix (e.g., '/tools/ai-image-upscaler')
 * @param category - The pSEO category (required to determine localization)
 * @returns Array of XHTML link elements for sitemap
 *
 * @example
 * ```ts
 * const links = generateSitemapHreflangLinks('/tools/ai-image-upscaler', 'tools');
 * // Returns array of <xhtml:link> elements for all 7 locales + x-default
 *
 * const compareLinks = generateSitemapHreflangLinks('/compare/best-ai-upscalers', 'compare');
 * // Returns array with only English + x-default (compare is English-only)
 * ```
 */
export function generateSitemapHreflangLinks(path: string, category?: PSEOCategory): string[] {
  const links: string[] = [];
  const baseUrl = clientEnv.BASE_URL;

  // Determine which locales to include
  // If category is specified, only include locales where the page exists
  const localesToInclude = category
    ? SUPPORTED_LOCALES.filter(locale => isCategoryLocalized(category, locale))
    : SUPPORTED_LOCALES;

  // Generate xhtml:link for each available locale
  for (const locale of localesToInclude) {
    const localePath = getLocalizedPath(path, locale);
    const url = `${baseUrl}${localePath}`;
    links.push(`    <xhtml:link rel="alternate" hreflang="${locale}" href="${url}"/>`);
  }

  // Add x-default pointing to the English version
  links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}${path}"/>`);

  return links;
}
