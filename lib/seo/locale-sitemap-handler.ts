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
import { filterEligiblePages, logSitemapEligibility } from './page-eligibility';
import { getSitemapResponseHeaders } from './sitemap-generator';
import { isClusterMember, isClusterOwner } from './intent-ownership';
import { INTERACTIVE_TOOL_PATHS, isLocalizedInteractiveSlug } from './interactive-tool-routes';

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
 * Build sitemap pages list for tools category,
 * combining static tools and interactive tools with their custom paths.
 */
export function buildToolsSitemapPages(
  staticTools: Array<{ slug: string; lastUpdated: string; title: string; ogImage?: string }>,
  interactiveTools: Array<{ slug: string; lastUpdated: string; title: string; ogImage?: string }>,
  additionalTools: Array<{
    slug: string;
    lastUpdated: string;
    title: string;
    ogImage?: string;
  }> = []
): ILocaleSitemapPage[] {
  const isLocaleSitemapTool = (tool: { slug: string }) =>
    !(tool.slug in INTERACTIVE_TOOL_PATHS) || isLocalizedInteractiveSlug(tool.slug);
  const localizedInteractiveTools = interactiveTools.filter(isLocaleSitemapTool);
  const existingInteractiveSlugs = new Set(localizedInteractiveTools.map(tool => tool.slug));
  const routedAdditionalTools = additionalTools.filter(
    (tool, index) =>
      tool.slug in INTERACTIVE_TOOL_PATHS &&
      isLocalizedInteractiveSlug(tool.slug) &&
      !existingInteractiveSlugs.has(tool.slug) &&
      additionalTools.findIndex(candidate => candidate.slug === tool.slug) === index
  );
  const routedInteractiveTools = [...localizedInteractiveTools, ...routedAdditionalTools];

  return [
    ...staticTools.map(t => ({
      slug: t.slug,
      lastUpdated: t.lastUpdated,
      title: t.title,
      ogImage: t.ogImage,
    })),
    ...routedInteractiveTools.map(t => ({
      slug: t.slug,
      lastUpdated: t.lastUpdated,
      title: t.title,
      ogImage: t.ogImage,
      customPath: INTERACTIVE_TOOL_PATHS[t.slug as keyof typeof INTERACTIVE_TOOL_PATHS],
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
  const routedPages = pages.filter(page => {
    const pagePath = `/${categoryPath}/${page.slug}`;
    return !isClusterOwner(pagePath) && !isClusterMember(pagePath);
  });
  const { pages: eligiblePages, skipped } = filterEligiblePages(routedPages, category, locale);
  logSitemapEligibility(category, locale, routedPages.length, skipped);
  const localeCategoryPath = getLocalizedPath(`/${categoryPath}`, locale);

  const categoryEntry = buildUrlEntry(
    `/${categoryPath}`,
    localeCategoryPath,
    new Date().toISOString(),
    priority,
    category
  );

  const pageEntries = eligiblePages.map(page => {
    const englishPath = page.customPath || `/${categoryPath}/${page.slug}`;
    const localePath = getLocalizedPath(englishPath, locale);
    const imageXml = page.ogImage
      ? `\n    <image:image>\n      <image:loc>${page.ogImage.startsWith('http') ? page.ogImage : `${BASE_URL}${page.ogImage}`}</image:loc>\n      <image:title>${escapeXml(page.title || page.slug)}</image:title>\n    </image:image>`
      : '';

    const availableLocales =
      category === 'tools' && page.customPath && !isLocalizedInteractiveSlug(page.slug)
        ? (['en'] as const)
        : undefined;

    return buildUrlEntry(
      englishPath,
      localePath,
      page.lastUpdated,
      priority,
      category,
      imageXml,
      availableLocales
    );
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
  extraXml: string = '',
  availableLocales?: readonly Locale[]
): string {
  const hreflangLinks = generateSitemapHreflangLinks(englishPath, category, availableLocales).join(
    '\n'
  );
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
