/**
 * Locale-Specific Sitemap Handler
 *
 * Generates locale-specific category sitemaps with localized URLs and hreflang annotations.
 * Each locale-specific sitemap lists URLs with locale prefixes (e.g., /es/tools/ai-upscaler)
 * while including full hreflang links to all language versions.
 *
 * Used by locale-specific sitemap routes (e.g., sitemap-tools-es.xml, sitemap-formats-pt.xml)
 */

import { NextResponse } from 'next/server';
import type { Locale } from '@/i18n/config';
import type { PSEOCategory } from './url-utils';
import { clientEnv } from '@shared/config/env';
import { getLocalizedPath, generateSitemapHreflangLinks } from './hreflang-generator';
import { getSitemapResponseHeaders } from './sitemap-generator';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export interface ILocaleSitemapPage {
  slug: string;
  lastUpdated: string;
  title?: string;
  ogImage?: string;
  /** Override default /{category}/{slug} path for this page */
  customPath?: string;
}

/**
 * Interactive tool URL mappings shared between English and locale-specific tools sitemaps.
 * Maps tool slugs to their actual route paths.
 */
export const TOOLS_INTERACTIVE_PATHS: Record<string, string> = {
  'image-resizer': '/tools/resize/image-resizer',
  'bulk-image-resizer': '/tools/resize/bulk-image-resizer',
  'resize-image-for-instagram': '/tools/resize/resize-image-for-instagram',
  'resize-image-for-youtube': '/tools/resize/resize-image-for-youtube',
  'resize-image-for-facebook': '/tools/resize/resize-image-for-facebook',
  'resize-image-for-twitter': '/tools/resize/resize-image-for-twitter',
  'resize-image-for-linkedin': '/tools/resize/resize-image-for-linkedin',
  'png-to-jpg': '/tools/convert/png-to-jpg',
  'jpg-to-png': '/tools/convert/jpg-to-png',
  'webp-to-jpg': '/tools/convert/webp-to-jpg',
  'webp-to-png': '/tools/convert/webp-to-png',
  'jpg-to-webp': '/tools/convert/jpg-to-webp',
  'png-to-webp': '/tools/convert/png-to-webp',
  'image-compressor': '/tools/compress/image-compressor',
  'bulk-image-compressor': '/tools/compress/bulk-image-compressor',
};

/**
 * Build sitemap pages list for tools category,
 * combining static tools and interactive tools with their custom paths.
 */
export function buildToolsSitemapPages(
  staticTools: Array<{ slug: string; lastUpdated: string; title: string; ogImage?: string }>,
  interactiveTools: Array<{ slug: string; lastUpdated: string; title: string; ogImage?: string }>
): ILocaleSitemapPage[] {
  return [
    ...staticTools.map(t => ({
      slug: t.slug,
      lastUpdated: t.lastUpdated,
      title: t.title,
      ogImage: t.ogImage,
    })),
    ...interactiveTools.map(t => ({
      slug: t.slug,
      lastUpdated: t.lastUpdated,
      title: t.title,
      ogImage: t.ogImage,
      customPath: TOOLS_INTERACTIVE_PATHS[t.slug],
    })),
  ];
}

/**
 * Generate a locale-specific category sitemap response.
 * Creates a sitemap XML with locale-prefixed URLs and hreflang annotations
 * for all available language versions.
 *
 * @param locale - Target locale (e.g., 'es', 'pt', 'de')
 * @param category - pSEO category for hreflang filtering
 * @param categoryPath - URL path segment for the category (e.g., 'tools', 'format-scale')
 * @param pages - Array of pages to include in the sitemap
 * @param priority - URL priority (default: 0.8)
 */
export function generateLocaleCategorySitemapResponse(
  locale: Locale,
  category: PSEOCategory,
  categoryPath: string,
  pages: ILocaleSitemapPage[],
  priority: number = 0.8
): NextResponse {
  const localeCategoryPath = getLocalizedPath(`/${categoryPath}`, locale);

  const categoryEntry = buildUrlEntry(
    `/${categoryPath}`,
    localeCategoryPath,
    new Date().toISOString(),
    priority,
    category
  );

  const pageEntries = pages.map(page => {
    const englishPath = page.customPath || `/${categoryPath}/${page.slug}`;
    const localePath = getLocalizedPath(englishPath, locale);
    const imageXml = page.ogImage
      ? `\n    <image:image>\n      <image:loc>${page.ogImage.startsWith('http') ? page.ogImage : `${BASE_URL}${page.ogImage}`}</image:loc>\n      <image:title>${escapeXml(page.title || page.slug)}</image:title>\n    </image:image>`
      : '';

    return buildUrlEntry(englishPath, localePath, page.lastUpdated, priority, category, imageXml);
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${categoryEntry}
${pageEntries.join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}

function buildUrlEntry(
  englishPath: string,
  localePath: string,
  lastmod: string,
  priority: number,
  category: PSEOCategory,
  extraXml: string = ''
): string {
  const hreflangLinks = generateSitemapHreflangLinks(englishPath, category).join('\n');
  return `  <url>
    <loc>${BASE_URL}${localePath}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
${hreflangLinks}${extraXml}
  </url>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
