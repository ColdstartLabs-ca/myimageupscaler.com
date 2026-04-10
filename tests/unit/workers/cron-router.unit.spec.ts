import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the worker default export
import worker from '../../../workers/cron/index';

const mockEnv = {
  API_BASE_URL: 'https://myimageupscaler.com',
  CRON_SECRET: 'test-secret',
};

// ctx.waitUntil captures async work
function makeCtx() {
  const promises: Promise<void>[] = [];
  return {
    waitUntil: (p: Promise<void>) => promises.push(p),
    flush: () => Promise.all(promises),
  };
}

describe('Cron Worker Router', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps 30 4 * * * to the 3-kings sitemap endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ processed: true }),
    });
    global.fetch = fetchMock;

    const ctx = makeCtx();
    const event = { cron: '30 4 * * *', scheduledTime: Date.now() };
    await worker.scheduled(event, mockEnv, ctx);
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/refresh-3kings-sitemap',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-cron-secret': 'test-secret' }),
      }),
    );
  });

  it('maps */15 * * * * to the webhook recovery endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchMock;

    const ctx = makeCtx();
    await worker.scheduled({ cron: '*/15 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/recover-webhooks',
      expect.any(Object),
    );
  });

  it('logs an error for unknown cron patterns', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = makeCtx();
    await worker.scheduled({ cron: '0 0 1 1 *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown cron pattern'));
  });
});
