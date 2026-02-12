/**
 * llms.txt Route
 *
 * Provides AI search engines with structured information about the site.
 * Based on the llms.txt standard: https://llmstxt.org/
 */

import { NextResponse } from 'next/server';
import { clientEnv } from '@shared/config/env';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

const content = `# llms.txt
# This file provides structured information about ${clientEnv.APP_NAME}
# for AI search engines like ChatGPT, Perplexity, Claude, and Google SGE.
# Learn more: https://llmstxt.org/

Title: ${clientEnv.APP_NAME}
Description: Free AI-powered image upscaler to upscale and enhance photos online. Upscale images up to 4x resolution with advanced AI technology. No signup required for basic upscaling.
Version: 1.0.0
Author: ${clientEnv.APP_NAME} Team
Homepage: ${BASE_URL}
License: Proprietary

# Featured Tools
Tools:
  - ${BASE_URL}/tools - Free AI image upscaler tools
  - ${BASE_URL}/tools/compress/image-compressor - Image compressor
  - ${BASE_URL}/tools/resize/image-resizer - Image resizer
  - ${BASE_URL}/tools/convert/png-to-jpg - PNG to JPG converter
  - ${BASE_URL}/pricing - Pricing plans

# Key Features
Features:
  - AI-powered upscaling up to 4x resolution
  - Batch processing for multiple images
  - Format conversion (PNG, JPG, WebP)
  - Image compression
  - Background removal
  - Smart enhancement for faces, portraits, and old photos

# API & Integration
API: ${BASE_URL}/api
Auth: Free tier available, no API key required for basic use

# Resources
Blog: ${BASE_URL}/blog
Help: ${BASE_URL}/help
Documentation: ${BASE_URL}/how-it-works

# Language Support
Languages: en, es, pt, de, fr, it, ja

# Last Updated
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
