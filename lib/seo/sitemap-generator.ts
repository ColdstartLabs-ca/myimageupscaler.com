/**
 * Sitemap Generator Module
 * Phase 4: Sitemap & SEO Infrastructure for 7 languages
 *
 * Provides utilities for generating multi-language sitemaps with hreflang support.
 * Follows Google's recommended sitemap protocol with xhtml:link elements.
 */

import { clientEnv } from '@shared/config/env';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { generateSitemapHreflangLinks } from './hreflang-generator';
import { isCategoryLocalized as checkCategoryLocalized } from './localization-config';
import type { PSEOCategory } from './url-utils';

// Re-export for convenience
export { generateSitemapHreflangLinks };

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

/**
 * Sitemap entry configuration
 */
export interface ISitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

/**
 * Page with lastUpdated date for sitemap generation
 */
export interface IPageWithLastUpdated {
  lastUpdated: string;
}

/**
 * Get the most recent lastUpdated date from an array of pages
 * Used for category hub pages to reflect when any page in the category was updated
 *
 * @param pages - Array of pages with lastUpdated dates
 * @param fallbackDate - Optional fallback date if no pages exist (default: now)
 * @returns ISO string of the most recent lastUpdated date
 *
 * @example
 * ```ts
 * const tools = await getAllTools();
 * const lastmod = getMostRecentLastUpdated(tools);
 * // Returns: "2026-01-15T10:30:00Z" (most recent update)
 * ```
 */
export function getMostRecentLastUpdated(
  pages: IPageWithLastUpdated[],
  fallbackDate: Date = new Date()
): string {
  if (!pages || pages.length === 0) {
    return fallbackDate.toISOString();
  }

  const mostRecent = pages.reduce((latest, page) => {
    const pageDate = new Date(page.lastUpdated);
    return pageDate > latest ? pageDate : latest;
  }, new Date(0));

  // If all dates are invalid (epoch 0), use fallback
  if (mostRecent.getTime() === 0) {
    return fallbackDate.toISOString();
  }

  return mostRecent.toISOString();
}

/**
 * Sitemap URL with optional hreflang alternates
 * Note: url is optional here as it's derived from path + locale
 */
export interface ISitemapUrlEntry extends Omit<ISitemapEntry, 'url'> {
  url?: string; // Optional - derived from path + locale if not provided
  path: string; // Path without locale or base URL
  locale?: Locale; // Locale for this specific entry
  category?: PSEOCategory; // pSEO category for hreflang filtering
  includeHreflang?: boolean; // Whether to include hreflang links
}

/**
 * Localized sitemap configuration
 */
export interface ILocalizedSitemapConfig {
  category: string; // Category name (e.g., 'tools', 'formats')
  entries: ISitemapUrlEntry[];
  defaultChangeFreq?: ISitemapEntry['changeFrequency'];
  defaultPriority?: number;
}

/**
 * Generate a single URL entry for sitemap with optional hreflang
 *
 * IMPORTANT: Sitemaps should only include canonical URLs (English versions)
 * Localized variations are indicated via hreflang links, not separate sitemap entries
 *
 * @param entry - Sitemap entry configuration
 * @returns XML string for a single URL entry
 *
 * @example
 * ```ts
 * const entry = generateSitemapUrlEntry({
 *   path: '/tools/ai-image-upscaler',
 *   category: 'tools',
 *   lastModified: '2026-01-07',
 *   includeHreflang: true
 * });
 * ```
 */
export function generateSitemapUrlEntry(entry: ISitemapUrlEntry): string {
  const {
    path,
    category,
    lastModified = new Date().toISOString(),
    changeFrequency = 'weekly',
    priority = 0.8,
    includeHreflang = false,
  } = entry;

  // IMPORTANT: Always use the canonical (English) URL in sitemaps
  // The locale parameter is now ignored for URL generation
  const fullUrl = `${BASE_URL}${path}`;

  // Generate hreflang links if requested
  // Pass category to filter locales to only those where the page exists
  const hreflangLinks = includeHreflang
    ? generateSitemapHreflangLinks(path, category).join('\n')
    : '';

  return `  <url>
    <loc>${fullUrl}</loc>
    <lastmod>${lastModified}</lastmod>
    <changefreq>${changeFrequency}</changefreq>
    <priority>${priority}</priority>${hreflangLinks ? `\n${hreflangLinks}` : ''}
  </url>`;
}

