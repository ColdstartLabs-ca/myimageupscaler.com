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
  'comparisons-expanded',
  'alternatives',
  'guides',
  'technical-guides',
  'free',
  'bulk-tools',
  'platforms',
  'content',
  'ai-features',
  'device-use',
  'format-scale',
  'platform-format',
  'photo-restoration',
  'camera-raw',
  'industry-insights',
  'device-optimization',
  'personas-expanded',
  'use-cases-expanded',
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
    'comparisons-expanded': 'Detailed Comparisons',
    alternatives: 'Alternatives',
    guides: 'Guides',
    'technical-guides': 'Technical Guides',
    free: 'Free Tools',
    'bulk-tools': 'Bulk Tools',
    platforms: 'Platform Integration',
    content: 'Content Types',
    'ai-features': 'AI Features',
    'device-use': 'Device Use',
    'format-scale': 'Format & Scale',
    'platform-format': 'Platform & Format',
    'photo-restoration': 'Photo Restoration',
    'camera-raw': 'Camera RAW',
    'industry-insights': 'Industry Insights',
    'device-optimization': 'Device Optimization',
    'personas-expanded': 'User Personas',
    'use-cases-expanded': 'Expanded Use Cases',
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
    'comparisons-expanded': `Detailed comparisons of ${APP_NAME} with other image upscaling tools`,
    alternatives: 'Find the best alternatives to popular upscaling tools',
    guides: 'Learn how to get the most out of your images',
    'technical-guides': 'In-depth technical guides for image processing and optimization',
    free: 'Free AI image tools - no credit card required',
    'bulk-tools': 'Batch process multiple images at once - resize, compress, and optimize',
    platforms: `Enhance images from your favorite platforms - Midjourney, Stable Diffusion, DALL-E, and more`,
    content: 'Upscale specific content types - family photos, digital art, logos, anime, and more',
    'ai-features':
      'Advanced AI features - face restoration, portrait enhancement, noise reduction, and more',
    'device-use':
      'Device-specific image enhancement solutions for mobile, tablet, and desktop workflows',
    'format-scale': 'Combined format conversion and scaling - resize and convert in one step',
    'platform-format': 'Export from AI platforms in your preferred format and dimensions',
    'photo-restoration':
      'Restore and repair old, faded, or damaged photos with AI-powered technology',
    'camera-raw': 'Enhance Camera RAW files from major camera brands with AI upscaling',
    'industry-insights': 'Industry-specific image enhancement solutions for professional workflows',
    'device-optimization':
      'Optimize images for specific devices and platforms for best performance',
    'personas-expanded': 'Image enhancement solutions tailored for different user types and professions',
    'use-cases-expanded': 'Expanded use cases for image enhancement across various scenarios',
  };
  return descriptions[category];
}
