import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUploadUrl: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));
vi.mock('@shared/config/env', () => ({ serverEnv: { ENV: 'test', NODE_ENV: 'test' } }));

import { POST } from '@/app/api/upscale/upload/route';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

function request(body: Record<string, unknown>): NextRequest {
  return requestWithUser('user-1', body);
}

function requestWithUser(userId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/upscale/upload', {
    method: 'POST',
    headers: { 'X-User-Id': userId, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function streamedRequest(chunks: Uint8Array[]): NextRequest {
  let nextChunk = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[nextChunk++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });

  return new NextRequest('http://localhost/api/upscale/upload', {
    method: 'POST',
    headers: { 'X-User-Id': 'user-1', 'content-type': 'application/json' },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('POST /api/upscale/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              subscription_status: null,
              subscription_tier: null,
              purchased_credits_balance: 0,
            },
            error: null,
          }),
        }),
      }),
    });
    mocks.storageFrom.mockReturnValue({ createSignedUploadUrl: mocks.createSignedUploadUrl });
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: { path: 'user-1/job.png', token: 'signed-token' },
      error: null,
    });
  });

  it('issues a user-scoped signed upload token for an allowed image', async () => {
    const response = await POST(
      request({
        filename: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        jobId: '11111111-1111-4111-8111-111111111111',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      storagePath: 'user-1/11111111-1111-4111-8111-111111111111.png',
      uploadToken: 'signed-token',
    });
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(
      'user-1/11111111-1111-4111-8111-111111111111.png',
      { upsert: false }
    );
    expect(mocks.storageFrom).toHaveBeenCalledWith('upscale-inputs');
  });

  it('rejects a declared file above the free-tier limit before granting upload', async () => {
    const response = await POST(
      request({
        filename: 'large.png',
        mimeType: 'image/png',
        sizeBytes: IMAGE_VALIDATION.MAX_SIZE_FREE + 1,
        jobId: '11111111-1111-4111-8111-111111111111',
      })
    );

    expect(response.status).toBe(413);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('grants a paid upload for the reported 10.05 MiB JPEG regression', async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              subscription_status: 'active',
              subscription_tier: 'pro',
              purchased_credits_balance: 0,
            },
            error: null,
          }),
        }),
      }),
    });

    const response = await POST(
      request({
        filename: 'os-x-yosemite-half-dome-yosemite-national-park-yosemite-4832x2718-4047.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10_539_824,
        jobId: '11111111-1111-4111-8111-111111111111',
      })
    );

    expect(response.status).toBe(200);
  });

  it('rejects an oversized chunked grant body before account or storage access', async () => {
    const response = await POST(
      streamedRequest([new Uint8Array(8 * 1024), new Uint8Array([0x7b])])
    );

    expect(response.status).toBe(413);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects inline imageData instead of silently stripping it', async () => {
    const response = await POST(
      request({
        filename: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        jobId: '11111111-1111-4111-8111-111111111111',
        imageData: 'data:image/png;base64,large-inline-payload',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects UUID-shaped job IDs that are not UUIDv4', async () => {
    const response = await POST(
      request({
        filename: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        jobId: '77777777-7777-7777-7777-777777777777',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('serves test mock users without a database profile', async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
        }),
      }),
    });

    const response = await POST(
      requestWithUser('mock_user_12345678-1234-4234-8234-123456789012', {
        filename: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        jobId: '11111111-1111-4111-8111-111111111111',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      storagePath:
        'mock_user_12345678-1234-4234-8234-123456789012/11111111-1111-4111-8111-111111111111.png',
      uploadToken: 'signed-token',
    });
  });

  it('derives a paid tier for subscribed test mock users', async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
        }),
      }),
    });

    const response = await POST(
      requestWithUser('mock_user_12345678-1234-4234-8234-123456789012_sub_active_pro', {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: IMAGE_VALIDATION.MAX_SIZE_FREE + 1024,
        jobId: '11111111-1111-4111-8111-111111111111',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.createSignedUploadUrl).toHaveBeenCalled();
  });

  it('still requires a database profile for non-mock users when the lookup fails', async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
        }),
      }),
    });

    const response = await POST(
      requestWithUser('real-user-id', {
        filename: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        jobId: '11111111-1111-4111-8111-111111111111',
      })
    );

    expect(response.status).toBe(503);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
