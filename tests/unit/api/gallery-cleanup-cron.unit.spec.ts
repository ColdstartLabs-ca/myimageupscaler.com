import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runGalleryCleanup: vi.fn(),
  queueGalleryExpiryWarnings: vi.fn(),
  recordCronJobSuccess: vi.fn(),
}));

vi.mock('@server/services/galleryCleanup.service', () => ({
  runGalleryCleanup: mocks.runGalleryCleanup,
}));
vi.mock('@shared/config/env', () => ({ serverEnv: { CRON_SECRET: 'cron-secret' } }));
vi.mock('@server/services/gallery-expiry-warning.service', () => ({
  queueGalleryExpiryWarnings: mocks.queueGalleryExpiryWarnings,
}));
vi.mock('@server/services/cronHealth.service', () => ({
  recordCronJobSuccess: mocks.recordCronJobSuccess,
}));

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
    mocks.queueGalleryExpiryWarnings.mockResolvedValue({ warned: 1, failed: 0 });
    mocks.recordCronJobSuccess.mockResolvedValue('2026-08-31T12:00:01.000Z');
    mocks.runGalleryCleanup.mockResolvedValue({
      imagesProcessed: 2,
      imagesDeleted: 4,
      recovered: 1,
      failed: 0,
      timestamp: '2026-08-31T12:00:00.000Z',
      deletionDisabled: false,
      reason: '',
    });
  });

  it('reports gallery cleanup results', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.recordCronJobSuccess).toHaveBeenCalledWith('gallery-cleanup', {
      warned: 1, deleted: 4, failed: 0,
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      cleaned: 4,
      imagesProcessed: 2,
      imagesDeleted: 4,
      recovered: 1,
      failed: 0,
      warned: 1,
      timestamp: '2026-08-31T12:00:00.000Z',
      deletionDisabled: false,
      reason: '',
    });
  });

  it('reports when deletion is disabled for missing backup proof', async () => {
    mocks.runGalleryCleanup.mockResolvedValue({
      imagesProcessed: 0,
      imagesDeleted: 0,
      recovered: 0,
      failed: 0,
      timestamp: '2026-08-31T12:00:00.000Z',
      deletionDisabled: true,
      reason: 'verified_backup_required',
    });

    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      imagesDeleted: 0,
      deletionDisabled: true,
      reason: 'verified_backup_required',
    });
  });

  it('does not run cleanup without the cron secret', async () => {
    const response = await POST(request('wrong'));

    expect(response.status).toBe(401);
    expect(mocks.runGalleryCleanup).not.toHaveBeenCalled();
    expect(mocks.queueGalleryExpiryWarnings).not.toHaveBeenCalled();
    expect(mocks.recordCronJobSuccess).not.toHaveBeenCalled();
  });

  it('queues warnings before cleanup and stops when a warning fails', async () => {
    mocks.queueGalleryExpiryWarnings.mockResolvedValue({ warned: 0, failed: 1 });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.queueGalleryExpiryWarnings).toHaveBeenCalledOnce();
    expect(mocks.runGalleryCleanup).not.toHaveBeenCalled();
    expect(mocks.recordCronJobSuccess).not.toHaveBeenCalled();
  });

  it('reports a failed durable health write instead of reporting success', async () => {
    mocks.recordCronJobSuccess.mockRejectedValue(new Error('health write failed'));
    expect((await POST(request())).status).toBe(500);
  });

  it('returns 500 and records no health when the cleanup fails', async () => {
    mocks.runGalleryCleanup.mockRejectedValue(new Error('Gallery expiry reported 1 failed item(s)'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.runGalleryCleanup).toHaveBeenCalledOnce();
    expect(mocks.recordCronJobSuccess).not.toHaveBeenCalled();
  });
});
