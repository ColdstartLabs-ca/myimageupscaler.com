import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('does not declare a production lifecycle drain feature flag', () => {
    const config = readFileSync(resolve(process.cwd(), 'workers/cron/wrangler.toml'), 'utf8');
    const productionVars = config.match(/\[vars\]([\s\S]*?)\[env\.development\]/)?.[1] ?? '';
    expect(productionVars).not.toMatch(/_ENABLED\s*=/);
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
      })
    );
  });

  it('maps */15 * * * * to the webhook recovery endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ eligible: 0 }) });
    global.fetch = fetchMock;

    const ctx = makeCtx();
    await worker.scheduled({ cron: '*/15 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/recover-webhooks',
      expect.any(Object)
    );
  });

  it('maps 15 1 * * * to the daily upscale completion health endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, alerted: false }),
    });
    global.fetch = fetchMock;

    const ctx = makeCtx();
    await worker.scheduled({ cron: '15 1 * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/upscale-completion-health',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-cron-secret': 'test-secret' }),
      })
    );
  });

  it('maps 10 * * * * to the bounded email lifecycle endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchMock;

    const ctx = makeCtx();
    await worker.scheduled({ cron: '10 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/email-lifecycle?drainOnly=false&scanLimit=25&sendLimit=1',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('maps 40 * * * * to the bounded email lifecycle catch-up endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ eligible: 0 }) });
    global.fetch = fetchMock;

    const ctx = makeCtx();
    await worker.scheduled({ cron: '40 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/email-lifecycle?drainOnly=true&scanLimit=25&sendLimit=1',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('invokes lifecycle drains sequentially and never overlaps requests', async () => {
    let active = 0;
    let maximumActive = 0;
    const fetchMock = vi.fn(async () => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active--;
      return {
        ok: true,
        json: () => Promise.resolve({ success: true, eligible: 1, sent: 1, skipped: 0 }),
      };
    });
    global.fetch = fetchMock;
    const ctx = makeCtx();
    await worker.scheduled({ cron: '40 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(maximumActive).toBe(1);
  });

  it('stops the drain sequence on a provider incident', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          eligible: 1,
          sent: 0,
          skipped: 0,
          stoppedByProvider: true,
        }),
    });
    global.fetch = fetchMock;
    const ctx = makeCtx();
    await worker.scheduled({ cron: '40 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('logs an error for unknown cron patterns', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = makeCtx();
    await worker.scheduled({ cron: '0 0 1 1 *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown cron pattern'));
  });
});
