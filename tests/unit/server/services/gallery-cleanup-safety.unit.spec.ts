import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { GALLERY_EXPIRY_ENABLED: undefined as boolean | undefined },
  runVerifiedGalleryExpiry: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('@shared/config/env', () => ({ serverEnv: mocks.env }));
vi.mock('@server/services/gallery-expiry-executor.service', () => ({
  runVerifiedGalleryExpiry: mocks.runVerifiedGalleryExpiry,
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));

import { runGalleryCleanup } from '@server/services/galleryCleanup.service';

describe('galleryCleanup.service feature gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.GALLERY_EXPIRY_ENABLED = undefined;
    mocks.runVerifiedGalleryExpiry.mockResolvedValue({
      processed: 0,
      deleted: 0,
      recovered: 0,
      failed: 0,
    });
  });

  it('disables deletion with the explicit reason when the flag is absent', async () => {
    const result = await runGalleryCleanup();

    expect(result.usersProcessed).toBeUndefined();
    expect(result).toMatchObject({
      imagesProcessed: 0,
      imagesDeleted: 0,
      recovered: 0,
      failed: 0,
      deletionDisabled: true,
      reason: 'verified_backup_required',
    });
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    expect(mocks.runVerifiedGalleryExpiry).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it('stays disabled when the flag is explicitly false', async () => {
    mocks.env.GALLERY_EXPIRY_ENABLED = false;

    const result = await runGalleryCleanup();

    expect(result.deletionDisabled).toBe(true);
    expect(result.reason).toBe('verified_backup_required');
    expect(mocks.runVerifiedGalleryExpiry).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('runs the reviewed executor and maps image counters when enabled', async () => {
    mocks.env.GALLERY_EXPIRY_ENABLED = true;
    mocks.runVerifiedGalleryExpiry.mockResolvedValue({
      processed: 5,
      deleted: 3,
      recovered: 1,
      failed: 0,
    });

    const result = await runGalleryCleanup();

    expect(mocks.runVerifiedGalleryExpiry).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      imagesProcessed: 5,
      imagesDeleted: 3,
      recovered: 1,
      failed: 0,
      deletionDisabled: false,
    });
  });

  it('keeps every zero counter when the enabled executor has nothing to do', async () => {
    mocks.env.GALLERY_EXPIRY_ENABLED = true;
    mocks.runVerifiedGalleryExpiry.mockResolvedValue({
      processed: 0,
      deleted: 0,
      recovered: 0,
      failed: 0,
    });

    const result = await runGalleryCleanup();

    expect(result).toMatchObject({
      imagesProcessed: 0,
      imagesDeleted: 0,
      recovered: 0,
      failed: 0,
      deletionDisabled: false,
    });
  });

  it('throws when the enabled executor reports failures so no success is recorded', async () => {
    mocks.env.GALLERY_EXPIRY_ENABLED = true;
    mocks.runVerifiedGalleryExpiry.mockResolvedValue({
      processed: 2,
      deleted: 1,
      recovered: 0,
      failed: 1,
    });

    await expect(runGalleryCleanup()).rejects.toThrow(/failed/i);
  });
});
