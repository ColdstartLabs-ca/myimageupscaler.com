import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENHANCEMENT_SETTINGS, type IUpscaleConfig } from '@/shared/types/coreflow.types';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  track: vi.fn(),
  uploadToSignedUrl: vi.fn(),
}));

vi.mock('@shared/utils/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: mocks.getSession,
    },
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl: mocks.uploadToSignedUrl,
      })),
    },
  })),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mocks.track,
  },
}));

import {
  parseJsonResponse,
  processImage,
  reportUpscaleEdgeFailure,
  UpscaleEdgeError,
} from '@client/utils/api-client';

const config: IUpscaleConfig = {
  qualityTier: 'quick',
  scale: 4,
  additionalOptions: DEFAULT_ENHANCEMENT_SETTINGS,
};

describe('upscale API response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uploads image bytes directly to storage before dispatching the upscale job', async () => {
    mocks.uploadToSignedUrl.mockResolvedValue({ data: { path: 'user-1/job-1.png' }, error: null });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' })
      )
      .mockResolvedValueOnce(
        Response.json({
          imageUrl: 'https://replicate.delivery/output.png',
          processing: { creditsRemaining: 4, creditsUsed: 1 },
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });

    const file = new File(['image-bytes'], 'source.png', { type: 'image/png' });
    await expect(processImage(file, config, vi.fn())).resolves.toMatchObject({
      imageUrl: 'https://replicate.delivery/output.png',
      creditsRemaining: 4,
      creditsUsed: 1,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/upscale/upload',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          filename: 'source.png',
          mimeType: 'image/png',
          sizeBytes: file.size,
          jobId: '11111111-1111-4111-8111-111111111111',
        }),
      })
    );
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledWith(
      'user-1/job-1.png',
      'signed-token',
      file,
      expect.objectContaining({ contentType: 'image/png', upsert: false })
    );

    const upscaleBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(upscaleBody).toMatchObject({
      storagePath: 'user-1/job-1.png',
      mimeType: 'image/png',
      jobId: '11111111-1111-4111-8111-111111111111',
      config,
    });
    expect(upscaleBody).not.toHaveProperty('imageData');
  });

  it('should throw UpscaleEdgeError when response is HTML', async () => {
    const response = new Response('<!DOCTYPE html><html>edge failure</html>', {
      status: 503,
      headers: {
        'content-type': 'text/html',
        'cf-ray': 'abc-123',
      },
    });

    await expect(parseJsonResponse(response)).rejects.toBeInstanceOf(UpscaleEdgeError);
  });

  it('should include cf-ray and status when edge returns HTML', async () => {
    const response = new Response('<!DOCTYPE html>'.padEnd(240, 'x'), {
      status: 503,
      headers: {
        'content-type': 'text/html',
        'cf-ray': 'abc-123',
      },
    });

    const error = await parseJsonResponse(response).catch(value => value as UpscaleEdgeError);

    expect(error).toBeInstanceOf(UpscaleEdgeError);
    expect(error.status).toBe(503);
    expect(error.rayId).toBe('abc-123');
    expect(error.bodyPreview).toHaveLength(200);
  });

  it('should use the typed edge error when the upscale response is HTML', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!DOCTYPE html><title>Worker failed</title>', {
          status: 503,
          headers: {
            'content-type': 'text/html',
            'cf-ray': 'abc-123',
          },
        })
      )
    );

    const file = new File(['image'], 'large.png', { type: 'image/png' });

    await expect(processImage(file, config, vi.fn())).rejects.toMatchObject({
      name: 'UpscaleEdgeError',
      status: 503,
      rayId: 'abc-123',
      message: 'Upscale failed (HTTP 503, ref: abc-123). Please retry.',
    });
  });

  it('should report only bounded edge metadata to the authenticated observer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await reportUpscaleEdgeFailure(
      { status: 503, rayId: 'abc-123' },
      { qualityTier: config.qualityTier, scale: config.scale }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upscale/failure-observation',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        body: JSON.stringify({
          status: 503,
          rayId: 'abc-123',
          qualityTier: 'quick',
          scale: 4,
        }),
      })
    );
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('html');
  });

  it('should keep observer delivery best-effort when the observer request fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('observer unavailable')));

    await expect(
      reportUpscaleEdgeFailure(
        { status: 503, rayId: 'abc-123' },
        { qualityTier: config.qualityTier, scale: config.scale }
      )
    ).resolves.toBeUndefined();
  });
});
