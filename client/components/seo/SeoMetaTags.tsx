/**
 * SEO Meta Tags Component
 * Renders canonical URL and OpenGraph locale tags directly
 *
 * This component renders meta tags directly in the page body.
 * Next.js will hoist these tags to the <head> section automatically.
 *
 * This is used alongside HreflangLinks to ensure all essential SEO tags
 * are rendered in the initial HTML <head> rather than being streamed via RSC.
 */

import { getCanonicalUrl, getOpenGraphLocale } from '@/lib/seo/hreflang-generator';

interface ISeoMetaTagsProps {
  path: string; // Path without locale prefix (e.g., '/tools/ai-image-upscaler')
  locale?: 'en' | 'es' | 'pt' | 'de' | 'fr' | 'it' | 'ja';
}

/**
 * Render canonical link and og:locale meta tag in the head
 *
 * @example
 * ```tsx
 * <SeoMetaTags path="/tools/ai-image-upscaler" locale="en" />
 * ```
 */
export function SeoMetaTags({ path, locale = 'en' }: ISeoMetaTagsProps): JSX.Element {
  const canonicalUrl = getCanonicalUrl(path, locale);
  const ogLocale = getOpenGraphLocale(locale);

  return (
    <>
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:locale" content={ogLocale} />
    </>
  );
}
