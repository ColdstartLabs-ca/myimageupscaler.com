/**
 * Tools Sitemap Route
 * Based on PRD-PSEO-04 Section 1.3: Category Sitemap Implementation
 * Includes both static tools and interactive tools (resize, convert, compress)
 */

import { NextResponse } from 'next/server';
import { getAllTools } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import type { IToolPage, IPSEODataFile } from '@/lib/seo/pseo-types';

const BASE_URL = clientEnv.BASE_URL;

// Interactive tool URL mappings (slug -> path)
const INTERACTIVE_TOOL_PATHS: Record<string, string> = {
  // Resize tools
  'image-resizer': '/tools/resize/image-resizer',
  'resize-image-for-instagram': '/tools/resize/resize-image-for-instagram',
  'resize-image-for-youtube': '/tools/resize/resize-image-for-youtube',
  'resize-image-for-facebook': '/tools/resize/resize-image-for-facebook',
  'resize-image-for-twitter': '/tools/resize/resize-image-for-twitter',
  'resize-image-for-linkedin': '/tools/resize/resize-image-for-linkedin',
  // Convert tools
  'png-to-jpg': '/tools/convert/png-to-jpg',
  'jpg-to-png': '/tools/convert/jpg-to-png',
  'webp-to-jpg': '/tools/convert/webp-to-jpg',
  'webp-to-png': '/tools/convert/webp-to-png',
  'jpg-to-webp': '/tools/convert/jpg-to-webp',
  'png-to-webp': '/tools/convert/png-to-webp',
  // Compress tools
  'image-compressor': '/tools/compress/image-compressor',
};

export async function GET() {
  const staticTools = await getAllTools();
  const interactiveTools = (interactiveToolsData as IPSEODataFile<IToolPage>).pages;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE_URL}/tools</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
${staticTools
  .map(
    tool => `  <url>
    <loc>${BASE_URL}/tools/${tool.slug}</loc>
    <lastmod>${tool.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>${
      tool.ogImage
        ? `
    <image:image>
      <image:loc>${tool.ogImage}</image:loc>
      <image:title>${tool.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`
  )
  .join('\n')}
${interactiveTools
  .map(tool => {
    const path = INTERACTIVE_TOOL_PATHS[tool.slug] || `/tools/${tool.slug}`;
    return `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${tool.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>${
      tool.ogImage
        ? `
    <image:image>
      <image:loc>${tool.ogImage}</image:loc>
      <image:title>${tool.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
