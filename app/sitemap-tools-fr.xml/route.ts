/**
 * Tools Sitemap Route - French (fr)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 * Includes both static tools and interactive tools (resize, convert, compress)
 */

import { getAllTools } from '@/lib/seo/data-loader';
import {
  generateLocaleCategorySitemapResponse,
  buildToolsSitemapPages,
} from '@/lib/seo/locale-sitemap-handler';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import socialMediaResizeData from '@/app/seo/data/social-media-resize.json';
import type { IToolPage, IPSEODataFile } from '@/lib/seo/pseo-types';

export async function GET() {
  const staticTools = await getAllTools();
  const interactiveTools = (interactiveToolsData as IPSEODataFile<IToolPage>).pages;
  const socialResizeTools = (
    socialMediaResizeData as unknown as IPSEODataFile<IToolPage>
  ).pages;
  const pages = buildToolsSitemapPages(staticTools, interactiveTools, socialResizeTools);
  return generateLocaleCategorySitemapResponse('fr', 'tools', 'tools', pages, 0.9);
}
