import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENHANCEMENT_SETTINGS, type IUpscaleConfig } from '@/shared/types/coreflow.types';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@shared/utils/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: mocks.getSession,
    },
  })),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mocks.track,
  },
}));

import { parseJsonResponse, processImage, UpscaleEdgeError } from '@client/utils/api-client';

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
});
