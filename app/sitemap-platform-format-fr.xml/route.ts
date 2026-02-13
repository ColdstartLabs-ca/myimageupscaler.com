/**
 * Platform × Format Sitemap Route - French (fr)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllPlatformFormat } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllPlatformFormat();
  return generateLocaleCategorySitemapResponse(
    'fr',
    'platform-format',
    'platform-format',
    pages,
    0.8
  );
}
