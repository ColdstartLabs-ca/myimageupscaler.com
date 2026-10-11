import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Import the worker default export
import worker, { evaluateCronResult } from '../../../workers/cron/index';

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

  it('sends the cron secret from the manual trigger script', () => {
    const script = readFileSync(
      resolve(process.cwd(), 'workers/cron/scripts/test-trigger.js'),
      'utf8'
    );
    expect(script).toContain('process.env.CRON_SECRET');
    expect(script).toMatch(/['"]x-cron-secret['"]\s*:/);
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

  it('maps 25 * * * * to bounded database retention', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, totalDeleted: 500 }),
    });
    global.fetch = fetchMock;

    const ctx = makeCtx();
    await worker.scheduled({ cron: '25 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/database-retention',
      expect.any(Object)
    );
  });

  it('maps 0 2 * * * to the daily quota guard endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, alertCount: 0 }),
    });
    global.fetch = fetchMock;

    const ctx = makeCtx();
    await worker.scheduled({ cron: '0 2 * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/quota-guard',
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

  it('rejects unauthenticated manual triggers before scheduling destructive jobs', async () => {
    const ctx = makeCtx();
    const response = await worker.fetch(
      new Request('https://cron.example.com/trigger?pattern=25%20*%20*%20*%20*', {
        method: 'POST',
      }),
      mockEnv,
      ctx
    );

    expect(response.status).toBe(401);
    await ctx.flush();
  });

  it('accepts authenticated manual triggers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, totalDeleted: 0 }),
    });
    global.fetch = fetchMock;
    const ctx = makeCtx();
    const response = await worker.fetch(
      new Request('https://cron.example.com/trigger?pattern=25%20*%20*%20*%20*', {
        method: 'POST',
        headers: { 'x-cron-secret': 'test-secret' },
      }),
      mockEnv,
      ctx
    );

    expect(response.status).toBe(200);
    await ctx.flush();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/database-retention',
      expect.any(Object)
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

describe('evaluateCronResult', () => {
  it('treats a non-OK HTTP response as a failure', () => {
    expect(evaluateCronResult('/api/cron/database-retention', 500, false, null)).toEqual({
      failed: true,
      reason: 'HTTP 500',
    });
  });

  it('treats a body without counts as a failure', () => {
    expect(
      evaluateCronResult('/api/cron/database-retention', 200, true, { success: true })
    ).toEqual({ failed: true, reason: 'missing counts' });
    expect(evaluateCronResult('/api/cron/quota-guard', 200, true, {})).toEqual({
      failed: true,
      reason: 'missing counts',
    });
  });

  it('treats success=false as a failure', () => {
    expect(
      evaluateCronResult('/api/cron/database-retention', 200, true, {
        success: false,
        totalDeleted: 0,
      })
    ).toEqual({ failed: true, reason: 'success=false' });
  });

  it('treats failed > 0 as a failure even with HTTP 200', () => {
    expect(
      evaluateCronResult('/api/cron/database-retention', 200, true, {
        success: true,
        totalDeleted: 10,
        failed: 3,
      })
    ).toEqual({ failed: true, reason: 'failed=3' });
  });

  it('fails closed on a malformed failed count', () => {
    expect(
      evaluateCronResult('/api/cron/database-retention', 200, true, {
        success: true,
        totalDeleted: 1,
        failed: '3',
      })
    ).toEqual({ failed: true, reason: 'invalid failed count' });
    expect(
      evaluateCronResult('/api/cron/database-retention', 200, true, {
        success: true,
        totalDeleted: 1,
        failed: -1,
      })
    ).toEqual({ failed: true, reason: 'invalid failed count' });
  });

  it('fails closed on a malformed required count', () => {
    expect(
      evaluateCronResult('/api/cron/database-retention', 200, true, {
        success: true,
        totalDeleted: -1,
      })
    ).toEqual({ failed: true, reason: 'missing counts' });
    expect(
      evaluateCronResult('/api/cron/database-retention', 200, true, {
        success: true,
        totalDeleted: 1.5,
      })
    ).toEqual({ failed: true, reason: 'missing counts' });
  });

  it('requires the quota guard alert count', () => {
    expect(evaluateCronResult('/api/cron/quota-guard', 200, true, { success: true })).toEqual({
      failed: true,
      reason: 'missing counts',
    });
    expect(
      evaluateCronResult('/api/cron/quota-guard', 200, true, { success: true, alertCount: 0 })
    ).toEqual({ failed: false });
  });

  it('passes a measured result with zero failures', () => {
    expect(
      evaluateCronResult('/api/cron/database-retention', 200, true, {
        success: true,
        totalDeleted: 0,
      })
    ).toEqual({ failed: false });
    expect(
      evaluateCronResult('/api/cron/quota-guard', 200, true, { success: true, alertCount: 0 })
    ).toEqual({ failed: false });
  });
});

describe('Cron Worker partial failure reporting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a job as failed when the body has failed > 0', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, totalDeleted: 10, failed: 3 }),
    } as unknown as Response);

    const ctx = makeCtx();
    await worker.scheduled({ cron: '25 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Database Retention reported failure'),
      expect.objectContaining({ data: expect.objectContaining({ failed: 3 }) })
    );
  });

  it('reports a job as failed when the body has no counts', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as unknown as Response);

    const ctx = makeCtx();
    await worker.scheduled({ cron: '25 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Database Retention reported failure'),
      expect.objectContaining({ data: expect.objectContaining({ success: true }) })
    );
  });

  it('does not report a failure for a measured zero-failure result', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, totalDeleted: 0 }),
    } as unknown as Response);

    const ctx = makeCtx();
    await worker.scheduled({ cron: '25 * * * *', scheduledTime: Date.now() }, mockEnv, ctx);
    await ctx.flush();

    expect(consoleError).not.toHaveBeenCalled();
  });
});
