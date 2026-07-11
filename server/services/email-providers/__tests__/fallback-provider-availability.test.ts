import { beforeEach, describe, expect, it, vi } from 'vitest';

const isProviderAvailableMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
  serverEnv: {
    BREVO_API_KEY: 'brevo-test-key',
    RESEND_API_KEY: 'resend-test-key',
    EMAIL_FROM_ADDRESS: 'noreply@example.com',
    BASE_URL: 'https://example.com',
    SUPPORT_EMAIL: 'support@example.com',
    APP_NAME: 'Test App',
    ALLOW_TRANSACTIONAL_EMAILS_IN_DEV: false,
  },
  isTest: vi.fn(() => false),
  isDevelopment: vi.fn(() => false),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {},
}));

vi.mock('@server/services/provider-credit-tracker.service', () => ({
  getProviderCreditTracker: () => ({
    isProviderAvailable: isProviderAvailableMock,
  }),
}));

import { BrevoProviderAdapter } from '../brevo.provider-adapter';
import { ResendProviderAdapter } from '../resend.provider-adapter';

describe('email resilience fallback availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isProviderAvailableMock.mockResolvedValue(false);
  });

  it('should keep configured Brevo available regardless of local quota counters', async () => {
    const adapter = new BrevoProviderAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(true);
    expect(adapter.getConfig().freeTier).toBeUndefined();
    expect(isProviderAvailableMock).not.toHaveBeenCalled();
  });

  it('should keep configured Resend available regardless of local quota counters', async () => {
    const adapter = new ResendProviderAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(true);
    expect(adapter.getConfig().freeTier).toBeUndefined();
    expect(isProviderAvailableMock).not.toHaveBeenCalled();
  });
});
