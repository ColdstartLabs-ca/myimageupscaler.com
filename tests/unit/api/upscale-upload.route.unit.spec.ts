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

import { POST } from '@/app/api/upscale/upload/route';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/upscale/upload', {
    method: 'POST',
    headers: { 'X-User-Id': 'user-1', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
});
