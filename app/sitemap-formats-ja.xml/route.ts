/**
 * Formats Sitemap Route - Japanese (ja)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllFormats } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllFormats();
  return generateLocaleCategorySitemapResponse('ja', 'formats', 'formats', pages, 0.8);
}
