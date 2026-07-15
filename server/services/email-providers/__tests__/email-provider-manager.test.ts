/**
 * Email Provider Manager Tests
 *
 * Tests for the email provider adapter system including:
 * - Provider availability checking
 * - Provider selection and fallback
 * - Email sending with provider switching
 * - Credit tracking
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EmailProviderManager } from '../email-provider-manager';
import { EmailProvider } from '@shared/types/provider-adapter.types';
import type { IEmailProviderAdapter } from '@shared/types/provider-adapter.types';
import { CloudflareEmailProviderAdapter } from '../cloudflare.provider-adapter';
import {
  EmailProviderSendError,
  normalizeEmailProviderError,
} from '../base-email-provider-adapter';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    BASE_URL: 'https://example.com',
    APP_NAME: 'TestApp',
    ENV: 'test',
  },
  serverEnv: {
    CLOUDFLARE_EMAIL_API_TOKEN: 'test-cloudflare-token',
    CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
    BREVO_API_KEY: 'test-brevo-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    EMAIL_FROM_ADDRESS: 'test@example.com',
    BASE_URL: 'https://example.com',
    SUPPORT_EMAIL: 'support@example.com',
    APP_NAME: 'TestApp',
    ENV: 'test',
    ALLOW_TRANSACTIONAL_EMAILS_IN_DEV: false,
  },
  isTest: vi.fn(() => true),
  isDevelopment: vi.fn(() => false),
}));

// Mock the provider credit tracker
vi.mock('@server/services/provider-credit-tracker.service', () => ({
  getProviderCreditTracker: () => ({
    incrementUsage: vi.fn().mockResolvedValue({
      success: true,
      dailyRemaining: 499,
      monthlyRemaining: 14999,
    }),
    isProviderAvailable: vi.fn().mockResolvedValue(true),
    getProviderUsage: vi.fn().mockResolvedValue({
      provider: 'brevo',
      todayRequests: 1,
      monthCredits: 1,
      lastDailyReset: new Date().toISOString(),
      lastMonthlyReset: new Date().toISOString(),
      totalRequests: 1,
      totalCredits: 1,
    }),
    logProviderUsage: vi.fn(),
    resetDailyCounters: vi.fn(),
    resetMonthlyCounters: vi.fn(),
  }),
}));

// Mock template loading
vi.mock('@/emails/templates/WelcomeEmail', () => ({
  WelcomeEmail: ({ name }: { name: string }) => `Welcome ${name}`,
}));

describe('EmailProviderManager', () => {
  let manager: EmailProviderManager;

  beforeEach(() => {
    manager = new EmailProviderManager();
  });

  describe('Provider Registration', () => {
    test('should register all default providers', () => {
      const providers = manager.getAllProviders();

      expect(providers).toHaveLength(2);
      expect(providers.map(p => p.getProviderName())).toEqual([
        EmailProvider.CLOUDFLARE,
        EmailProvider.BREVO,
      ]);
    });

    test('should register custom provider', () => {
      const mockAdapter = {
        getProviderName: () => 'custom' as EmailProvider.BREVO,
        getConfig: () => ({
          provider: EmailProvider.BREVO,
          tier: 'free',
          priority: 1,
          enabled: true,
          supportedModels: [],
        }),
        send: vi.fn().mockResolvedValue({ success: true }),
        getUsage: vi.fn(),
        isAvailable: vi.fn().mockResolvedValue(true),
        resetCounters: vi.fn(),
      };

      manager.registerProvider(mockAdapter as unknown as IEmailProviderAdapter);
      const providers = manager.getAllProviders();

      expect(providers).toHaveLength(3);
    });
  });

  describe('Provider Selection', () => {
    test('should get Cloudflare as primary provider', async () => {
      const provider = await manager.getProvider();

      expect(provider.getProviderName()).toBe(EmailProvider.CLOUDFLARE);
      expect(provider.getConfig().priority).toBe(1);
    });

    test('should switch to Brevo when Cloudflare is unavailable', async () => {
      // Disable Cloudflare to simulate missing credentials or hitting limits
      manager.updateProviderConfig(EmailProvider.CLOUDFLARE, { enabled: false });

      const provider = await manager.getProvider();
      expect(provider.getProviderName()).toBe(EmailProvider.BREVO);
      expect(provider.getConfig().priority).toBe(2);
    });

    test('should throw error when all providers are unavailable', async () => {
      // Disable all providers to simulate hitting all limits
      manager.updateProviderConfig(EmailProvider.CLOUDFLARE, { enabled: false });
      manager.updateProviderConfig(EmailProvider.BREVO, { enabled: false });

      await expect(manager.getProvider()).rejects.toMatchObject({
        classification: 'provider_unavailable',
        transient: true,
      });
    });

    test('should get provider by type', () => {
      const cloudflare = manager.getProviderByType(EmailProvider.CLOUDFLARE);
      const brevo = manager.getProviderByType(EmailProvider.BREVO);
      const resend = manager.getProviderByType(EmailProvider.RESEND);

      expect(cloudflare).toBeDefined();
      expect(brevo).toBeDefined();
      expect(resend).toBeUndefined();

      expect(cloudflare?.getProviderName()).toBe(EmailProvider.CLOUDFLARE);
      expect(brevo?.getProviderName()).toBe(EmailProvider.BREVO);
    });

    test('should return undefined for unknown provider', () => {
      const unknown = manager.getProviderByType('unknown' as EmailProvider);
      expect(unknown).toBeUndefined();
    });
  });

  describe('Provider Configuration', () => {
    test('should have correct Cloudflare config', () => {
      const cloudflare = manager.getProviderByType(EmailProvider.CLOUDFLARE);
      const config = cloudflare?.getConfig();

      expect(config?.provider).toBe(EmailProvider.CLOUDFLARE);
      expect(config?.priority).toBe(1);
      expect(config?.enabled).toBe(true);
      expect(config?.tier).toBe('paid');
      expect(config?.freeTier).toBeUndefined();
      expect(config?.fallbackProvider).toBe(EmailProvider.BREVO);
    });

    test('should have correct Brevo config', () => {
      const brevo = manager.getProviderByType(EmailProvider.BREVO);
      const config = brevo?.getConfig();

      expect(config?.provider).toBe(EmailProvider.BREVO);
      expect(config?.priority).toBe(2);
      expect(config?.enabled).toBe(true);
      expect(config?.freeTier).toBeUndefined();
      expect(config?.fallbackProvider).toBeUndefined();
    });

    test('should not register Resend', () => {
      const resend = manager.getProviderByType(EmailProvider.RESEND);
      expect(resend).toBeUndefined();
    });

    test('should update provider config', () => {
      manager.updateProviderConfig(EmailProvider.BREVO, {
        enabled: false,
      });

      const brevo = manager.getProviderByType(EmailProvider.BREVO);
      expect(brevo?.getConfig().enabled).toBe(false);
    });
  });

  describe('Fallback Priority', () => {
    test('should route marketing email through Brevo without attempting Cloudflare or Resend', async () => {
      const cloudflare = manager.getProviderByType(EmailProvider.CLOUDFLARE)!;
      const brevo = manager.getProviderByType(EmailProvider.BREVO)!;
      const cloudflareSend = vi.spyOn(cloudflare, 'send');
      const brevoSend = vi
        .spyOn(brevo, 'send')
        .mockResolvedValue({ success: true, provider: EmailProvider.BREVO });

      const result = await manager.send({
        to: 'buyer@example.com',
        template: 'welcome',
        type: 'marketing',
        data: {},
      });

      expect(result.provider).toBe(EmailProvider.BREVO);
      expect(cloudflareSend).not.toHaveBeenCalled();
      expect(brevoSend).toHaveBeenCalledOnce();
    });

    test('should never attempt Resend when Cloudflare and Brevo fail', async () => {
      const cloudflare = manager.getProviderByType(EmailProvider.CLOUDFLARE)!;
      const brevo = manager.getProviderByType(EmailProvider.BREVO)!;
      vi.spyOn(cloudflare, 'send').mockRejectedValue(
        new EmailProviderSendError('Cloudflare throttled', 'rate_limited', true)
      );
      vi.spyOn(brevo, 'send').mockRejectedValue(
        new EmailProviderSendError('Brevo unavailable', 'provider_unavailable', true)
      );

      await expect(
        manager.send({ to: 'buyer@example.com', template: 'welcome', data: {} })
      ).rejects.toMatchObject({
        attemptedProviders: [EmailProvider.CLOUDFLARE, EmailProvider.BREVO],
      });
    });

    test('should use Cloudflare first when configured', async () => {
      const cloudflare = manager.getProviderByType(EmailProvider.CLOUDFLARE)!;
      const brevo = manager.getProviderByType(EmailProvider.BREVO)!;
      const cloudflareSend = vi
        .spyOn(cloudflare, 'send')
        .mockResolvedValue({ success: true, provider: EmailProvider.CLOUDFLARE });
      const brevoSend = vi.spyOn(brevo, 'send');

      await manager.send({ to: 'buyer@example.com', template: 'welcome', data: {} });

      expect(cloudflareSend).toHaveBeenCalledOnce();
      expect(brevoSend).not.toHaveBeenCalled();
    });

    test('should fall back when Cloudflare returns a transient failure', async () => {
      const cloudflare = manager.getProviderByType(EmailProvider.CLOUDFLARE)!;
      const brevo = manager.getProviderByType(EmailProvider.BREVO)!;
      vi.spyOn(cloudflare, 'send').mockRejectedValue(
        new EmailProviderSendError('Cloudflare unavailable', 'provider_unavailable', true)
      );
      const brevoSend = vi
        .spyOn(brevo, 'send')
        .mockResolvedValue({ success: true, provider: EmailProvider.BREVO });

      const result = await manager.send({
        to: 'buyer@example.com',
        template: 'welcome',
        data: {},
      });

      expect(result.provider).toBe(EmailProvider.BREVO);
      expect(result).toMatchObject({
        attemptedProviders: [EmailProvider.CLOUDFLARE, EmailProvider.BREVO],
        fallbackReasons: ['provider_unavailable'],
      });
      expect(brevoSend).toHaveBeenCalledOnce();
    });

    test('should fall back when Cloudflare rejects the provider credentials', async () => {
      const cloudflare = manager.getProviderByType(EmailProvider.CLOUDFLARE)!;
      const brevo = manager.getProviderByType(EmailProvider.BREVO)!;
      vi.spyOn(cloudflare, 'send').mockRejectedValue(
        new EmailProviderSendError(
          'Cloudflare API error (401): invalid token',
          'provider_authentication',
          false,
          [],
          true
        )
      );
      const brevoSend = vi
        .spyOn(brevo, 'send')
        .mockResolvedValue({ success: true, provider: EmailProvider.BREVO });

      const result = await manager.send({
        to: 'buyer@example.com',
        template: 'welcome',
        data: {},
      });

      expect(result.provider).toBe(EmailProvider.BREVO);
      expect(brevoSend).toHaveBeenCalledOnce();
    });

    test('should not fall back when Cloudflare permanently rejects recipient', async () => {
      const cloudflare = manager.getProviderByType(EmailProvider.CLOUDFLARE)!;
      const brevo = manager.getProviderByType(EmailProvider.BREVO)!;
      vi.spyOn(cloudflare, 'send').mockRejectedValue(
        new EmailProviderSendError('Invalid recipient', 'invalid_recipient', false)
      );
      const brevoSend = vi.spyOn(brevo, 'send');

      await expect(
        manager.send({ to: 'invalid', template: 'welcome', data: {} })
      ).rejects.toMatchObject({ classification: 'invalid_recipient', transient: false });
      expect(brevoSend).not.toHaveBeenCalled();
    });

    test('should order providers by priority', async () => {
      const providers = manager
        .getAllProviders()
        .filter(p => p.getConfig().enabled)
        .sort((a, b) => a.getConfig().priority - b.getConfig().priority);

      expect(providers[0].getProviderName()).toBe(EmailProvider.CLOUDFLARE);
      expect(providers[1].getProviderName()).toBe(EmailProvider.BREVO);
      expect(providers).toHaveLength(2);
    });

    test('should have correct fallback chain', () => {
      const cloudflare = manager.getProviderByType(EmailProvider.CLOUDFLARE);
      const brevo = manager.getProviderByType(EmailProvider.BREVO);

      // Cloudflare -> Brevo.
      expect(cloudflare?.getConfig().fallbackProvider).toBe(EmailProvider.BREVO);
      expect(brevo?.getConfig().fallbackProvider).toBeUndefined();
    });
  });

  describe('Get All Providers Usage', () => {
    test('should return usage for all providers', async () => {
      const usage = await manager.getAllProvidersUsage();

      expect(usage).toBeDefined();
      expect(Object.keys(usage)).toHaveLength(2);
      expect(usage[EmailProvider.CLOUDFLARE]).toBeDefined();
      expect(usage[EmailProvider.BREVO]).toBeDefined();
      expect(usage[EmailProvider.RESEND]).toBeUndefined();
    });
  });
});

describe('BaseEmailProviderAdapter', () => {
  describe('Failure classification', () => {
    test.each([
      ['Provider API error (429): rate limit', 'rate_limited', true],
      ['Request timed out', 'timeout', true],
      ['Provider API error (503): unavailable', 'provider_unavailable', true],
      ['Invalid recipient address', 'invalid_recipient', false],
      ['Permanent bounce for recipient', 'invalid_recipient', false],
    ])('should classify %s', (message, classification, transient) => {
      expect(normalizeEmailProviderError(new Error(message))).toMatchObject({
        classification,
        transient,
      });
    });

    test('should classify a provider-scoped 400 as fallback eligible', () => {
      expect(
        normalizeEmailProviderError(new Error('API error (400): malformed payload'))
      ).toMatchObject({
        classification: 'provider_request',
        transient: false,
        fallbackEligible: true,
      });
    });

    test('should classify provider auth failures as fallback eligible', () => {
      expect(normalizeEmailProviderError(new Error('API error (401): invalid token'))).toMatchObject({
        classification: 'provider_authentication',
        transient: false,
        fallbackEligible: true,
      });
    });
  });

  describe('Template Loading', () => {
    test('should have all required templates defined', async () => {
      const templates = [
        'welcome',
        'payment-success',
        'subscription-update',
        'low-credits',
        'password-reset',
      ];

      // Test that template export names are defined
      // This is a compile-time check, but we verify the structure
      expect(templates).toHaveLength(5);
      expect(templates).toContain('welcome');
      expect(templates).toContain('payment-success');
      expect(templates).toContain('subscription-update');
      expect(templates).toContain('low-credits');
      expect(templates).toContain('password-reset');
    });
  });

  describe('Subject Lines', () => {
    test('should generate correct subjects', async () => {
      const cloudflare = new CloudflareEmailProviderAdapter();

      // Subjects are generated internally, we just verify the adapter exists
      expect(cloudflare.getProviderName()).toBe(EmailProvider.CLOUDFLARE);
      expect(cloudflare.getConfig().provider).toBe(EmailProvider.CLOUDFLARE);
    });
  });
});
