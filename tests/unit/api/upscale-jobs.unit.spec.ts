import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getStatus: vi.fn(), list: vi.fn() }));
vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'production', NODE_ENV: 'production' },
  clientEnv: {},
}));
vi.mock('@server/services/upscale-job.service', async original => ({
  ...(await original<typeof import('@server/services/upscale-job.service')>()),
  upscaleJobService: { getStatus: mocks.getStatus, list: mocks.list },
}));
import { GET } from '@/app/api/upscale/jobs/route';
import { applyUserRateLimit } from '@/lib/middleware/rateLimit';
import * as limiters from '@server/rateLimit';

const jobId = '11111111-1111-4111-8111-111111111111';
let account = 0;
function request(query = `jobId=${jobId}`, user = `owner-${account}`) {
  return new NextRequest(`https://example.com/api/upscale/jobs?${query}`, {
    headers: user ? { 'X-User-Id': user } : {},
  });
}

describe('owner job status and recovery traffic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    account++;
    mocks.getStatus.mockResolvedValue({
      jobId,
      stage: 'processing',
      status: 'processing',
      creditsRemaining: 79,
      timestamps: {},
    });
    mocks.list.mockResolvedValue({ jobs: [], nextCursor: null });
  });
  it('supports a polling batch without consuming new-admission capacity', async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => GET(request())));
    expect(results.every(response => response.status === 200)).toBe(true);
    expect((await limiters.upscaleRateLimit.limit(`owner-${account}`)).success).toBe(true);
  });
  it('reports authoritative balance and never caches job state', async () => {
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ jobId, creditsRemaining: 79 });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('returns503 rather than a fabricated terminal state when the status store fails', async () => {
    mocks.getStatus.mockRejectedValue(new Error('connection reset'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('stage');
  });
  it('owner-scopes lookup, validates pagination and rejects an absent session', async () => {
    expect((await GET(request('', ''))).status).toBe(401);
    expect((await GET(request('jobId=bad'))).status).toBe(400);
    expect((await GET(request('limit=51'))).status).toBe(400);
    mocks.getStatus.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(404);
    expect(mocks.getStatus).toHaveBeenCalledWith(`owner-${account}`, jobId);
    await GET(request('cursor=next-page&limit=20'));
    expect(mocks.list).toHaveBeenCalledWith(`owner-${account}`, 'next-page', 20);
  });
  it('keeps protocol2 recovery accessible after ordinary API traffic is throttled', async () => {
    const user = `middleware-owner-${account}`;
    for (let i = 0; i < 50; i++) await limiters.rateLimit.limit(user);
    const req = new NextRequest('https://example.com/api/upscale', {
      headers: { 'X-Upscale-Protocol': '2' },
    });
    const response = NextResponse.next();
    expect(await applyUserRateLimit(user, response, req)).toBeNull();
    expect(response.headers.get('X-RateLimit-Limit')).toBe('300');
  });
});
