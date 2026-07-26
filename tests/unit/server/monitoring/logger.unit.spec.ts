import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.getCloudflareContext,
}));

vi.mock('@shared/config/env', () => ({
  isDevelopment: () => false,
  serverEnv: { BASELIME_API_KEY: 'baselime-test-key' },
}));

import { createLogger } from '@server/monitoring/logger';

describe('createLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use a Cloudflare context whose waitUntil is callable', () => {
    const waitUntil = vi.fn();
    mocks.getCloudflareContext.mockReturnValue({
      ctx: { waitUntil, passThroughOnException: vi.fn() },
    });

    const logger = createLogger(new Request('https://example.com/api/upscale'), 'upscale-api');
    const loggerContext = (
      logger as unknown as {
        ctx: { waitUntil: (promise: Promise<unknown>) => void };
      }
    ).ctx;

    expect(loggerContext.waitUntil).toBe(waitUntil);
    expect(typeof loggerContext.waitUntil).toBe('function');
  });

  it('should fail loudly when Cloudflare supplies an invalid execution context', () => {
    mocks.getCloudflareContext.mockReturnValue({ ctx: {} });

    expect(() =>
      createLogger(new Request('https://example.com/api/upscale'), 'upscale-api')
    ).toThrow('waitUntil');
  });
});
