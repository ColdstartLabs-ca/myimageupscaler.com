import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  monitor: vi.fn(),
}));

vi.mock('@server/services/upscale-completion-health.service', () => ({
  monitorUpscaleCompletionRate: mocks.monitor,
}));
vi.mock('@shared/config/env', () => ({ serverEnv: { CRON_SECRET: 'cron-secret' } }));

import { POST } from '@/app/api/cron/upscale-completion-health/route';

function request(secret = 'cron-secret'): NextRequest {
  return new NextRequest('http://localhost/api/cron/upscale-completion-health', {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });
}

describe('POST /api/cron/upscale-completion-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.monitor.mockResolvedValue(false);
  });

  it('should run the daily completion monitor after authenticated cron delivery', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, alerted: false });
    expect(mocks.monitor).toHaveBeenCalledOnce();
  });

  it('should reject an invalid cron secret', async () => {
    const response = await POST(request('wrong'));

    expect(response.status).toBe(401);
    expect(mocks.monitor).not.toHaveBeenCalled();
  });

  it('should return an operator-visible failure when the health query fails', async () => {
    mocks.monitor.mockRejectedValue(new Error('Amplitude unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Upscale completion health check failed',
    });
  });
});
