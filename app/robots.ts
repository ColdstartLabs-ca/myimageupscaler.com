/**
 * Robots.txt Configuration
 * Based on PRD-PSEO-04 Section 5.1: Robots.txt Implementation
 *
 * AI Crawler Policy: EXPLICITLY ALLOWED
 * Named AI bot rules ensure unambiguous permission signals for AEO/GEO visibility.
 * - GPTBot, ChatGPT-User: OpenAI / ChatGPT search
 * - Google-Extended: Google SGE, AI Overviews, Gemini
 * - ClaudeBot, anthropic-ai: Anthropic / Claude
 * - PerplexityBot: Perplexity AI search
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
      // AI Search Engine Bots — explicitly allowed for AEO/GEO visibility
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
      },
      {
        userAgent: 'anthropic-ai',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
