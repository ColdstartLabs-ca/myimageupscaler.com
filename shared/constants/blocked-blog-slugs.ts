/**
 * Blog posts that should be excluded from sitemaps and list surfaces.
 * Shared between blog-sitemap, blog lists and 3-kings scoring to maintain a
 * single source of truth.
 */
import consolidation from './blog-consolidation.json';

const CONSOLIDATED_REDIRECT_SLUGS = Object.keys(consolidation.redirects);
const CONSOLIDATED_NOINDEX_SLUGS = consolidation.noindex;
const NOINDEX_BLOG_SLUGS = new Set(CONSOLIDATED_NOINDEX_SLUGS);

export const BLOCKED_BLOG_SLUGS = new Set([
  // SEO CTR cannibalization — redirected to canonical targets
  'photo-enhancement-upscaling-vs-quality',
  'best-free-ai-image-upscaler-tools-2026',
  'restore-old-photos-online',
  'free-upscaler-no-sign-up',
  'upscale-image-online-free',
  'ai-vs-traditional-image-upscaling',
  'how-ai-image-upscaling-works-explained',
  // Redirected in next.config.js redirects() (blog cannibalization consolidation)
  'best-ai-image-quality-enhancer',
  'best-image-upscaling-tools-2026',
  // 2026-11-21 index-bloat consolidation (PRD-TR-2026-11-02 Phase 2)
  ...CONSOLIDATED_REDIRECT_SLUGS,
  ...CONSOLIDATED_NOINDEX_SLUGS,
]);

/** True when a rendered post must serve robots.index = false. */
export function isNoindexBlogSlug(slug: string): boolean {
  return NOINDEX_BLOG_SLUGS.has(slug);
}
