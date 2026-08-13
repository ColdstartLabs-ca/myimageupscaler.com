/**
 * Image Sitemap Route
 * Based on PRD-PSEO-04 Section 1.4: Image Sitemap Implementation
 */

import { NextResponse } from 'next/server';
import { getAllPSEOPages } from '@/lib/seo/data-loader';
import type { PSEOPage } from '@/lib/seo/pseo-types';
import { clientEnv } from '@shared/config/env';
import { filterEligibleSitemapEntries } from '@/lib/seo/page-eligibility';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

interface IImageEntry {
  pageUrl: string;
  images: Array<{
    loc: string;
    title: string;
    caption?: string;
  }>;
}

export async function GET() {
  const pages = await getAllPSEOPages();

  const imagePages = pages.filter(
    (page): page is PSEOPage =>
      'category' in page &&
      typeof page.category === 'string' &&
      !!page.ogImage &&
      (page as PSEOPage).category !== 'platforms'
  );
  const eligibleImagePages = filterEligibleSitemapEntries(
    imagePages,
    'images',
    'en',
    page => `/${page.category}/${page.slug}`,
    page => page.lastUpdated
  );
  const imageEntries: IImageEntry[] = eligibleImagePages.map(page => ({
    pageUrl: `${BASE_URL}/${page.category}/${page.slug}`,
    images: [
      {
        loc: page.ogImage!.startsWith('http') ? page.ogImage! : `${BASE_URL}${page.ogImage!}`,
        title: page.title,
      },
    ],
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${imageEntries
  .map(
    entry => `  <url>
    <loc>${entry.pageUrl}</loc>
${entry.images
  .map(
    img => `    <image:image>
      <image:loc>${img.loc}</image:loc>
      <image:title>${img.title}</image:title>${img.caption ? `\n      <image:caption>${img.caption}</image:caption>` : ''}
    </image:image>`
  )
  .join('\n')}
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
