/**
 * Blog Sitemap Route
 * Contains all blog posts from content/blog directory
 */

import { NextResponse } from 'next/server';
import { getAllPosts } from '@server/blog';
import { clientEnv } from '@shared/config/env';
import { generateSitemapHreflangLinks } from '@/lib/seo/sitemap-generator';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

/**
 * Blog posts that return 404 and should be excluded from sitemap
 * These posts exist in blog-data.json but the routes don't work
 */
const BLOCKED_BLOG_SLUGS = new Set([
  'dalle-3-image-enhancement-guide',
  'stable-diffusion-upscaling-complete-guide',
  'restore-old-photos-ai-enhancement-guide',
  'image-resolution-for-printing-complete-guide',
  'real-estate-photo-enhancement-guide',
  'why-upscaled-text-looks-blurry-how-to-fix',
  'fix-blurry-photos-ai-methods-guide',
  'heic-iphone-photo-upscaling-guide',
  'screenshot-upscaling-rescue-low-resolution-captures',
  'how-ai-image-upscaling-works-guide',
  'keep-text-sharp-when-upscaling-product-photos',
  'upscale-product-photos-amazon-etsy-guide',
  'social-media-image-sizes-guide-2025',
  'upscale-midjourney-images-4k-8k-print-guide',
  'anime-upscaling-4k-art-guide',
  'ai-image-enhancement-ecommerce-guide',
  'how-ai-image-upscaling-works-explained',
]);

/**
 * Escape special XML characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const allPosts = getAllPosts();
  const posts = allPosts.filter(post => !BLOCKED_BLOG_SLUGS.has(post.slug));

  // Generate hreflang links for /blog page
  const blogHreflangLinks = generateSitemapHreflangLinks('/blog').join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE_URL}/blog</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
${blogHreflangLinks}
  </url>
${posts
  .map(
    post => `  <url>
    <loc>${BASE_URL}/blog/${post.slug}</loc>
    <lastmod>${new Date(post.date).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>${
      post.image
        ? `
    <image:image>
      <image:loc>${escapeXml(post.image.startsWith('http') ? post.image : `${BASE_URL}${post.image}`)}</image:loc>
      <image:title>${escapeXml(post.title)}</image:title>
    </image:image>`
        : ''
    }
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
