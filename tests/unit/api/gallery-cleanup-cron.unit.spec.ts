import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runGalleryCleanup: vi.fn(),
}));

vi.mock('@server/services/galleryCleanup.service', () => ({
  runGalleryCleanup: mocks.runGalleryCleanup,
}));
vi.mock('@shared/config/env', () => ({ serverEnv: { CRON_SECRET: 'cron-secret' } }));

import { POST } from '@/app/api/cron/gallery-cleanup/route';

function request(secret = 'cron-secret'): NextRequest {
  return new NextRequest('https://example.com/api/cron/gallery-cleanup', {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });
}

describe('POST /api/cron/gallery-cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runGalleryCleanup.mockResolvedValue({
      usersProcessed: 2,
      imagesDeleted: 4,
      upscaleInputsDeleted: 3,
      upscaleInputsFailed: 0,
      results: [],
      timestamp: '2026-08-31T12:00:00.000Z',
    });
  });

  it('reports stale upscale input cleanup alongside gallery cleanup', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      cleaned: 2,
      imagesDeleted: 4,
      upscaleInputsDeleted: 3,
      upscaleInputsFailed: 0,
      timestamp: '2026-08-31T12:00:00.000Z',
    });
  });

  it('does not run cleanup without the cron secret', async () => {
    const response = await POST(request('wrong'));

    expect(response.status).toBe(401);
    expect(mocks.runGalleryCleanup).not.toHaveBeenCalled();
  });
});
