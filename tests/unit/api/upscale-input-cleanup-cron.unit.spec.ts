import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  cleanupStaleUpscaleInputs: vi.fn(),
}));

vi.mock('@server/services/galleryCleanup.service', () => ({
  cleanupStaleUpscaleInputs: mocks.cleanupStaleUpscaleInputs,
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { CRON_SECRET: 'cron-secret' },
}));

import { POST } from '@/app/api/cron/upscale-input-cleanup/route';

function request(secret = 'cron-secret', query = ''): NextRequest {
  return new NextRequest(`https://example.com/api/cron/upscale-input-cleanup${query}`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });
}

describe('POST /api/cron/upscale-input-cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cleanupStaleUpscaleInputs.mockResolvedValue({ deleted: 125, failed: 2 });
  });

  it('rejects an invalid cron secret', async () => {
    const response = await POST(request('wrong-secret'));

    expect(response.status).toBe(401);
    expect(mocks.cleanupStaleUpscaleInputs).not.toHaveBeenCalled();
  });

  it('supports authenticated dry-run reporting without deletion', async () => {
    mocks.cleanupStaleUpscaleInputs.mockResolvedValue({ deleted: 0, failed: 0, eligible: 42 });

    const response = await POST(request('cron-secret', '?dryRun=true'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.cleanupStaleUpscaleInputs).toHaveBeenCalledWith(expect.any(Date), {
      dryRun: true,
    });
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      deleted: 0,
      failed: 0,
      eligible: 42,
    });
  });

  it('runs only temporary input cleanup and returns deletion metrics', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.cleanupStaleUpscaleInputs).toHaveBeenCalledOnce();
    expect(body).toMatchObject({ success: true, deleted: 125, failed: 2 });
  });
});
