import type { PSEOCategory } from './url-utils';

/**
 * Generates a safe locale string that never produces "undefined" in URLs.
 * @param locale - The locale string (may be undefined, null, or 'undefined' string literal)
 * @returns A safe locale string (empty string if invalid, otherwise the locale)
 */
export function getSafeLocale(locale?: string): string {
  // Guard against undefined or 'undefined' string literal
  if (!locale || locale === 'undefined' || locale.trim() === '') {
    return '';
  }
  return locale;
}

/**
 * Generates a safe breadcrumb href for pSEO templates.
 * @param category - The pSEO category (from url-utils or Pseo-types or PSEOCategory)
 * @param slug - The page slug
 * @param locale - Optional locale
 * @returns A safe breadcrumb href object
 */
export function buildSafeBreadcrumbHref(
  category: PSEOCategory,
  slug: string,
  locale?: string
): { href: string; localeSuffix: string; label: string } {
  // Get safe locale
  const safeLocale = getSafeLocale(locale);
  const localePrefix = safeLocale ? `/${safeLocale}` : '';

  // Map category to readable label
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  // Build href
  let href = `${localePrefix}/${category}`;
  if (slug) {
    href = `${localePrefix}/${category}/${slug}`;
  }

  return {
    href,
    localeSuffix: safeLocale,
    label: categoryLabel,
  };
}
