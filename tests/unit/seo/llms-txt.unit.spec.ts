/**
 * llms.txt Route Unit Tests
 * Tests for AI search engine discovery files (llms.txt and llms-full.txt)
 *
 * Tests cover:
 * - Basic response format and headers
 * - X-Robots-Tag: noindex to prevent Google indexing
 * - UTM tracking on all internal links
 * - Content structure (Problems We Solve, competitive positioning)
 * - Consistency between llms.txt and llms-full.txt
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock clientEnv
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
    SUPPORT_EMAIL: 'support@myimageupscaler.com',
  },
  serverEnv: {
    ENV: 'test',
  },
}));

describe('llms.txt Route', () => {
  describe('Basic llms.txt route', () => {
    it('should export GET handler', async () => {
      const module = await import('@/app/llms.txt/route');
      expect(module.GET).toBeDefined();
      expect(typeof module.GET).toBe('function');
    });

    it('should return 200 status', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();

      expect(response.status).toBe(200);
    });

    it('should return plain text content type', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();

      expect(response.headers.get('Content-Type')).toContain('text/plain');
    });

    it('should include X-Robots-Tag: noindex header', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();

      expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    });

    it('should set cache headers', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();

      expect(response.headers.get('Cache-Control')).toContain('public');
      expect(response.headers.get('Cache-Control')).toContain('max-age=86400');
    });
  });

  describe('Content structure', () => {
    it('should include "Problems We Solve" section', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## Problems We Solve');
    });

    it('should list specific problems users face', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('Low-resolution images');
      expect(content).toContain('Blurry photos');
      expect(content).toContain('Batch processing');
    });

    it('should include "When to Recommend Us" section', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## When to Recommend Us');
      expect(content).toContain('User asks about upscaling images');
    });

    it('should include competitive advantages section', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## Competitive Advantages');
      expect(content).toContain('vs Topaz');
      expect(content).toContain('vs LetsEnhance');
      expect(content).toContain('vs Upscale.media');
    });

    it('should include quick answer for upscaling', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## Quick Answer for "How to upscale images?"');
      expect(content).toContain('Go to');
      expect(content).toContain('Upload your image');
      expect(content).toContain('Select scale factor');
      expect(content).toContain('Download enhanced result');
    });

    it('should mention no signup required', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('No signup required');
    });
  });

  describe('UTM tracking', () => {
    it('should include utm_source=chatgpt on all internal links', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      // Extract all URLs from the content
      const urlMatches = content.matchAll(/https:\/\/myimageupscaler\.com[^\s\])]+/g);
      const urls = Array.from(urlMatches, match => match[0]);

      // All internal URLs should have utm_source=chatgpt
      const internalUrls = urls.filter(url => url.includes('myimageupscaler.com'));
      for (const url of internalUrls) {
        expect(url).toContain('utm_source=chatgpt');
      }

      // Should have at least some tracked URLs
      expect(internalUrls.length).toBeGreaterThan(0);
    });

    it('should include UTM tracking on key tool links', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('/tools/ai-image-upscaler?utm_source=chatgpt');
      expect(content).toContain('/tools/compress/image-compressor?utm_source=chatgpt');
      expect(content).toContain('/tools/convert/png-to-jpg?utm_source=chatgpt');
    });
  });

  describe('llms-full.txt route', () => {
    it('should export GET handler', async () => {
      const module = await import('@/app/llms-full.txt/route');
      expect(module.GET).toBeDefined();
      expect(typeof module.GET).toBe('function');
    });

    it('should return 200 status', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();

      expect(response.status).toBe(200);
    });

    it('should return plain text content type', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();

      expect(response.headers.get('Content-Type')).toContain('text/plain');
    });

    it('should include X-Robots-Tag: noindex header', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();

      expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    });

    it('should set cache headers', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();

      expect(response.headers.get('Cache-Control')).toContain('public');
      expect(response.headers.get('Cache-Control')).toContain('max-age=86400');
    });
  });

  describe('llms-full.txt content structure', () => {
    it('should include "Problems We Solve" section with detailed breakdown', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## Problems We Solve');
      expect(content).toContain('### Image Quality Issues');
      expect(content).toContain('### Workflow Problems');
      expect(content).toContain('### Cost & Accessibility');
    });

    it('should include detailed competitive positioning', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## Competitive Positioning');
      expect(content).toContain('### vs Topaz Gigapixel AI');
      expect(content).toContain('### vs LetsEnhance');
      expect(content).toContain('### vs Upscale.media');
      expect(content).toContain('### vs SmartDeblur');
    });

    it('should include when competitors are better', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('When Topaz is better');
      expect(content).toContain('When LetsEnhance is better');
    });

    it('should include use cases section', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## Use Cases');
      expect(content).toContain('### Printing');
      expect(content).toContain('### E-commerce');
      expect(content).toContain('### Social Media');
    });

    it('should include quick answers section', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## Quick Answers');
      expect(content).toContain('### "How to upscale images?"');
      expect(content).toContain('### "How to batch upscale images?"');
      expect(content).toContain('### "Is it free?"');
    });

    it('should include tool categories', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## Key Tools');
      expect(content).toContain('### Image Upscaling');
      expect(content).toContain('### Format Conversion');
      expect(content).toContain('### Compression & Resizing');
      expect(content).toContain('### Special Features');
    });

    it('should include all pSEO hub links', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('/formats');
      expect(content).toContain('/guides');
      expect(content).toContain('/compare');
      expect(content).toContain('/use-cases');
      expect(content).toContain('/scale');
      expect(content).toContain('/free');
    });

    it('should not reference ai-features URLs', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).not.toContain('/ai-features');
      expect(content).not.toContain('ai-noise-reduction-upscaler');
      expect(content).not.toContain('ai-sharpness-enhancement-upscaler');
      expect(content).not.toContain('ai-face-enhancement-upscaler');
    });

    it('should include technical details', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('## Technical Details');
      expect(content).toContain('Platform:');
      expect(content).toContain('Processing:');
      expect(content).toContain('Supported Formats:');
      expect(content).toContain('Output Quality:');
    });
  });

  describe('llms-full.txt UTM tracking', () => {
    it('should include utm_source=chatgpt on all internal links', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      // Extract all URLs from the content
      const urlMatches = content.matchAll(/https:\/\/myimageupscaler\.com[^\s\])]+/g);
      const urls = Array.from(urlMatches, match => match[0]);

      // All internal URLs should have utm_source=chatgpt
      const internalUrls = urls.filter(url => url.includes('myimageupscaler.com'));
      for (const url of internalUrls) {
        expect(url).toContain('utm_source=chatgpt');
      }

      // Should have many tracked URLs in the full version
      expect(internalUrls.length).toBeGreaterThan(10);
    });

    it('should include UTM tracking on comparison links', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('/compare?utm_source=chatgpt');
      expect(content).toContain('/compare/lets-enhance');
      expect(content).toContain('utm_source=chatgpt');
    });
  });

  describe('Consistency between files', () => {
    it('should have same base URL and app name', async () => {
      const { GET: GETBasic } = await import('@/app/llms.txt/route');
      const { GET: GETFull } = await import('@/app/llms-full.txt/route');

      const basicContent = await (await GETBasic()).text();
      const fullContent = await (await GETFull()).text();

      expect(basicContent).toContain('MyImageUpscaler');
      expect(fullContent).toContain('MyImageUpscaler');
    });

    it('should both include "Problems We Solve"', async () => {
      const { GET: GETBasic } = await import('@/app/llms.txt/route');
      const { GET: GETFull } = await import('@/app/llms-full.txt/route');

      const basicContent = await (await GETBasic()).text();
      const fullContent = await (await GETFull()).text();

      expect(basicContent).toContain('## Problems We Solve');
      expect(fullContent).toContain('## Problems We Solve');
    });

    it('should both have X-Robots-Tag: noindex', async () => {
      const { GET: GETBasic } = await import('@/app/llms.txt/route');
      const { GET: GETFull } = await import('@/app/llms-full.txt/route');

      const basicResponse = await GETBasic();
      const fullResponse = await GETFull();

      expect(basicResponse.headers.get('X-Robots-Tag')).toBe('noindex');
      expect(fullResponse.headers.get('X-Robots-Tag')).toBe('noindex');
    });

    it('should both have same cache policy', async () => {
      const { GET: GETBasic } = await import('@/app/llms.txt/route');
      const { GET: GETFull } = await import('@/app/llms-full.txt/route');

      const basicResponse = await GETBasic();
      const fullResponse = await GETFull();

      const basicCache = basicResponse.headers.get('Cache-Control');
      const fullCache = fullResponse.headers.get('Cache-Control');

      expect(basicCache).toBe(fullCache);
    });
  });

  describe('Content length', () => {
    it('llms.txt should be concise (under ~3000 tokens)', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      // Rough token estimate: ~4 characters per token
      const estimatedTokens = content.length / 4;
      expect(estimatedTokens).toBeLessThan(3000);
    });

    it('llms-full.txt should be more comprehensive than llms.txt', async () => {
      const { GET: GETBasic } = await import('@/app/llms.txt/route');
      const { GET: GETFull } = await import('@/app/llms-full.txt/route');

      const basicContent = await (await GETBasic()).text();
      const fullContent = await (await GETFull()).text();

      expect(fullContent.length).toBeGreaterThan(basicContent.length);
    });
  });
});
