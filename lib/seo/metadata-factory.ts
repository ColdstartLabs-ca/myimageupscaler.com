/**
 * Metadata Factory Module
 * Based on PRD-PSEO-04 Section 3.2: Metadata Generation
 * Centralized factory for generating Next.js Metadata objects
 */

import { Metadata } from 'next';
import type { PSEOPage } from './pseo-types';
import type { PSEOCategory } from './url-utils';
import { clientEnv } from '@shared/config/env';

const BASE_URL = clientEnv.BASE_URL;
const APP_NAME = clientEnv.APP_NAME;
const TWITTER_HANDLE = clientEnv.TWITTER_HANDLE;

/**
 * Generate complete Next.js Metadata object for pSEO pages
 * Includes all recommended meta tags, OpenGraph, Twitter, and robots config
 */
export function generateMetadata(page: PSEOPage, category: PSEOCategory): Metadata {
  const canonicalUrl = `${BASE_URL}/${category}/${page.slug}`;

  return {
    title: page.metaTitle,
    description: page.metaDescription,

    // Open Graph
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      type: 'website',
      url: canonicalUrl,
      siteName: APP_NAME,
      locale: 'en_US',
      ...(page.ogImage && {
        images: [
          {
            url: page.ogImage,
            width: 1200,
            height: 630,
            alt: page.title,
          },
        ],
      }),
    },

    // Twitter
    twitter: {
      card: 'summary_large_image',
      title: page.metaTitle,
      description: page.metaDescription,
      ...(page.ogImage && { images: [page.ogImage] }),
      creator: `@${TWITTER_HANDLE}`,
    },

    // Canonical & Alternates
    alternates: {
      canonical: canonicalUrl,
    },

    // Robots
    robots: {
      index: true,
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
 */
export function generateCategoryMetadata(category: PSEOCategory): Metadata {
  const canonicalUrl = `${BASE_URL}/${category}`;

  const categoryTitles: Record<PSEOCategory, string> = {
    tools: `AI Image Tools - Upscaler, Enhancer & More | ${APP_NAME}`,
    formats: `Image Format Upscaling - JPEG, PNG, WebP & More | ${APP_NAME}`,
    scale: `Image Resolution Enhancement - 4K, 8K Upscaling | ${APP_NAME}`,
    'use-cases': `Industry Solutions - E-commerce, Real Estate & More | ${APP_NAME}`,
    compare: `Compare Image Upscaling Tools | ${APP_NAME}`,
    alternatives: `Best Upscaler Alternatives & Comparisons | ${APP_NAME}`,
    guides: `Image Enhancement Guides & Tutorials | ${APP_NAME}`,
    free: `Free AI Image Tools - No Sign-Up Required | ${APP_NAME}`,
    'bulk-tools': `Bulk Image Tools - Resize, Compress Multiple Images | ${APP_NAME}`,
    platforms: `Platform-Specific Image Enhancement | ${APP_NAME}`,
    content: `Image Content & Assets | ${APP_NAME}`,
    'ai-features': `AI-Powered Image Features | ${APP_NAME}`,
    'device-use': `Device-Specific Image Enhancement | ${APP_NAME}`,
    'format-scale': `Format & Scale Enhancement Tools | ${APP_NAME}`,
    'platform-format': `Platform & Format Tools | ${APP_NAME}`,
  };

  const categoryDescriptions: Record<PSEOCategory, string> = {
    tools:
      'Discover our suite of AI-powered image tools including upscalers, enhancers, and restoration tools. Professional results in seconds.',
    formats:
      'Format-specific upscaling solutions for all your image file types. Preserve quality while enhancing JPEG, PNG, WebP, and more.',
    scale:
      'Resolution and scale-specific upscaling options. Enhance images to 4K, 8K, or custom resolutions with AI technology.',
    'use-cases': `Industry-specific image enhancement solutions for e-commerce, real estate, photography, and more. See how ${APP_NAME} fits your workflow.`,
    compare: `Compare ${APP_NAME} with other image upscaling tools. See features, pricing, and performance side-by-side.`,
    alternatives:
      'Find the best alternatives to popular upscaling tools. Compare features, pricing, and capabilities to make the right choice.',
    guides:
      'Learn how to get the most out of your images with step-by-step guides and tutorials. Expert tips and best practices included.',
    free: 'Free AI image tools with no credit card or sign-up required. Professional quality enhancement at no cost.',
    'bulk-tools':
      'Batch process multiple images at once. Bulk resize, compress, and optimize images with our free browser-based tools.',
    platforms:
      'Enhance images from your favorite AI platforms. Upscale Midjourney, Stable Diffusion, DALL-E exports and more.',
    content: `Comprehensive image content and asset library. Tutorials, examples, and resources for image enhancement at ${APP_NAME}.`,
    'ai-features': `Advanced AI-powered features for intelligent image enhancement. Automation, smart detection, and professional results.`,
    'device-use': 'Device-specific image enhancement solutions. Mobile, tablet, and desktop optimized tools for any workflow.',
    'format-scale': 'Combined format and scale enhancement. Resize images to specific dimensions while converting formats.',
    'platform-format': 'Platform and format combinations. Export from AI platforms in your preferred image format.',
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
      locale: 'en_US',
    },

    twitter: {
      card: 'summary_large_image',
      title: categoryTitles[category],
      description: categoryDescriptions[category],
      creator: `@${TWITTER_HANDLE}`,
    },

    alternates: {
      canonical: canonicalUrl,
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
