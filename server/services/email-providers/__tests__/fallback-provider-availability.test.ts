import { beforeEach, describe, expect, it, vi } from 'vitest';

const isProviderAvailableMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
  serverEnv: {
    BREVO_API_KEY: 'brevo-test-key',
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

describe('email resilience fallback availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isProviderAvailableMock.mockResolvedValue(false);
  });

  it('should stop using Brevo when its tracked daily capacity is exhausted', async () => {
    const adapter = new BrevoProviderAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(false);
    expect(adapter.getConfig().freeTier).toBeUndefined();
    expect(isProviderAvailableMock).toHaveBeenCalledWith('brevo');
  });
});
