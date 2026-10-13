import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  head: vi.fn(),
  presignGet: vi.fn(),
  deleteObject: vi.fn(),
  buildInputKey: vi.fn((storagePath: string) => `inputs/${storagePath}`),
}));

vi.mock('@server/services/r2-storage.service', () => ({
  head: mocks.head,
  presignGet: mocks.presignGet,
  deleteObject: mocks.deleteObject,
  buildInputKey: mocks.buildInputKey,
  R2_PRIVATE_BUCKET: 'miu-private',
}));

import {
  removeUpscaleInput,
  resolveUpscaleInput,
} from '@server/services/upscale-input-storage.service';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

const OBJECT_NAME = '11111111-1111-4111-8111-111111111111.png';
const STORAGE_PATH = `user-1/${OBJECT_NAME}`;

function metadataResponse(headers: Record<string, string>, status = 200): Response {
  return new Response(null, { status, headers });
}

describe('resolveUpscaleInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.head.mockResolvedValue(
      metadataResponse({ 'content-length': '1024', 'content-type': 'image/png' })
    );
    mocks.presignGet.mockResolvedValue('https://r2.example/signed');
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

  it('reads R2 metadata and returns a presigned provider URL with a bounded prefix', async () => {
    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: STORAGE_PATH,
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).resolves.toMatchObject({
      imageReference: 'https://r2.example/signed',
      validationImageData: 'iVBORw==',
      sizeBytes: 1024,
      mimeType: 'image/png',
    });

    expect(mocks.buildInputKey).toHaveBeenCalledWith(STORAGE_PATH);
    expect(mocks.head).toHaveBeenCalledWith('miu-private', `inputs/${STORAGE_PATH}`);
    expect(mocks.presignGet).toHaveBeenCalledWith('miu-private', `inputs/${STORAGE_PATH}`, 600);
    expect(fetch).toHaveBeenCalledWith(
      'https://r2.example/signed',
      expect.objectContaining({ headers: { Range: 'bytes=0-65535' } })
    );
  });

  it('rejects an object outside the authenticated user prefix without reading R2', async () => {
    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: `other-user/${OBJECT_NAME}`,
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).rejects.toThrow(/owned by the authenticated user/i);
    expect(mocks.head).not.toHaveBeenCalled();
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
    expect(mocks.head).not.toHaveBeenCalled();
  });

  it('rejects a missing object before presigning a read URL', async () => {
    mocks.head.mockResolvedValue(metadataResponse({}, 404));

    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: STORAGE_PATH,
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).rejects.toThrow(/not found/i);
    expect(mocks.presignGet).not.toHaveBeenCalled();
  });

  it('enforces actual R2 metadata size instead of the client declaration', async () => {
    mocks.head.mockResolvedValue(
      metadataResponse({
        'content-length': String(IMAGE_VALIDATION.MAX_SIZE_FREE + 1),
        'content-type': 'image/png',
      })
    );

    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: STORAGE_PATH,
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).rejects.toThrow(/upload limit/i);
    expect(mocks.presignGet).not.toHaveBeenCalled();
  });

  it('rejects a content-encoded object before validation or the provider URL', async () => {
    mocks.head.mockResolvedValue(
      metadataResponse({
        'content-length': '1024',
        'content-type': 'image/png',
        'content-encoding': 'gzip',
      })
    );

    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: STORAGE_PATH,
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).rejects.toThrow(/content-encoded/i);
    expect(mocks.presignGet).not.toHaveBeenCalled();
  });

  it('rejects a stored MIME type that differs from the claimed type', async () => {
    mocks.head.mockResolvedValue(
      metadataResponse({ 'content-length': '1024', 'content-type': 'image/webp' })
    );

    await expect(
      resolveUpscaleInput({
        userId: 'user-1',
        storagePath: STORAGE_PATH,
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).rejects.toThrow(/MIME type/i);
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
        storagePath: STORAGE_PATH,
        claimedMimeType: 'image/png',
        isPaidUser: false,
      })
    ).rejects.toThrow(/validation prefix is too large/i);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});

describe('removeUpscaleInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteObject.mockResolvedValue(undefined);
  });

  it('deletes the prefixed R2 input object', async () => {
    await removeUpscaleInput(STORAGE_PATH);
    expect(mocks.deleteObject).toHaveBeenCalledWith('miu-private', `inputs/${STORAGE_PATH}`);
  });

  it('refuses to delete a path that is not a user-owned input', async () => {
    await expect(removeUpscaleInput('saved/other-user/image.png')).rejects.toThrow(
      /owned by the authenticated user/i
    );
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});

describe('input storage no longer uses Supabase Storage', () => {
  it('does not reference the Supabase client', () => {
    const source = readFileSync('server/services/upscale-input-storage.service.ts', 'utf8');
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toMatch(/storage\.from\(/);
  });
});
