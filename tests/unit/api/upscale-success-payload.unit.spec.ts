import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getReplay: vi.fn(), admit: vi.fn(), from: vi.fn() }));
vi.mock('@server/services/upscale-job.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@server/services/upscale-job.service')>()),
  upscaleJobService: { getReplay: mocks.getReplay, admit: mocks.admit },
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn() }),
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'test' },
  clientEnv: {},
  isProduction: () => false,
}));

import { POST } from '@/app/api/upscale/route';

const jobId = '11111111-1111-4111-8111-111111111111';
function request() {
  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: {
      'X-User-Id': 'user-1',
      'X-Upscale-Protocol': '2',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jobId,
      storagePath: 'user-1/' + jobId + '.png',
      mimeType: 'image/png',
      config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
    }),
  });
}

describe('POST /api/upscale success payload security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getReplay.mockResolvedValue({
      jobId,
      stage: 'queued',
      exactCharge: 1,
      creditsRemaining: 19,
      statusUrl: '/api/upscale/jobs?jobId=' + jobId,
      retryAfterMs: 2000,
      httpStatus: 202,
      imageUrl: 'https://replicate.delivery/private-result.png',
      imageData: 'data:image/png;base64,private-output',
      deliveryToken: 'private-output-capability',
    });
  });

  it('returns the durable job identity without provider bytes, URLs or output capabilities', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      success: true,
      accepted: true,
      jobId,
      status: 'queued',
      statusUrl: '/api/upscale/jobs?jobId=' + jobId,
      retryAfterMs: 2000,
      processing: { reservationJobId: jobId, creditsUsed: 1, creditsRemaining: 19 },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /replicate|imageUrl|imageData|deliveryToken|private-output/
    );
    expect(mocks.admit).not.toHaveBeenCalled();
  });

  it('marks the admission response as non-cacheable, referrer-safe and protocol versioned', async () => {
    const response = await POST(request());

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Upscale-Protocol')).toBe('2');
    expect(response.headers.get('Retry-After')).toBe('2');
  });
});
