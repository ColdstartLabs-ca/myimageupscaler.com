import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generalLimit: vi.fn(),
  statusLimit: vi.fn(),
}));

vi.mock('@server/rateLimit', () => ({
  rateLimit: { limit: mocks.generalLimit },
  publicRateLimit: { limit: vi.fn() },
  upscaleStatusRateLimit: { limit: mocks.statusLimit },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'production', NODE_ENV: 'production', PLAYWRIGHT_TEST: '0' },
}));

import { applyUserRateLimit } from '@lib/middleware/rateLimit';

function request(pathname: string): NextRequest {
  return new NextRequest(`https://example.test${pathname}`, {
    method: 'GET',
    headers: { Authorization: 'Bearer test-token' },
  });
}

function response(): NextResponse {
  return NextResponse.next();
}

describe('authenticated async-upscale status rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generalLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 10_000,
    });
    mocks.statusLimit.mockResolvedValue({
      success: true,
      remaining: 119,
      reset: Date.now() + 60_000,
    });
  });

  it('recovers an admitted job when the general admission bucket is already exhausted', async () => {
    const result = await applyUserRateLimit(
      'user-1',
      response(),
      request('/api/upscale?jobId=job')
    );

    expect(result).toBeNull();
    expect(mocks.statusLimit).toHaveBeenCalledWith('user-1');
    expect(mocks.generalLimit).not.toHaveBeenCalled();
  });

  it('returns the dedicated 120-per-minute Retry-After contract when status reads are exhausted', async () => {
    mocks.statusLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const result = await applyUserRateLimit(
      'user-1',
      response(),
      request('/api/upscale?jobId=job')
    );

    expect(result?.status).toBe(429);
    expect(result?.headers.get('X-RateLimit-Limit')).toBe('120');
    expect(result?.headers.get('Retry-After')).toBeTruthy();
  });

  it('keeps unrelated authenticated APIs on the existing general bucket', async () => {
    mocks.generalLimit.mockResolvedValue({
      success: true,
      remaining: 49,
      reset: Date.now() + 10_000,
    });

    const result = await applyUserRateLimit('user-1', response(), request('/api/profile'));

    expect(result).toBeNull();
    expect(mocks.generalLimit).toHaveBeenCalledWith('user-1');
    expect(mocks.statusLimit).not.toHaveBeenCalled();
  });
});
