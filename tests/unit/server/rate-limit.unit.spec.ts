import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('rate-limit policy isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T12:00:00.000Z'));
    vi.doMock('@shared/config/env', () => ({
      serverEnv: {
        ENV: 'production',
        NODE_ENV: 'production',
        PLAYWRIGHT_TEST: '0',
      },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@shared/config/env');
  });

  it('keeps the general authenticated budget available after 120 status reads', async () => {
    const { rateLimit, upscaleStatusRateLimit } = await import('@server/rateLimit');

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await expect(upscaleStatusRateLimit.limit('user-1')).resolves.toMatchObject({
        success: true,
      });
    }

    await expect(rateLimit.limit('user-1')).resolves.toMatchObject({
      success: true,
    });
  });

  it('keeps the five-per-minute admission budget available after status reads', async () => {
    const { upscaleRateLimit, upscaleStatusRateLimit } = await import('@server/rateLimit');

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await expect(upscaleStatusRateLimit.limit('user-1')).resolves.toMatchObject({
        success: true,
      });
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(upscaleRateLimit.limit('user-1')).resolves.toMatchObject({
        success: true,
      });
    }
  });

  it('does not let a shorter general window discard status timestamps', async () => {
    const { rateLimit, upscaleStatusRateLimit } = await import('@server/rateLimit');

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await expect(upscaleStatusRateLimit.limit('user-1')).resolves.toMatchObject({
        success: true,
      });
    }

    vi.advanceTimersByTime(11_000);
    await expect(rateLimit.limit('user-1')).resolves.toMatchObject({
      success: true,
    });

    await expect(upscaleStatusRateLimit.limit('user-1')).resolves.toMatchObject({
      success: false,
    });
  });
});
