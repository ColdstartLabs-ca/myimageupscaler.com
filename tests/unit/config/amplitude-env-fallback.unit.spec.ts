import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('serverEnv Amplitude key fallback', () => {
  const originalAmplitudeApiKey = process.env.AMPLITUDE_API_KEY;
  const originalNextPublicAmplitudeApiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.AMPLITUDE_API_KEY;
    delete process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  });

  afterEach(() => {
    vi.resetModules();

    if (originalAmplitudeApiKey === undefined) {
      delete process.env.AMPLITUDE_API_KEY;
    } else {
      process.env.AMPLITUDE_API_KEY = originalAmplitudeApiKey;
    }

    if (originalNextPublicAmplitudeApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY = originalNextPublicAmplitudeApiKey;
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
});
