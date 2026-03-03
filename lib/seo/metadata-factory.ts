/**
 * Metadata Factory Module
 * Based on PRD-PSEO-04 Section 3.2: Metadata Generation
 * Centralized factory for generating Next.js Metadata objects
 * Phase 5: Added hreflang alternates for multi-language SEO
 */

import { Metadata } from 'next';
import type { PSEOPage } from './pseo-types';
import type { PSEOCategory } from './url-utils';
import { clientEnv } from '@shared/config/env';
import {
  getCanonicalUrl,
  getOpenGraphLocale,
  generateHreflangAlternates,
} from './hreflang-generator';
import { enforceMetaLengths } from './meta-generator';
import type { Locale } from '../../i18n/config';

const BASE_URL = clientEnv.BASE_URL;
const APP_NAME = clientEnv.APP_NAME;
const TWITTER_HANDLE = clientEnv.TWITTER_HANDLE;

/**
 * Categories that are currently unproven / not submitted to Google.
 * Pages in these categories start with robots noindex.
 * Remove a category here once it achieves 70%+ indexation rate.
 */
export const NOINDEX_CATEGORIES: string[] = [
  // Orphan data files — no routes yet; leaving noindex as safety net if routes are added without review
  // 'technical-guides',
  // 'personas-expanded',
  // 'use-cases-expanded',
  // Currently empty — use this to gate new unproven categories at launch
];

/**
 * Generate complete Next.js Metadata object for pSEO pages
 * Includes all recommended meta tags, OpenGraph, Twitter, and robots config
 * Phase 5: Added hreflang alternates for multi-language SEO
 *
 * @param page - The pSEO page data
 * @param category - The page category
 * @param locale - The locale for this page instance (default: 'en')
 */
export function generateMetadata(
  page: PSEOPage,
  category: PSEOCategory,

  locale: Locale = 'en'
): Metadata {
  const path = `/${category}/${page.slug}`;
  const canonicalUrl = getCanonicalUrl(path, locale);
  const hreflangAlternates = generateHreflangAlternates(path, category);
  // Note: og:locale is rendered via SeoMetaTags component to avoid duplicates

  // Enforce SEO best practice length limits
  const { title: truncatedTitle, description: truncatedDescription } = enforceMetaLengths(
    page.metaTitle,
    page.metaDescription
  );

  // Default og:image for all pSEO pages if not provided
  const defaultOgImage = '/og-image.png';
  const ogImageUrl = page.ogImage || defaultOgImage;

  const shouldNoindex = page.noindex === true || NOINDEX_CATEGORIES.includes(category);

  return {
    title: truncatedTitle,
    description: truncatedDescription,

    // Open Graph
    // Note: locale is handled by SeoMetaTags component to avoid duplicates
    openGraph: {
      title: truncatedTitle,
      description: truncatedDescription,
      type: 'website',
      url: canonicalUrl,
      siteName: APP_NAME,
      locale: getOpenGraphLocale(locale),
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: page.title,
        },
      ],
    },

    // Twitter
    twitter: {
      card: 'summary_large_image',
      title: truncatedTitle,
      description: truncatedDescription,
      images: [ogImageUrl],
      creator: `@${TWITTER_HANDLE}`,
    },

    // Canonical + hreflang alternates for multi-language SEO
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates,
    },

    // Robots
    robots: {
      index: shouldNoindex ? false : true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },

    // Additional metadata
    authors: [{ name: APP_NAME, url: BASE_URL }],
    generator: 'Next.js',
    applicationName: APP_NAME,
    referrer: 'origin-when-cross-origin',
    keywords: page.secondaryKeywords?.join(', '),
    category: category,
    classification: 'Image Enhancement Tools',
  };
}

/**
 * Generate metadata for category hub pages
 * Phase 5: Added hreflang alternates for multi-language SEO
 *
 * @param category - The category
 * @param locale - The locale for this page instance (default: 'en')
 */
