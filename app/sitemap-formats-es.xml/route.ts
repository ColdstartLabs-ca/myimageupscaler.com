/**
 * Formats Sitemap Route - Spanish (es)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllFormats } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllFormats();
  return generateLocaleCategorySitemapResponse('es', 'formats', 'formats', pages, 0.8);
}
