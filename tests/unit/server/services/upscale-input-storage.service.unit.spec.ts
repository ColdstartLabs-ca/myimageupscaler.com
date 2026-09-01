import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  list: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { storage: { from: mocks.storageFrom } },
}));

import {
  resolveUpscaleInput,
  stageGeminiOutput,
} from '@server/services/upscale-input-storage.service';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

describe('resolveUpscaleInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageFrom.mockReturnValue({
      list: mocks.list,
      upload: mocks.upload,
      remove: mocks.remove,
      createSignedUrl: mocks.createSignedUrl,
    });
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
    expect(mocks.storageFrom).toHaveBeenCalledWith('upscale-inputs');
  });

  it('rejects a ranged response before reading an oversized body', async () => {
    const arrayBuffer = vi.fn().mockRejectedValue(new Error('body should not be read'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 206,
        headers: new Headers({ 'content-length': '65538' }),
        arrayBuffer,
      })
    );

    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: 'user-1/11111111-1111-4111-8111-111111111111.png',
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).rejects.toThrow(/validation prefix is too large/i);
    expect(arrayBuffer).not.toHaveBeenCalled();
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

  it('rejects a legacy UUID-shaped input path after the UUIDv4 contract change', async () => {
    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: 'user-1/77777777-7777-7777-7777-777777777777.png',
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

describe('stageGeminiOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageFrom.mockReturnValue({
      list: mocks.list,
      upload: mocks.upload,
      remove: mocks.remove,
      createSignedUrl: mocks.createSignedUrl,
    });
    mocks.upload.mockResolvedValue({ data: { path: 'user-1/outputs/job-1.png' }, error: null });
    mocks.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl:
          'https://storage.example/object/sign/upscale-inputs/user-1/outputs/job-1.png?token=abc',
      },
      error: null,
    });
  });

  it('validates and stages Gemini inline bytes under the authenticated user outputs prefix', async () => {
    const staged = await stageGeminiOutput({
      userId: 'user-1',
      jobId: '11111111-1111-4111-8111-111111111111',
      imageData: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(staged).toEqual({
      imageUrl:
        'https://storage.example/object/sign/upscale-inputs/user-1/outputs/job-1.png?token=abc',
      mimeType: 'image/png',
      expiresAt: expect.any(Number),
      storagePath: 'user-1/outputs/11111111-1111-4111-8111-111111111111.png',
    });
    expect(mocks.storageFrom).toHaveBeenCalledWith('upscale-inputs');
    expect(mocks.upload).toHaveBeenCalledWith(
      'user-1/outputs/11111111-1111-4111-8111-111111111111.png',
      Buffer.from('89504e470d0a1a0a', 'hex'),
      {
        contentType: 'image/png',
        upsert: true,
      }
    );
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      'user-1/outputs/11111111-1111-4111-8111-111111111111.png',
      expect.any(Number)
    );
  });

  it('rejects empty, non-image, non-base64, or oversized Gemini output before upload', async () => {
    await expect(
      stageGeminiOutput({
        userId: 'user-1',
        jobId: 'job-1',
        imageData: 'data:text/html;base64,PGgxPg==',
      })
    ).rejects.toThrow(/unsupported/i);
    await expect(
      stageGeminiOutput({ userId: 'user-1', jobId: 'job-1', imageData: 'data:image/png;base64,' })
    ).rejects.toThrow(/empty/i);
    await expect(
      stageGeminiOutput({
        userId: 'user-1',
        jobId: 'job-1',
        imageData: 'data:image/png;base64,abc',
      })
    ).rejects.toThrow(/base64/i);
    await expect(
      stageGeminiOutput({
        userId: 'user-1',
        jobId: 'job-1',
        imageData: `data:image/png;base64,${Buffer.alloc(IMAGE_VALIDATION.MAX_SIZE_PAID + 1).toString('base64')}`,
      })
    ).rejects.toThrow(/too large/i);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
