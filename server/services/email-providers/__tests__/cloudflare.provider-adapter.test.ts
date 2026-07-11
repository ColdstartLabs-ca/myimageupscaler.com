import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailProvider } from '@shared/types/provider-adapter.types';

let mockServerEnv = {
  CLOUDFLARE_EMAIL_API_TOKEN: 'test-cloudflare-token',
  CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
  EMAIL_FROM_ADDRESS: 'noreply@example.com',
  BASE_URL: 'https://example.com',
  SUPPORT_EMAIL: 'support@example.com',
  APP_NAME: 'Test App',
  ENV: 'production',
  ALLOW_TRANSACTIONAL_EMAILS_IN_DEV: false,
};

vi.mock('@shared/config/env', () => ({
  serverEnv: new Proxy({} as typeof mockServerEnv, {
    get(_, prop) {
      return mockServerEnv[prop as keyof typeof mockServerEnv];
    },
  }),
  isTest: vi.fn(() => false),
  isDevelopment: vi.fn(() => false),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } })),
        })),
      })),
    })),
  },
}));

vi.mock('@server/services/provider-credit-tracker.service', () => ({
  getProviderCreditTracker: () => ({
    incrementUsage: vi.fn(async () => ({ success: true })),
    isProviderAvailable: vi.fn(async () => true),
    getProviderUsage: vi.fn(async () => ({
      provider: EmailProvider.CLOUDFLARE,
      todayRequests: 0,
      monthCredits: 0,
      lastDailyReset: new Date().toISOString(),
      lastMonthlyReset: new Date().toISOString(),
      totalRequests: 0,
      totalCredits: 0,
    })),
    logProviderUsage: vi.fn(),
    resetDailyCounters: vi.fn(),
    resetMonthlyCounters: vi.fn(),
  }),
}));

describe('CloudflareEmailProviderAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServerEnv = {
      CLOUDFLARE_EMAIL_API_TOKEN: 'test-cloudflare-token',
      CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
      EMAIL_FROM_ADDRESS: 'noreply@example.com',
      BASE_URL: 'https://example.com',
      SUPPORT_EMAIL: 'support@example.com',
      APP_NAME: 'Test App',
      ENV: 'production',
      ALLOW_TRANSACTIONAL_EMAILS_IN_DEV: false,
    };
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('sends rendered template payload to cloudflare', async () => {
    const { CloudflareEmailProviderAdapter } = await import('../cloudflare.provider-adapter');
    class TestAdapter extends CloudflareEmailProviderAdapter {
      sendRaw(to: string, subject: string, element: React.ReactElement) {
        return this.sendEmail(to, subject, element);
      }
    }

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        success: true,
        errors: [],
        messages: [],
        result: {
          delivered: ['user@example.com'],
          permanent_bounces: [],
          queued: [],
        },
      }),
    });

    const adapter = new TestAdapter();
    const result = await adapter.sendRaw(
      'user@example.com',
      'Welcome',
      React.createElement('div', null, 'Rendered body')
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/test-account-id/email/sending/send'
    );
    expect(init.headers.Authorization).toBe('Bearer test-cloudflare-token');
    expect(init.headers['Content-Type']).toBe('application/json');

    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      to: 'user@example.com',
      from: { address: 'noreply@example.com', name: 'Test App' },
      subject: 'Welcome',
    });
    expect(payload.html).toContain('Rendered body');
    expect(payload.text).toContain('Rendered body');
    expect(result.provider).toBe(EmailProvider.CLOUDFLARE);
    expect(result.messageId).toMatch(/^cloudflare-delivered-[0-9a-f-]+$/);
    expect(result.messageId).not.toContain('user@example.com');
  });

  test('throws on cloudflare api error', async () => {
    const { CloudflareEmailProviderAdapter } = await import('../cloudflare.provider-adapter');
    class TestAdapter extends CloudflareEmailProviderAdapter {
      sendRaw(to: string, subject: string, element: React.ReactElement) {
        return this.sendEmail(to, subject, element);
      }
    }

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        success: false,
        errors: [{ code: 10001, message: 'email.sending.error.invalid_request_schema' }],
        messages: [],
        result: null,
      }),
    });

    const adapter = new TestAdapter();

    await expect(
      adapter.sendRaw('user@example.com', 'Welcome', React.createElement('div', null, 'Body'))
    ).rejects.toThrow(
      'Cloudflare Email Service API error (400): 10001 email.sending.error.invalid_request_schema'
    );
  });

  test('is unavailable without credentials outside test mode', async () => {
    mockServerEnv.CLOUDFLARE_EMAIL_API_TOKEN = '';

    const { CloudflareEmailProviderAdapter } = await import('../cloudflare.provider-adapter');
    const adapter = new CloudflareEmailProviderAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(false);
  });
});
