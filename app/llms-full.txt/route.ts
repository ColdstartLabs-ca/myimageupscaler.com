/**
 * llms-full.txt Route
 *
 * Provides detailed information about the site for AI search engines.
 * This is the extended version with comprehensive content descriptions.
 */

import { NextResponse } from 'next/server';
import { clientEnv } from '@shared/config/env';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

const content = `# llms-full.txt
# Extended information about ${clientEnv.APP_NAME} for AI search engines.
# Learn more: https://llmstxt.org/

Title: ${clientEnv.APP_NAME}
Description: Free AI-powered image upscaler to upscale and enhance photos online. Upscale images up to 4x resolution with advanced AI technology. Upload your images and get high-quality upscaled results in seconds. No signup required for basic upscaling.
Version: 1.0.0
Author: ${clientEnv.APP_NAME} Team
Homepage: ${BASE_URL}
License: Proprietary

# Company Information
Company: ${clientEnv.APP_NAME}
Support: ${BASE_URL}/help
Contact: ${clientEnv.SUPPORT_EMAIL}
Privacy: ${BASE_URL}/privacy
Terms: ${BASE_URL}/terms

# Core Service
${clientEnv.APP_NAME} is a free online AI image upscaler that enhances photo resolution using advanced machine learning. Users can upscale images up to 4x the original size, improve quality, and convert between formats without complex software.

Key Benefits:
- No software installation required
- Works entirely in the browser
- Free upscaling with optional premium features
- Batch processing for multiple images
- Smart AI enhancement for various use cases

# Tool Categories

## Image Upscaling
- ${BASE_URL}/tools/ai-image-upscaler - AI image upscaling up to 4x
- ${BASE_URL}/tools/ai-photo-enhancer - Automatic photo enhancement
- ${BASE_URL}/scale/2x - 2x image upscaling
- ${BASE_URL}/scale/4x - 4x image upscaling

## Format Conversion
- ${BASE_URL}/formats - All format guides
- ${BASE_URL}/formats/png - PNG format guide
- ${BASE_URL}/formats/jpg - JPEG format guide
- ${BASE_URL}/formats/webp - WebP format guide
- ${BASE_URL}/tools/convert/png-to-jpg - PNG to JPG converter
- ${BASE_URL}/tools/convert/jpg-to-png - JPG to PNG converter

## Image Compression
- ${BASE_URL}/tools/compress/image-compressor - Image compressor tool
- ${BASE_URL}/tools/compress/bulk-image-compressor - Bulk image compression

## Image Resizing
- ${BASE_URL}/tools/resize/image-resizer - Image resizer
- ${BASE_URL}/tools/resize/bulk-image-resizer - Bulk image resizer

## Special Features
- ${BASE_URL}/ai-features - AI enhancement features
- ${BASE_URL}/ai-features/ai-noise-reduction-upscaler - Noise reduction
- ${BASE_URL}/ai-features/ai-sharpness-enhancement-upscaler - Sharpness enhancement
- ${BASE_URL}/ai-features/ai-face-enhancement-upscaler - Face enhancement
- ${BASE_URL}/tools/ai-background-remover - Background removal

## Free Tools
- ${BASE_URL}/free - All free tools
- ${BASE_URL}/free/ai-image-upscaler - Free AI upscaler
- ${BASE_URL}/free/image-compressor - Free compressor

## Comparison Tools
- ${BASE_URL}/compare - Tool comparisons
- ${BASE_URL}/compare/topshot-vs-${clientEnv.APP_NAME.toLowerCase()} - Topshot alternatives
- ${BASE_URL}/compare/lets-enhance-vs-${clientEnv.APP_NAME.toLowerCase()} - LetsEnhance alternatives

## Guides & Resources
- ${BASE_URL}/guides - Complete guide library
- ${BASE_URL}/how-it-works - How it works
- ${BASE_URL}/blog - Latest updates and tutorials

## Use Cases
- ${BASE_URL}/use-cases - All use cases
- ${BASE_URL}/use-cases/printing - Upscaling for print
- ${BASE_URL}/use-cases/social-media - Social media optimization
- ${BASE_URL}/use-cases/e-commerce - Product photography

# Content Types
Blog: ${BASE_URL}/blog
Topics covered include:
  - Image upscaling tutorials
  - Format guides (PNG, JPG, WebP, TIFF)
  - Photography tips
  - AI image enhancement techniques
  - Comparison articles

# API Information
REST API: ${BASE_URL}/api
Authentication: API key required for production use
Rate Limits: Varies by plan
Documentation: ${BASE_URL}/how-it-works

# Pricing
Free: Basic upscaling, limited credits
Premium: ${BASE_URL}/pricing
Plans: Monthly credit packs or subscription
Features: Batch processing, higher resolution, priority processing

# Localization
Supported Languages: en, es, pt, de, fr, it, ja
Structure: Locale-prefixed paths (e.g., /es/tools, /de/tools)
Default: English (no prefix)

# SEO Information
Sitemap: ${BASE_URL}/sitemap.xml
Robots: ${BASE_URL}/robots.txt
Canonicals: All pages include proper canonical tags
Hreflang: Full hreflang implementation for localized content

# Technical Details
Platform: Web-based, no download required
Processing: Client-side and server-side AI models
Formats: PNG, JPG, WebP, TIFF, BMP
Max Upload: Varies by plan
Output Quality: Up to 4x upscale, print-ready at 300 DPI

# Content Updates
Frequency: Weekly blog updates, monthly feature updates
LastUpdated: ${new Date().toISOString()}
`;

export async function GET() {
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
