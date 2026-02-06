/**
 * Free Tools Sitemap Route - Japanese (ja)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllFreeTools } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllFreeTools();
  return generateLocaleCategorySitemapResponse('ja', 'free', 'free', pages, 0.85);
}
