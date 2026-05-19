/**
 * Blog posts that should be excluded from sitemaps.
 * Shared between blog-sitemap and 3-kings scoring to maintain a single source of truth.
 */
export const BLOCKED_BLOG_SLUGS = new Set([
  // SEO CTR cannibalization — redirected to canonical targets
  'photo-enhancement-upscaling-vs-quality',
  'best-free-ai-image-upscaler-tools-2026',
  'restore-old-photos-online',
  'free-upscaler-no-sign-up',
  'upscale-image-online-free',
  'ai-vs-traditional-image-upscaling',
]);
