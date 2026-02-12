/**
 * llms.txt Route Unit Tests
 * Tests for AI search engine discovery files (llms.txt and llms-full.txt)
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

    it('should return plain text content type', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();

      expect(response.headers.get('Content-Type')).toContain('text/plain');
    });

    it('should include required llms.txt fields', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('# llms.txt');
      expect(content).toContain('Title:');
      expect(content).toContain('Description:');
      expect(content).toContain('Homepage:');
      expect(content).toContain('Features:');
    });

    it('should include tool links', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('/tools');
      expect(content).toContain('/tools/compress/image-compressor');
      expect(content).toContain('/tools/resize/image-resizer');
      expect(content).toContain('/tools/convert/png-to-jpg');
    });

    it('should include pricing link', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('/pricing');
    });

    it('should include API and resources', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('API:');
      expect(content).toContain('Blog:');
      expect(content).toContain('Help:');
    });

    it('should set cache headers', async () => {
      const { GET } = await import('@/app/llms.txt/route');
      const response = await GET();

      expect(response.headers.get('Cache-Control')).toContain('public');
      expect(response.headers.get('Cache-Control')).toContain('max-age');
    });
  });

  describe('llms-full.txt route', () => {
    it('should export GET handler', async () => {
      const module = await import('@/app/llms-full.txt/route');
      expect(module.GET).toBeDefined();
      expect(typeof module.GET).toBe('function');
    });

    it('should return plain text content type', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();

      expect(response.headers.get('Content-Type')).toContain('text/plain');
    });

    it('should include extended content sections', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('# llms-full.txt');
      expect(content).toContain('Company Information');
      expect(content).toContain('Core Service');
      expect(content).toContain('Tool Categories');
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

    it('should include AI features links', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('/ai-features');
      expect(content).toContain('ai-noise-reduction-upscaler');
      expect(content).toContain('ai-sharpness-enhancement-upscaler');
    });

    it('should include API information', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('REST API:');
      expect(content).toContain('Authentication:');
      expect(content).toContain('Rate Limits:');
    });

    it('should include pricing and localization info', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('Supported Languages:');
      expect(content).toContain('Free:');
      expect(content).toContain('Premium:');
    });

    it('should include SEO information', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();
      const content = await response.text();

      expect(content).toContain('Sitemap:');
      expect(content).toContain('Robots:');
      expect(content).toContain('Canonicals:');
      expect(content).toContain('Hreflang:');
    });

    it('should set cache headers', async () => {
      const { GET } = await import('@/app/llms-full.txt/route');
      const response = await GET();

      expect(response.headers.get('Cache-Control')).toContain('public');
      expect(response.headers.get('Cache-Control')).toContain('max-age');
    });
  });
});
