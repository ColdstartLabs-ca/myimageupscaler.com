/**
 * Hreflang Links Component
 * Generates hreflang alternate links for SEO
 *
 * This component renders hreflang links directly in the page body.
 * Next.js will hoist these <link> tags to the <head> section automatically.
 *
 * NOTE: Next.js renders the attribute as `hrefLang` (camelCase) in the HTML output.
 * This is functionally equivalent to `hreflang` since HTML attributes are case-insensitive.
 * Search engines (Google, Bing) and browsers handle both forms correctly.
 */

import { SUPPORTED_LOCALES } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import { clientEnv } from '@shared/config/env';
import { getLocalizedPath } from '@/lib/seo/hreflang-generator';
import { isCategoryLocalized } from '@/lib/seo/localization-config';
import type { PSEOCategory } from '@/lib/seo/url-utils';

interface IHreflangLinksProps {
  path: string; // Path without locale prefix (e.g., '/tools/ai-image-upscaler')
  category?: PSEOCategory; // Optional category to check if localized
  locale?: string; // Current locale (default: 'en')
}

/**
 * Render hreflang alternate links in the head
 * Generates links for all supported locales plus x-default
 *
 * @example
 * ```tsx
 * <HreflangLinks path="/tools/ai-image-upscaler" category="tools" />
 * <HreflangLinks path="/content/upscale-anime" /> // English-only, no hreflang
 * ```
 */
export function HreflangLinks({ path, category, locale = 'en' }: IHreflangLinksProps): JSX.Element {
  // Remove trailing slash to avoid 308 redirects
  const normalizedPath = path.replace(/\/$/, '') || '/';

  // Determine if this category is localized for all supported locales
  // If no category is provided, assume it's localized (backwards compatible)
  const isLocalized = category === undefined || isCategoryLocalized(category, locale as Locale);

  // If category is not localized, only add x-default (no hreflang links needed)
  if (!isLocalized) {
    // For root path, use BASE_URL without trailing slash
    const xDefaultHref =
      normalizedPath === '/' ? clientEnv.BASE_URL : `${clientEnv.BASE_URL}${normalizedPath}`;
    return (
      <>
        <link rel="alternate" hrefLang="x-default" href={xDefaultHref} />
      </>
    );
  }

  // Generate hreflang links for all supported locales
  const links = SUPPORTED_LOCALES.map(loc => {
    const localizedPath = getLocalizedPath(normalizedPath, loc);
    const url = `${clientEnv.BASE_URL}${localizedPath}`;
    return <link key={loc} rel="alternate" hrefLang={loc} href={url} />;
  });

  // Add x-default pointing to the default locale (English)
  // For root path, use BASE_URL without trailing slash (matches generateHreflangAlternates)
  const xDefaultHref =
    normalizedPath === '/' ? clientEnv.BASE_URL : `${clientEnv.BASE_URL}${normalizedPath}`;

  links.push(
    <link key="x-default" rel="alternate" hrefLang="x-default" href={xDefaultHref} />
  );

  // Return fragment with all link tags
  // Next.js will hoist these to the head section automatically
  return <>{links}</>;
}
