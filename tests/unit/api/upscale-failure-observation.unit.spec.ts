import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  trackServerEvent: vi.fn(),
  lookup: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@server/analytics', () => ({ trackServerEvent: mocks.trackServerEvent }));
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: { AMPLITUDE_API_KEY: 'test-amplitude-key' },
}));

import { POST } from '@/app/api/upscale/failure-observation/route';

function request(body: unknown, userId = 'user-1'): NextRequest {
  return new NextRequest('http://localhost/api/upscale/failure-observation', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-User-Id': userId,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/upscale/failure-observation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.trackServerEvent.mockResolvedValue(true);
    mocks.lookup.mockResolvedValue({
      data: { job_id: '11111111-1111-4111-8111-111111111111', stage: 'processing' },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  function durableLookup() {
    mocks.from.mockReturnValue({
      insert: mocks.insert,
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }),
    });
  }
  const jobId = '11111111-1111-4111-8111-111111111111';

  it.each(['processing', 'completed', 'failed'])(
    'keeps the authoritative %s job and projection intact',
    async stage => {
      durableLookup();
      mocks.lookup.mockResolvedValue({ data: { job_id: jobId, stage }, error: null });
      const response = await POST(request({ jobId, status: 503, rayId: 'ray-lost-response' }));
      expect(response.status).toBe(202);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.trackServerEvent).not.toHaveBeenCalled();
      if (stage === 'processing')
        expect(mocks.rpc).toHaveBeenCalledWith('request_upscale_recovery', { p_job_id: jobId });
      else expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it('does not reveal or mutate an unowned job', async () => {
    durableLookup();
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    expect((await POST(request({ jobId, status: 503 }))).status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns a retryable error when durable state is unavailable', async () => {
    durableLookup();
    mocks.lookup.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    expect((await POST(request({ jobId, status: 503 }))).status).toBe(503);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });

  it('cancels oversized chunked observations before reading the entire body', async () => {
    const cancel = vi.fn();
    let chunks = 0;
    const response = await POST(
      new NextRequest('http://localhost/api/upscale/failure-observation', {
        method: 'POST',
        headers: { 'X-User-Id': 'user-1' },
        duplex: 'half',
        body: new ReadableStream(
          {
            pull(controller) {
              chunks++;
              controller.enqueue(new Uint8Array(2049));
              if (chunks === 100) controller.close();
            },
            cancel,
          },
          { highWaterMark: 0 }
        ),
      } as RequestInit)
    );
    expect(response.status).toBe(413);
    expect(chunks).toBeLessThan(3);
    expect(cancel).toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('should write a redacted failed row and server telemetry without browser analytics consent', async () => {
    const response = await POST(
      request({ status: 503, rayId: 'abc-123', qualityTier: 'quick', scale: 4 })
    );

    expect(response.status).toBe(202);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        status: 'failed',
        error_message: 'edge_error',
        credits_charged: 0,
        settings: {
          failure_source: 'client_edge_observation',
          edge_status: 503,
          ray_id: 'abc-123',
          quality_tier: 'quick',
          scale: 4,
        },
      })
    );
    expect(mocks.trackServerEvent).toHaveBeenCalledWith(
      'processing_failed',
      expect.objectContaining({
        errorType: 'edge_error',
        reason: 'edge_error',
        retryable: true,
      }),
      expect.objectContaining({ apiKey: 'test-amplitude-key', userId: 'user-1' })
    );
    expect(JSON.stringify(mocks.insert.mock.calls[0][0])).not.toContain('bodyPreview');
  });

  it('should keep the durable row attempt independent when telemetry delivery fails', async () => {
    mocks.trackServerEvent.mockRejectedValue(new Error('analytics unavailable'));

    const response = await POST(request({ status: 502, rayId: 'ray-502' }));

    expect(response.status).toBe(503);
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it('should keep server telemetry independent when the durable row write fails', async () => {
    mocks.insert.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(request({ status: 502, rayId: 'ray-502' }));

    expect(response.status).toBe(503);
    expect(mocks.trackServerEvent).toHaveBeenCalledWith(
      'processing_failed',
      expect.any(Object),
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('should report telemetry rejection instead of acknowledging the observation', async () => {
    mocks.trackServerEvent.mockResolvedValue(false);

    const response = await POST(request({ status: 502, rayId: 'ray-502' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      rowPersisted: true,
      telemetryAccepted: false,
    });
  });

  it('should reject unauthenticated and unbounded observation payloads', async () => {
    await expect(POST(request({ status: 503 }, ''))).resolves.toMatchObject({ status: 401 });

    const response = await POST(
      request({ status: 503, rayId: 'ray-503', bodyPreview: '<html>never store this</html>' })
    );
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
