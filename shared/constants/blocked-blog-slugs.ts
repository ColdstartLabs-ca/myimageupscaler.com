/**
 * Blog posts that return 404 and should be excluded from sitemaps.
 * Shared between blog-sitemap and 3-kings scoring to maintain a single source of truth.
 */
export const BLOCKED_BLOG_SLUGS = new Set([
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
  // SEO CTR cannibalization — redirected to canonical targets
  'photo-enhancement-upscaling-vs-quality',
  'best-free-ai-image-upscaler-tools-2026',
  'restore-old-photos-online',
]);