export function generateCategoryMetadata(category: PSEOCategory, locale: Locale = 'en'): Metadata {
  const path = `/${category}`;
  const canonicalUrl = getCanonicalUrl(path, locale);
  const ogLocale = getOpenGraphLocale(locale);
  const hreflangAlternates = generateHreflangAlternates(path, category);

  // Default og:image for category pages
  const defaultOgImage = '/og-image.png';

  const categoryTitles: Record<PSEOCategory, string> = {
    tools: `AI Image Tools | ${APP_NAME}`,
    formats: `Image Format Upscaling | ${APP_NAME}`,
    scale: `Image Resolution Enhancement | ${APP_NAME}`,
    'use-cases': `Industry Solutions | ${APP_NAME}`,
    compare: `AI Image Upscaler Comparisons 2026 | See Who Wins`,
    'comparisons-expanded': `Detailed Tool Comparisons | ${APP_NAME}`,
    alternatives: `Best Upscaler Alternatives | ${APP_NAME}`,
    guides: `Image Upscaling Guides & Tutorials | ${APP_NAME}`,
    'technical-guides': `Technical Image Enhancement Guides | ${APP_NAME}`,
    free: `Free AI Image Upscaler — 10 Free Credits | ${APP_NAME}`,
    'bulk-tools': `Bulk Image Tools | ${APP_NAME}`,
    platforms: `Platform-Specific Enhancement | ${APP_NAME}`,
    content: `Image Content & Assets | ${APP_NAME}`,
    'ai-features': `AI-Powered Image Features | ${APP_NAME}`,
    'device-use': `Device-Specific Enhancement | ${APP_NAME}`,
    'format-scale': `Format & Scale Tools | ${APP_NAME}`,
    'platform-format': `Platform & Format Tools | ${APP_NAME}`,
    'photo-restoration': `Free AI Photo Restoration — Restore Old & Damaged Photos`,
    'camera-raw': `Camera RAW Enhancement | ${APP_NAME}`,
    'industry-insights': `Industry Insights | ${APP_NAME}`,
    'device-optimization': `Device Optimization Tools | ${APP_NAME}`,
    'personas-expanded': `User Persona Solutions | ${APP_NAME}`,
    'use-cases-expanded': `Expanded Use Cases | ${APP_NAME}`,
  };

  const categoryDescriptions: Record<PSEOCategory, string> = {
    tools:
      'Discover our suite of AI-powered image tools including upscalers, enhancers, and restoration tools. Professional results in seconds.',
    formats:
      'Format-specific upscaling solutions for all your image file types. Preserve quality while enhancing JPEG, PNG, WebP, and more.',
    scale:
      'Resolution and scale-specific upscaling options. Enhance images to 4K, 8K, or custom resolutions with AI technology.',
    'use-cases': `Industry-specific image enhancement solutions for e-commerce, real estate, photography, and more. See how ${APP_NAME} fits your workflow.`,
    compare: `Side-by-side comparisons of top AI upscalers. See how ${APP_NAME} stacks up against Topaz, Remini, Let's Enhance, and more. Try free.`,
    'comparisons-expanded': `Detailed comparisons of ${APP_NAME} with leading image upscaling tools. In-depth analysis of features, performance, pricing, and use cases.`,
    alternatives:
      'Find the best alternatives to popular upscaling tools. Compare features, pricing, and capabilities to make the right choice.',
    guides:
      'Step-by-step guides on AI upscaling, format conversion, and image enhancement. Tutorials for photographers, designers, and creators.',
    'technical-guides':
      'Comprehensive technical guides for image processing, optimization, and enhancement. Expert-level insights and best practices.',
    free: 'Free AI image upscaler and enhancer. Start with 10 free credits — no credit card required. Upscale, enhance, and remove backgrounds instantly.',
    'bulk-tools':
      'Batch process multiple images at once. Bulk resize, compress, and optimize images with our free browser-based tools.',
    platforms:
      'Enhance images from your favorite AI platforms. Upscale Midjourney, Stable Diffusion, DALL-E exports and more.',
    content: `Comprehensive image content and asset library. Tutorials, examples, and resources for image enhancement at ${APP_NAME}.`,
    'ai-features': `Advanced AI-powered features for intelligent image enhancement. Automation, smart detection, and professional results.`,
    'device-use':
      'Device-specific image enhancement solutions. Mobile, tablet, and desktop optimized tools for any workflow.',
    'format-scale':
      'Combined format and scale enhancement. Resize images to specific dimensions while converting formats.',
    'platform-format':
      'Platform and format combinations. Export from AI platforms like Midjourney and Stable Diffusion in your preferred image format with optimized quality.',
    'photo-restoration': `Repair scratches, fading, and damage in old photos with AI. Free photo restoration online — no software, no signup needed. Bring memories back.`,
    'camera-raw': `Camera RAW image processing and enhancement for professional photographers. Support for all major camera brands.`,
    'industry-insights': `Industry-specific insights and solutions for image enhancement. See how AI is transforming different industries.`,
    'device-optimization': `Device optimization tools for better image performance. Optimize images for mobile, desktop, and various platforms.`,
    'personas-expanded': `Image enhancement solutions tailored for different user types. Find the perfect tools and workflows for your specific role and needs.`,
    'use-cases-expanded': `Expanded use cases for image enhancement across various scenarios and industries. Discover how ${APP_NAME} can help.`,
  };

  return {
    title: categoryTitles[category],
    description: categoryDescriptions[category],

    openGraph: {
      title: categoryTitles[category],
      description: categoryDescriptions[category],
      type: 'website',
      url: canonicalUrl,
      siteName: APP_NAME,
      locale: ogLocale,
      images: [
        {
          url: defaultOgImage,
          width: 1200,
          height: 630,
          alt: categoryTitles[category],
        },
      ],
    },

    twitter: {
      card: 'summary_large_image',
      title: categoryTitles[category],
      description: categoryDescriptions[category],
      images: [defaultOgImage],
      creator: `@${TWITTER_HANDLE}`,
    },

    // Canonical + hreflang alternates for multi-language SEO
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates,
    },

    robots: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },

    authors: [{ name: APP_NAME, url: BASE_URL }],
    generator: 'Next.js',
    applicationName: APP_NAME,
    category: category,
  };
}
