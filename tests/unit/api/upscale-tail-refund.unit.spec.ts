import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: { CRON_SECRET: 'tail-secret' },
}));

import { POST } from '@/app/api/cron/upscale-tail-refund/route';

const jobId = '11111111-1111-4111-8111-111111111111';

function request(body: unknown, secret = 'tail-secret'): NextRequest {
  return new NextRequest('https://myimageupscaler.com/api/cron/upscale-tail-refund', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify(body),
  });
}

describe('POST /api/cron/upscale-tail-refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({
      data: { user_id: 'user-1', status: 'processing', failure_reason: 'active_ray:abc-123' },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it('refunds the exact processing reservation after a verified hard Worker failure', async () => {
    const response = await POST(request({ jobId, outcome: 'exceededMemory', rayId: 'abc-123' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, refunded: true });
    expect(mocks.from).toHaveBeenCalledWith('processing_credit_reservations');
    expect(mocks.eq).toHaveBeenCalledWith('job_id', jobId);
    expect(mocks.rpc).toHaveBeenCalledWith('refund_processing_credit_reservation', {
      p_user_id: 'user-1',
      p_job_id: jobId,
      p_failure_reason: 'tail_observed_exceededMemory',
    });
  });

  it('rejects callers without the shared Tail Worker secret', async () => {
    const response = await POST(request({ jobId, outcome: 'exceededMemory' }, 'wrong'));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects client-controlled status codes and non-hard outcomes', async () => {
    const response = await POST(request({ jobId, outcome: 'ok', status: 503 }));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not touch reservations that are already completed or refunded', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { user_id: 'user-1', status: 'completed', failure_reason: 'active_ray:abc-123' },
      error: null,
    });

    const response = await POST(request({ jobId, outcome: 'exception', rayId: 'abc-123' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, refunded: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when reservation lookup or atomic refund fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });

    const response = await POST(request({ jobId, outcome: 'exceededCpu', rayId: 'abc-123' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ success: false, refunded: false });
  });

  it('refuses a hard failure whose Cloudflare ray is not bound to the reservation', async () => {
    const response = await POST(
      request({ jobId, outcome: 'exceededMemory', rayId: 'different-ray' })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, refunded: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
