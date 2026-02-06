/**
 * Robots.txt Configuration
 * Based on PRD-PSEO-04 Section 5.1: Robots.txt Implementation
 *
 * AI Crawler Policy: ALLOWED
 * - GPTBot, ChatGPT-User: Allowed (enables OpenAI inclusion in ChatGPT search)
 * - Google-Extended: Allowed (enables inclusion in Google SGE, AI Overviews, Gemini)
 *
 * Benefits:
 * - Content available for AI-powered search features
 * - Better visibility in ChatGPT, Google SGE, AI Overviews
 * - Increased organic traffic from AI search platforms
 */

import { MetadataRoute } from 'next';
import { clientEnv } from '@shared/config/env';

const BASE_URL = clientEnv.BASE_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/admin/',
          '/_next/',
          '/private/',
          '/*.json$',
          '/success',
          '/canceled',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
