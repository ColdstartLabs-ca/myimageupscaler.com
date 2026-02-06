/**
 * Device × Use Case Sitemap Route - Japanese (ja)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllDeviceUse } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllDeviceUse();
  return generateLocaleCategorySitemapResponse('ja', 'device-use', 'device-use', pages, 0.8);
}
