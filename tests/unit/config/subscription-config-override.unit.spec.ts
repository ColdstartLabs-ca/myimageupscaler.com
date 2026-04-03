import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mutable override value that tests can control
let mockOverrideValue: string | undefined = undefined;

vi.mock('@shared/config/env', async () => {
  const actual = await vi.importActual<typeof import('@shared/config/env')>('@shared/config/env');
  return {
    ...actual,
    get serverEnv() {
      return {
        ...actual.serverEnv,
        get SUBSCRIPTION_CONFIG_OVERRIDE() {
          return mockOverrideValue;
        },
      };
    },
  };
});

import { SUBSCRIPTION_CONFIG, getSubscriptionConfig } from '@shared/config/subscription.config';

describe('Subscription Config Override', () => {
  beforeEach(() => {
    mockOverrideValue = undefined;
  });

  test('getSubscriptionConfig returns default config when no override', () => {
    mockOverrideValue = undefined;
    const config = getSubscriptionConfig();
    expect(config).toEqual(SUBSCRIPTION_CONFIG);
  });

  test('getSubscriptionConfig merges override when provided', () => {
    const override = { version: '2.0.0-override', freeUser: { initialCredits: 999 } };
    mockOverrideValue = JSON.stringify(override);

    const config = getSubscriptionConfig();

    // Top-level fields are overridden
    expect(config.version).toBe('2.0.0-override');
    // Nested objects are shallow-merged
    expect(config.freeUser.initialCredits).toBe(999);
    // Other freeUser fields fall back to defaults
    expect(config.freeUser.monthlyRefresh).toBe(SUBSCRIPTION_CONFIG.freeUser.monthlyRefresh);
    // plans fall back to default since not overridden
    expect(config.plans).toEqual(SUBSCRIPTION_CONFIG.plans);
    // creditPacks fall back to default since not overridden
    expect(config.creditPacks).toEqual(SUBSCRIPTION_CONFIG.creditPacks);
  });

  test('getSubscriptionConfig falls back to default on invalid JSON override', () => {
    mockOverrideValue = 'not-valid-json{{{';
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const config = getSubscriptionConfig();

    expect(config).toEqual(SUBSCRIPTION_CONFIG);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to parse SUBSCRIPTION_CONFIG_OVERRIDE:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
