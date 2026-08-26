import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  list: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { storage: { from: mocks.storageFrom } },
}));

import { resolveUpscaleInput } from '@server/services/upscale-input-storage.service';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

describe('resolveUpscaleInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageFrom.mockReturnValue({ list: mocks.list, createSignedUrl: mocks.createSignedUrl });
    mocks.list.mockResolvedValue({
      data: [
        {
          name: '11111111-1111-4111-8111-111111111111.png',
          metadata: { size: 1024, mimetype: 'image/png' },
        },
      ],
      error: null,
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example/signed' },
      error: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 206,
          headers: { 'content-length': '4' },
        })
      )
    );
  });

  it('returns a signed provider URL and bounded validation prefix for a user-owned object', async () => {
    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: 'user-1/11111111-1111-4111-8111-111111111111.png',
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).resolves.toMatchObject({
      imageReference: 'https://storage.example/signed',
      validationImageData: 'iVBORw==',
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://storage.example/signed',
      expect.objectContaining({ headers: { Range: 'bytes=0-65535' } })
    );
  });

  it('rejects an object outside the authenticated user prefix', async () => {
    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: 'other-user/job.png',
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).rejects.toThrow(/owned by the authenticated user/i);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('enforces actual storage metadata instead of the client declaration', async () => {
    mocks.list.mockResolvedValue({
      data: [
        {
          name: '11111111-1111-4111-8111-111111111111.png',
          metadata: { size: IMAGE_VALIDATION.MAX_SIZE_FREE + 1, mimetype: 'image/png' },
        },
      ],
      error: null,
    });

    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: 'user-1/11111111-1111-4111-8111-111111111111.png',
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).rejects.toThrow(/upload limit/i);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
});
