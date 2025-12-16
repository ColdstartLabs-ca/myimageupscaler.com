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
      siteName: 'PixelPerfect',
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
      creator: '@pixelperfect',
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
    authors: [{ name: 'PixelPerfect', url: BASE_URL }],
    generator: 'Next.js',
    applicationName: 'PixelPerfect',
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
    tools: 'AI Image Tools - Upscaler, Enhancer & More | PixelPerfect',
    formats: 'Image Format Upscaling - JPEG, PNG, WebP & More | PixelPerfect',
    scale: 'Image Resolution Enhancement - 4K, 8K Upscaling | PixelPerfect',
    'use-cases': 'Industry Solutions - E-commerce, Real Estate & More | PixelPerfect',
    compare: 'Compare Image Upscaling Tools | PixelPerfect',
    alternatives: 'Best Upscaler Alternatives & Comparisons | PixelPerfect',
    guides: 'Image Enhancement Guides & Tutorials | PixelPerfect',
    free: 'Free AI Image Tools - No Sign-Up Required | PixelPerfect',
  };

  const categoryDescriptions: Record<PSEOCategory, string> = {
    tools:
      'Discover our suite of AI-powered image tools including upscalers, enhancers, and restoration tools. Professional results in seconds.',
    formats:
      'Format-specific upscaling solutions for all your image file types. Preserve quality while enhancing JPEG, PNG, WebP, and more.',
    scale:
      'Resolution and scale-specific upscaling options. Enhance images to 4K, 8K, or custom resolutions with AI technology.',
    'use-cases':
      'Industry-specific image enhancement solutions for e-commerce, real estate, photography, and more. See how PixelPerfect fits your workflow.',
    compare:
      'Compare PixelPerfect with other image upscaling tools. See features, pricing, and performance side-by-side.',
    alternatives:
      'Find the best alternatives to popular upscaling tools. Compare features, pricing, and capabilities to make the right choice.',
    guides:
      'Learn how to get the most out of your images with step-by-step guides and tutorials. Expert tips and best practices included.',
    free: 'Free AI image tools with no credit card or sign-up required. Professional quality enhancement at no cost.',
  };

  return {
    title: categoryTitles[category],
    description: categoryDescriptions[category],

    openGraph: {
      title: categoryTitles[category],
      description: categoryDescriptions[category],
      type: 'website',
      url: canonicalUrl,
      siteName: 'PixelPerfect',
      locale: 'en_US',
    },

    twitter: {
      card: 'summary_large_image',
      title: categoryTitles[category],
      description: categoryDescriptions[category],
      creator: '@pixelperfect',
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

    authors: [{ name: 'PixelPerfect', url: BASE_URL }],
    generator: 'Next.js',
    applicationName: 'PixelPerfect',
    category: category,
  };
}
