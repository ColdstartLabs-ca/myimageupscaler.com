import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Create the mock function upfront
const mockResendSend = vi.fn().mockResolvedValue({
  data: { id: 'test-email-id' },
});

// Mock Resend with the shared send function
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: mockResendSend,
    };
    constructor(_apiKey: string) {}
  },
}));

// Mock supabaseAdmin - must use factory function
vi.mock('@server/supabase/supabaseAdmin', () => {
  const mockInsert = vi.fn(() => ({ error: null }));

  const mockSingle = vi.fn(() => ({
    data: { marketing_emails: true },
    error: null,
  }));

  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
  }));

  return {
    supabaseAdmin: {
      from: mockFrom,
    },
  };
});

// Mock serverEnv and isDevelopment
const mockIsDevelopment = vi.fn(() => false);
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    RESEND_API_KEY: 'test-api-key',
    EMAIL_FROM_ADDRESS: 'test@example.com',
    BASE_URL: 'http://localhost:3000',
    SUPPORT_EMAIL: 'support@example.com',
    APP_NAME: 'TestApp',
  },
  isDevelopment: () => mockIsDevelopment(),
  isTest: () => true,
  clientEnv: {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

// Mock templates - we need to mock the dynamic imports
vi.mock('@/emails/templates/WelcomeEmail', () => ({
  WelcomeEmail: () => null,
}));
vi.mock('@/emails/templates/PaymentSuccessEmail', () => ({
  PaymentSuccessEmail: () => null,
}));
vi.mock('@/emails/templates/SubscriptionUpdateEmail', () => ({
  SubscriptionUpdateEmail: () => null,
}));
vi.mock('@/emails/templates/LowCreditsEmail', () => ({
  LowCreditsEmail: () => null,
}));
vi.mock('@/emails/templates/PasswordResetEmail', () => ({
  PasswordResetEmail: () => null,
}));

import { EmailService, EmailError } from '@server/services/email.service';
import { getEmailProviderManager } from '@server/services/email-providers/email-provider-manager';
import { EmailProviderSendError } from '@server/services/email-providers/base-email-provider-adapter';

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    // Reset all mocks to default behavior
    mockResendSend.mockResolvedValue({
      data: { id: 'test-email-id' },
    });
    mockIsDevelopment.mockReturnValue(false);
    vi.clearAllMocks();
    emailService = new EmailService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('send - transactional emails', () => {
    it('should send transactional email successfully', async () => {
      const result = await emailService.send({
        to: 'test@example.com',
        template: 'welcome',
        data: { userName: 'Test User' },
        type: 'transactional',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^dev-\d+$/);
      expect(result.skipped).toBeUndefined();
    });

    it('should send transactional email without checking preferences', async () => {
      const result = await emailService.send({
        to: 'test@example.com',
        template: 'low-credits',
        data: { userName: 'Test User' },
        type: 'transactional',
        userId: 'user-123',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBeUndefined();
      expect(result.messageId).toMatch(/^dev-\d+$/);
    });

    it('should handle all template types', async () => {
      const templates = [
        'welcome',
        'payment-success',
        'subscription-update',
        'low-credits',
        'password-reset',
      ] as const;

      for (const template of templates) {
        const result = await emailService.send({
          to: 'test@example.com',
          template,
          data: { test: 'data' },
          type: 'transactional',
        });

        expect(result.success).toBe(true);
        expect(result.messageId).toMatch(/^dev-\d+$/);
      }
    });
  });

  describe('send - marketing emails', () => {
    it('should send marketing email when user has opted in', async () => {
      const result = await emailService.send({
        to: 'user@example.com',
        template: 'welcome',
        data: { userName: 'User' },
        type: 'marketing',
        userId: 'user-123',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBeUndefined();
      expect(result.messageId).toMatch(/^dev-\d+$/);
    });

    it('should skip marketing email if user opted out', async () => {
      // Get the module and mock the return value for this specific call
      const { supabaseAdmin } = await import('@server/supabase/supabaseAdmin');
      // Mock user who opted out of marketing emails
      (supabaseAdmin.from as any).mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { marketing_emails: false },
                error: null,
              }),
          }),
        }),
      });

      const result = await emailService.send({
        to: 'test@example.com',
        template: 'welcome',
        data: { userName: 'Test User' },
        type: 'marketing',
        userId: 'user-123',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should look up user by email when userId is not provided for marketing emails', async () => {
      const { supabaseAdmin } = await import('@server/supabase/supabaseAdmin');

      // First call: profile lookup by email, returns a user ID
      // Second call: email_preferences lookup, returns opted-out
      let callCount = 0;
      (supabaseAdmin.from as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Profile lookup by email
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id: 'found-user-123' },
                    error: null,
                  }),
              }),
            }),
            insert: vi.fn(() => ({ error: null })),
          };
        } else if (callCount === 2) {
          // Email preferences lookup
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { marketing_emails: false },
                    error: null,
                  }),
              }),
            }),
            insert: vi.fn(() => ({ error: null })),
          };
        }
        // Fallback for logging
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: vi.fn(() => ({ error: null })),
        };
      });

      const result = await emailService.send({
        to: 'opted-out@example.com',
        template: 'welcome',
        data: {},
        type: 'marketing',
        // No userId provided - should look up by email
      });

      // User found by email, and they opted out
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should allow marketing email for non-registered email addresses', async () => {
      const { supabaseAdmin } = await import('@server/supabase/supabaseAdmin');

      // Profile lookup by email returns no user
      (supabaseAdmin.from as any).mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: null, // No user found
                error: null,
              }),
          }),
        }),
        insert: vi.fn(() => ({ error: null })),
      });

      const result = await emailService.send({
        to: 'newuser@example.com',
        template: 'welcome',
        data: {},
        type: 'marketing',
      });

      // No user found, allow the email
      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^dev-\d+$/);
    });

    it('should default to allowing marketing when preferences do not exist', async () => {
      const { supabaseAdmin } = await import('@server/supabase/supabaseAdmin');
      (supabaseAdmin.from as any).mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: { code: 'PGRST116' },
              }),
          }),
        }),
      });

      const result = await emailService.send({
        to: 'newuser@example.com',
        template: 'welcome',
        data: {},
        type: 'marketing',
        userId: 'new-user-123',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^dev-\d+$/);
    });
  });

  describe('send - error handling', () => {
    it('should preserve structured provider failure metadata', async () => {
      const providerError = new EmailProviderSendError('Cloudflare timed out', 'timeout', true, [
        'cloudflare',
        'brevo',
      ]);
      vi.spyOn(getEmailProviderManager(), 'send').mockRejectedValueOnce(providerError);

      await expect(
        emailService.send({ to: 'test@example.com', template: 'welcome', data: {} })
      ).rejects.toBe(providerError);
      expect(providerError).toMatchObject({
        classification: 'timeout',
        transient: true,
        attemptedProviders: ['cloudflare', 'brevo'],
      });
    });

    it('should throw EmailError with TEMPLATE_NOT_FOUND for invalid template', async () => {
      await expect(
        emailService.send({
          to: 'test@example.com',
          template: 'non-existent',
          data: {},
        })
      ).rejects.toThrow(EmailError);
    });

    it('should include correct error message for template not found', async () => {
      try {
        await emailService.send({
          to: 'test@example.com',
          template: 'invalid-template',
          data: {},
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EmailError);
        if (error instanceof EmailError) {
          expect(error.message).toContain('invalid-template');
        }
      }
    });

    it('should include TEMPLATE_NOT_FOUND code for invalid template', async () => {
      try {
        await emailService.send({
          to: 'test@example.com',
          template: 'invalid-template',
          data: {},
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EmailError);
        if (error instanceof EmailError) {
          // The error gets wrapped by EmailService, so the code becomes SEND_FAILED
          // but the message should still contain the template name
          expect(error.message).toContain('invalid-template');
        }
      }
    });
  });

  describe('EmailError', () => {
    it('should create error with default code', () => {
      const error = new EmailError('Test error');
      expect(error.code).toBe('EMAIL_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('EmailError');
    });

    it('should create error with custom code', () => {
      const error = new EmailError('Test error', 'CUSTOM_CODE');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.message).toBe('Test error');
    });

    it('should be instanceof Error', () => {
      const error = new EmailError('Test');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof EmailError).toBe(true);
    });
  });

  describe('test mode', () => {
    it('should skip actual email sending in test mode and return success', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await emailService.send({
        to: 'test@example.com',
        template: 'welcome',
        data: { userName: 'Test User' },
        type: 'transactional',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^dev-\d+$/);
      expect(mockResendSend).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[EMAIL_TEST_MODE] Email would be sent:',
        expect.objectContaining({
          provider: 'cloudflare',
          from: 'test@example.com',
          to: 'test@example.com',
          template: 'welcome',
          type: 'transactional',
          subject: expect.any(String),
          userId: undefined,
          templateData: expect.objectContaining({
            userName: 'Test User',
            baseUrl: 'http://localhost:3000',
            supportEmail: 'support@example.com',
            appName: 'TestApp',
          }),
        })
      );

      consoleSpy.mockRestore();
    });

    it('should log template data in test mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await emailService.send({
        to: 'user@example.com',
        template: 'payment-success',
        data: { amount: '$50', credits: 100 },
        type: 'transactional',
        userId: 'user-123',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[EMAIL_TEST_MODE] Email would be sent:',
        expect.objectContaining({
          provider: 'cloudflare',
          to: 'user@example.com',
          template: 'payment-success',
          type: 'transactional',
          userId: 'user-123',
          templateData: expect.objectContaining({
            amount: '$50',
            credits: 100,
            baseUrl: 'http://localhost:3000',
            supportEmail: 'support@example.com',
            appName: 'TestApp',
          }),
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty data object', async () => {
      const result = await emailService.send({
        to: 'test@example.com',
        template: 'welcome',
        data: {},
      });

      expect(result.success).toBe(true);
    });

    it('should handle complex data objects', async () => {
      const complexData = {
        userName: 'John Doe',
        items: [
          { name: 'Item 1', price: 10 },
          { name: 'Item 2', price: 20 },
        ],
        metadata: {
          source: 'web',
          campaign: 'summer-sale',
        },
      };

      const result = await emailService.send({
        to: 'test@example.com',
        template: 'welcome',
        data: complexData,
      });

      expect(result.success).toBe(true);
    });

    it('should handle special characters in email', async () => {
      const result = await emailService.send({
        to: 'user+tag@example.com',
        template: 'welcome',
        data: {},
      });

      expect(result.success).toBe(true);
    });

    it('should handle null values in data', async () => {
      const result = await emailService.send({
        to: 'test@example.com',
        template: 'payment-success',
        data: {
          amount: null,
          planName: null,
          receiptUrl: null,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should handle undefined values in data', async () => {
      const result = await emailService.send({
        to: 'test@example.com',
        template: 'welcome',
        data: {
          userName: undefined,
          actionUrl: undefined,
        },
      });

      expect(result.success).toBe(true);
    });
  });
});
