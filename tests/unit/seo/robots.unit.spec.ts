/**
 * Robots.txt Unit Tests
 * Tests for AI search engine bot rules and general robots.txt configuration
 */

import { describe, it, expect, vi } from 'vitest';

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

describe('robots.ts', () => {
  describe('AI Bot Rules', () => {
    it('should have explicit GPTBot allow rule', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const gptBotRule = result.rules.find(
        (rule) => typeof rule === 'object' && rule.userAgent === 'GPTBot'
      );

      expect(gptBotRule).toBeDefined();
      expect(gptBotRule).toMatchObject({
        userAgent: 'GPTBot',
        allow: '/',
      });
    });

    it('should have explicit ChatGPT-User allow rule', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const chatGptRule = result.rules.find(
        (rule) => typeof rule === 'object' && rule.userAgent === 'ChatGPT-User'
      );

      expect(chatGptRule).toBeDefined();
      expect(chatGptRule).toMatchObject({
        userAgent: 'ChatGPT-User',
        allow: '/',
      });
    });

    it('should have explicit Google-Extended allow rule', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const googleExtendedRule = result.rules.find(
        (rule) => typeof rule === 'object' && rule.userAgent === 'Google-Extended'
      );

      expect(googleExtendedRule).toBeDefined();
      expect(googleExtendedRule).toMatchObject({
        userAgent: 'Google-Extended',
        allow: '/',
      });
    });

    it('should have explicit ClaudeBot allow rule', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const claudeBotRule = result.rules.find(
        (rule) => typeof rule === 'object' && rule.userAgent === 'ClaudeBot'
      );

      expect(claudeBotRule).toBeDefined();
      expect(claudeBotRule).toMatchObject({
        userAgent: 'ClaudeBot',
        allow: '/',
      });
    });

    it('should have explicit PerplexityBot allow rule', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const perplexityRule = result.rules.find(
        (rule) => typeof rule === 'object' && rule.userAgent === 'PerplexityBot'
      );

      expect(perplexityRule).toBeDefined();
      expect(perplexityRule).toMatchObject({
        userAgent: 'PerplexityBot',
        allow: '/',
      });
    });

    it('should have explicit anthropic-ai allow rule', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const anthropicRule = result.rules.find(
        (rule) => typeof rule === 'object' && rule.userAgent === 'anthropic-ai'
      );

      expect(anthropicRule).toBeDefined();
      expect(anthropicRule).toMatchObject({
        userAgent: 'anthropic-ai',
        allow: '/',
      });
    });

    it('AI bot rules should disallow /dashboard/ and /admin/', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const aiBotUserAgents = [
        'GPTBot',
        'ChatGPT-User',
        'Google-Extended',
        'ClaudeBot',
        'PerplexityBot',
        'anthropic-ai',
      ];

      aiBotUserAgents.forEach((userAgent) => {
        const rule = result.rules.find(
          (r) => typeof r === 'object' && r.userAgent === userAgent
        );

        expect(rule).toBeDefined();
        expect(rule?.disallow).toContain('/dashboard/');
        expect(rule?.disallow).toContain('/admin/');
      });
    });

    it('AI bot rules should disallow /api/ and /private/', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const aiBotUserAgents = [
        'GPTBot',
        'ChatGPT-User',
        'Google-Extended',
        'ClaudeBot',
        'PerplexityBot',
        'anthropic-ai',
      ];

      aiBotUserAgents.forEach((userAgent) => {
        const rule = result.rules.find(
          (r) => typeof r === 'object' && r.userAgent === userAgent
        );

        expect(rule).toBeDefined();
        expect(rule?.disallow).toContain('/api/');
        expect(rule?.disallow).toContain('/private/');
      });
    });
  });

  describe('Wildcard Rule', () => {
    it('should have wildcard user-agent rule', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const wildcardRule = result.rules.find(
        (rule) => typeof rule === 'object' && rule.userAgent === '*'
      );

      expect(wildcardRule).toBeDefined();
      expect(wildcardRule).toMatchObject({
        userAgent: '*',
        allow: '/',
      });
    });

    it('wildcard rule should disallow protected paths', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      const wildcardRule = result.rules.find(
        (rule) => typeof rule === 'object' && rule.userAgent === '*'
      );

      expect(wildcardRule?.disallow).toContain('/api/');
      expect(wildcardRule?.disallow).toContain('/dashboard/');
      expect(wildcardRule?.disallow).toContain('/admin/');
      expect(wildcardRule?.disallow).toContain('/_next/');
      expect(wildcardRule?.disallow).toContain('/private/');
      expect(wildcardRule?.disallow).toContain('/*.json$');
      expect(wildcardRule?.disallow).toContain('/success');
      expect(wildcardRule?.disallow).toContain('/canceled');
    });
  });

  describe('Sitemap and Host', () => {
    it('should include sitemap URL', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      expect(result.sitemap).toBe('https://myimageupscaler.com/sitemap.xml');
    });

    it('should include host', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      expect(result.host).toBe('https://myimageupscaler.com');
    });
  });

  describe('Rule Count', () => {
    it('should have exactly 7 rules (1 wildcard + 6 AI bots)', async () => {
      const { default: robots } = await import('@/app/robots');
      const result = robots();

      expect(result.rules).toHaveLength(7);
    });
  });
});