/**
 * Generate a complete sitemap XML for a category
 *
 * @param config - Localized sitemap configuration
 * @param locale - Locale for this sitemap
 * @returns Complete sitemap XML string
 *
 * @example
 * ```ts
 * const sitemap = generateLocalizedSitemap({
 *   category: 'tools',
 *   entries: toolPages,
 *   defaultChangeFreq: 'weekly',
 *   defaultPriority: 0.9
 * }, 'pt');
 * ```
 */
export function generateLocalizedSitemap(
  config: ILocalizedSitemapConfig,
  locale: Locale = DEFAULT_LOCALE
): string {
  const { category, entries, defaultChangeFreq, defaultPriority } = config;

  // Generate category index page entry
  const categoryPath = `/${category}`;
  const categoryEntry = generateSitemapUrlEntry({
    path: categoryPath,
    locale,
    changeFrequency: 'weekly',
    priority: 0.8,
    includeHreflang: false, // No hreflang for category index
  });

  // Generate all page entries
  const pageEntries = entries.map(entry =>
    generateSitemapUrlEntry({
      ...entry,
      locale,
      changeFrequency: entry.changeFrequency || defaultChangeFreq,
      priority: entry.priority || defaultPriority,
      includeHreflang: entry.includeHreflang ?? true, // Default to true
    })
  );

  // Combine into full XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${categoryEntry}
${pageEntries.join('\n')}
</urlset>`;

  return xml;
}

/**
 * Generate sitemap index entries for all locales
 * Returns array of sitemap filenames that should be referenced in the main index
 *
 * @param category - Category name
 * @param locales - List of locales to generate sitemaps for (defaults to all supported)
 * @returns Array of sitemap configuration objects
 *
 * @example
 * ```ts
 * const sitemaps = generateSitemapIndexEntries('tools');
 * // Returns:
 * // [
 * //   { name: 'sitemap-tools.xml', locale: 'en' },
 * //   { name: 'sitemap-tools-es.xml', locale: 'es' },
 * //   { name: 'sitemap-tools-pt.xml', locale: 'pt' },
 * //   ...
 * // ]
 * ```
 */
export function generateSitemapIndexEntries(
  category: string,
  locales: readonly Locale[] = SUPPORTED_LOCALES
): Array<{ name: string; locale: Locale; lastmod: string }> {
  const lastmod = new Date().toISOString();

  return locales.map(locale => {
    const filename =
      locale === DEFAULT_LOCALE ? `sitemap-${category}.xml` : `sitemap-${category}-${locale}.xml`;

    return {
      name: filename,
      locale,
      lastmod,
    };
  });
}

/**
 * Check if a category has localized content for a specific locale
 * This determines whether to generate a locale-specific sitemap
 *
 * @param category - Category name
 * @param locale - Locale to check
 * @returns True if category is localized for this locale
 */
export function isCategoryLocalized(category: string, locale: Locale): boolean {
  // Use localization config for single source of truth
  // Cast to PSEOCategory as sitemaps may use string category names
  return checkCategoryLocalized(category as PSEOCategory, locale);
}

/**
 * Get all supported sitemap locales for a category
 * Returns locales that should have sitemaps generated
 *
 * @param category - Category name
 * @returns Array of locales that should have sitemaps
 */
export function getSitemapLocalesForCategory(category: string): Locale[] {
  // For non-localized categories, only return default locale
  if (!isCategoryLocalized(category, DEFAULT_LOCALE)) {
    return [DEFAULT_LOCALE];
  }

  // For localized categories, return all supported locales
  return [...SUPPORTED_LOCALES];
}

/**
 * Validate sitemap XML structure (basic validation)
 * Checks for required elements and proper XML structure
 *
 * @param xml - XML string to validate
 * @returns True if valid, false otherwise
 */
export function validateSitemapXML(xml: string): boolean {
  // Basic validation checks
  const requiredElements = [
    '<?xml version=',
    '<urlset',
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    'xmlns:xhtml="http://www.w3.org/1999/xhtml"',
    '</urlset>',
  ];

  return requiredElements.every(element => xml.includes(element));
}

/**
 * Generate sitemap response headers for Next.js
 * Returns proper headers for sitemap responses
 *
 * @returns Headers object for NextResponse
 */
export function getSitemapResponseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  };
}
