/**
 * Tools Sitemap Route - English (en)
 * Based on PRD-PSEO-04 Section 1.3: Category Sitemap Implementation
 * Phase 4: Added hreflang links for all 7 languages
 * Includes both static tools and interactive tools (resize, convert, compress)
 * Localized category
 */

import { NextResponse } from 'next/server';
import { getAllTools } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';
import {
  generateSitemapHreflangLinks,
  getSitemapResponseHeaders,
  getMostRecentLastUpdated,
} from '@/lib/seo/sitemap-generator';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import socialMediaResizeData from '@/app/seo/data/social-media-resize.json';
import type { IToolPage, IPSEODataFile } from '@/lib/seo/pseo-types';
import {
  INTERACTIVE_TOOL_PATHS,
  isLocalizedInteractiveSlug,
} from '@/lib/seo/interactive-tool-routes';

const CATEGORY = 'tools' as const;
const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

function getInteractiveToolPath(slug: string, fallback: string): string {
  return INTERACTIVE_TOOL_PATHS[slug as keyof typeof INTERACTIVE_TOOL_PATHS] ?? fallback;
}

function getInteractiveToolLocales(slug: string): readonly ['en'] | undefined {
  return slug in INTERACTIVE_TOOL_PATHS && !isLocalizedInteractiveSlug(slug) ? ['en'] : undefined;
}

export async function GET() {
  const staticTools = await getAllTools();
  const interactiveTools = (interactiveToolsData as IPSEODataFile<IToolPage>).pages;
  const socialMediaResizeTools = (
    socialMediaResizeData as unknown as IPSEODataFile<IToolPage>
  ).pages.filter(tool => tool.slug in INTERACTIVE_TOOL_PATHS);

  // Get the most recent lastUpdated date from all tools for the category page
  const allTools = [...staticTools, ...interactiveTools, ...socialMediaResizeTools];
  const categoryLastmod = getMostRecentLastUpdated(allTools);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE_URL}/tools</loc>
    <lastmod>${categoryLastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${generateSitemapHreflangLinks('/tools', CATEGORY).join('\n')}
  </url>
${staticTools
  .map(tool => {
    const hreflangLinks = generateSitemapHreflangLinks(`/tools/${tool.slug}`, CATEGORY).join('\n');
    return `  <url>
    <loc>${BASE_URL}/tools/${tool.slug}</loc>
    <lastmod>${tool.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
${hreflangLinks}${
      tool.ogImage
        ? `
    <image:image>
      <image:loc>${tool.ogImage.startsWith('http') ? tool.ogImage : `${BASE_URL}${tool.ogImage}`}</image:loc>
      <image:title>${tool.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`;
  })
  .join('\n')}
${interactiveTools
  .map(tool => {
    const path = getInteractiveToolPath(tool.slug, `/tools/${tool.slug}`);
    const hreflangLinks = generateSitemapHreflangLinks(
      path,
      CATEGORY,
      getInteractiveToolLocales(tool.slug)
    ).join('\n');
    return `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${tool.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
${hreflangLinks}${
      tool.ogImage
        ? `
    <image:image>
      <image:loc>${tool.ogImage.startsWith('http') ? tool.ogImage : `${BASE_URL}${tool.ogImage}`}</image:loc>
      <image:title>${tool.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`;
  })
  .join('\n')}
${socialMediaResizeTools
  .map(tool => {
    const path = getInteractiveToolPath(tool.slug, `/tools/resize/${tool.slug}`);
    const hreflangLinks = generateSitemapHreflangLinks(
      path,
      CATEGORY,
      getInteractiveToolLocales(tool.slug)
    ).join('\n');
    return `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${tool.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
${hreflangLinks}${
      tool.ogImage
        ? `
    <image:image>
      <image:loc>${tool.ogImage.startsWith('http') ? tool.ogImage : `${BASE_URL}${tool.ogImage}`}</image:loc>
      <image:title>${tool.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
