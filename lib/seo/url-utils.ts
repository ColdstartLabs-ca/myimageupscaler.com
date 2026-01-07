/**
 * URL Utilities for pSEO
 * Based on PRD-PSEO-02 Section 7: SEO URL Optimization
 */

import { clientEnv } from '@shared/config/env';

const BASE_URL = clientEnv.BASE_URL;
const APP_NAME = clientEnv.APP_NAME;

/**
 * Generate canonical URL for a page
 */
export function generateCanonicalUrl(category: string, slug: string): string {
  return `${BASE_URL}/${category}/${slug}`;
}

/**
 * Generate category hub URL
 */
export function generateCategoryUrl(category: string): string {
  return `${BASE_URL}/${category}`;
}

/**
 * Validate slug format
 * Only lowercase letters, numbers, and hyphens
 * Max 60 characters
 */
export function validateSlug(slug: string): boolean {
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length <= 60;
}

/**
 * Generate URL-safe slug from title
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Multiple hyphens to single
    .replace(/^-|-$/g, '') // Trim hyphens
    .slice(0, 60); // Max length
}

/**
 * pSEO category definitions
 */
export const PSEO_CATEGORIES = [
  'tools',
  'formats',
  'scale',
  'use-cases',
  'compare',
  'alternatives',
  'guides',
  'free',
  'bulk-tools',
  'platforms',
  'content',
  'ai-features',
] as const;

export type PSEOCategory = (typeof PSEO_CATEGORIES)[number];

/**
 * Validate if a category is valid
 */
export function isValidCategory(category: string): category is PSEOCategory {
  return PSEO_CATEGORIES.includes(category as PSEOCategory);
}

/**
 * Get category display name
 */
export function getCategoryDisplayName(category: PSEOCategory): string {
  const names: Record<PSEOCategory, string> = {
    tools: 'Tools',
    formats: 'Formats',
    scale: 'Scale & Resolution',
    'use-cases': 'Use Cases',
    compare: 'Comparisons',
    alternatives: 'Alternatives',
    guides: 'Guides',
    free: 'Free Tools',
    'bulk-tools': 'Bulk Tools',
    platforms: 'Platform Integration',
    content: 'Content Types',
    'ai-features': 'AI Features',
  };
  return names[category];
}

/**
 * Get category description
 */
export function getCategoryDescription(category: PSEOCategory): string {
  const descriptions: Record<PSEOCategory, string> = {
    tools: 'Professional AI-powered image enhancement tools',
    formats: 'Format-specific upscaling solutions for all your image file types',
    scale: 'Resolution and scale-specific upscaling options',
    'use-cases': 'Industry-specific image enhancement solutions',
    compare: `Compare ${APP_NAME} with other image upscaling tools`,
    alternatives: 'Find the best alternatives to popular upscaling tools',
    guides: 'Learn how to get the most out of your images',
    free: 'Free AI image tools - no credit card required',
    'bulk-tools': 'Batch process multiple images at once - resize, compress, and optimize',
    platforms: `Enhance images from your favorite platforms - Midjourney, Stable Diffusion, DALL-E, and more`,
    content: 'Upscale specific content types - family photos, digital art, logos, anime, and more',
    'ai-features': 'Advanced AI features - face restoration, portrait enhancement, noise reduction, and more',
  };
  return descriptions[category];
}
