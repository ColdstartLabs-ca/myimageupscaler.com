import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('serverEnv Amplitude key fallback', () => {
  const originalAmplitudeApiKey = process.env.AMPLITUDE_API_KEY;
  const originalAmplitudeSecretKey = process.env.AMPLITUDE_SECRET_KEY;
  const originalCheckoutCohort = process.env.AMPLITUDE_COHORT_CHECKOUT_ABANDONERS;
  const originalUpgradeCohort = process.env.AMPLITUDE_COHORT_UPGRADE_CLICKERS_NO_PURCHASE;
  const originalNextPublicAmplitudeApiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.AMPLITUDE_API_KEY;
    delete process.env.AMPLITUDE_SECRET_KEY;
    delete process.env.AMPLITUDE_COHORT_CHECKOUT_ABANDONERS;
    delete process.env.AMPLITUDE_COHORT_UPGRADE_CLICKERS_NO_PURCHASE;
    delete process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  });

  afterEach(() => {
    vi.resetModules();

    if (originalAmplitudeApiKey === undefined) {
      delete process.env.AMPLITUDE_API_KEY;
    } else {
      process.env.AMPLITUDE_API_KEY = originalAmplitudeApiKey;
    }

    if (originalAmplitudeSecretKey === undefined) {
      delete process.env.AMPLITUDE_SECRET_KEY;
    } else {
      process.env.AMPLITUDE_SECRET_KEY = originalAmplitudeSecretKey;
    }

    if (originalNextPublicAmplitudeApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY = originalNextPublicAmplitudeApiKey;
    }

    if (originalCheckoutCohort === undefined) {
      delete process.env.AMPLITUDE_COHORT_CHECKOUT_ABANDONERS;
    } else {
      process.env.AMPLITUDE_COHORT_CHECKOUT_ABANDONERS = originalCheckoutCohort;
    }

    if (originalUpgradeCohort === undefined) {
      delete process.env.AMPLITUDE_COHORT_UPGRADE_CLICKERS_NO_PURCHASE;
    } else {
      process.env.AMPLITUDE_COHORT_UPGRADE_CLICKERS_NO_PURCHASE = originalUpgradeCohort;
    }
  });

  test('falls back to NEXT_PUBLIC_AMPLITUDE_API_KEY when AMPLITUDE_API_KEY is unset', async () => {
    process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY = 'public-amplitude-key';

    const { serverEnv } = await import('../../../shared/config/env');

    expect(serverEnv.AMPLITUDE_API_KEY).toBe('public-amplitude-key');
  });

  test('prefers AMPLITUDE_API_KEY when both server and public keys are set', async () => {
    process.env.AMPLITUDE_API_KEY = 'server-amplitude-key';
    process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY = 'public-amplitude-key';

    const { serverEnv } = await import('../../../shared/config/env');

    expect(serverEnv.AMPLITUDE_API_KEY).toBe('server-amplitude-key');
  });

  test('defaults AMPLITUDE_SECRET_KEY to empty when unset', async () => {
    const { serverEnv } = await import('../../../shared/config/env');

    expect(serverEnv.AMPLITUDE_SECRET_KEY).toBe('');
  });

  test('loads AMPLITUDE_SECRET_KEY when set', async () => {
    process.env.AMPLITUDE_SECRET_KEY = 'dashboard-secret-key';

    const { serverEnv } = await import('../../../shared/config/env');

    expect(serverEnv.AMPLITUDE_SECRET_KEY).toBe('dashboard-secret-key');
  });

  test('should keep amplitude recovery config server-only', async () => {
    process.env.AMPLITUDE_SECRET_KEY = 'recovery-secret-key';
    process.env.AMPLITUDE_COHORT_CHECKOUT_ABANDONERS = 'checkout-cohort';
    process.env.AMPLITUDE_COHORT_UPGRADE_CLICKERS_NO_PURCHASE = 'upgrade-cohort';

    const { clientEnv, serverEnv } = await import('../../../shared/config/env');

    expect(serverEnv.AMPLITUDE_SECRET_KEY).toBe('recovery-secret-key');
    expect(serverEnv.AMPLITUDE_COHORT_CHECKOUT_ABANDONERS).toBe('checkout-cohort');
    expect(serverEnv.AMPLITUDE_COHORT_UPGRADE_CLICKERS_NO_PURCHASE).toBe('upgrade-cohort');
    expect(clientEnv).not.toHaveProperty('AMPLITUDE_SECRET_KEY');
    expect(clientEnv).not.toHaveProperty('AMPLITUDE_COHORT_CHECKOUT_ABANDONERS');
    expect(clientEnv).not.toHaveProperty('AMPLITUDE_COHORT_UPGRADE_CLICKERS_NO_PURCHASE');
  });
});
