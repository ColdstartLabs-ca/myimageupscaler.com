import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@shared/config/env', async original => {
  const env = await original<typeof import('@shared/config/env')>();
  return { ...env, serverEnv: { ...env.serverEnv, ENV: 'production' } };
});
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn() }),
}));
import { POST } from '@/app/api/credit-estimate/route';

function request(config: Record<string, unknown>, hint?: unknown) {
  return new NextRequest('http://localhost/api/credit-estimate', {
    method: 'POST',
    headers: { 'X-User-Id': '00000000-0000-4000-8000-000000000001' },
    body: JSON.stringify({ config: { mode: 'both', scale: 2, ...config }, analysisHint: hint }),
  });
}
function account(balance: number, paid = true) {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: {
            subscription_status: paid ? 'active' : null,
            subscription_tier: paid ? 'hobby' : null,
            credits_balance: balance,
            subscription_credits_balance: balance,
            purchased_credits_balance: 0,
          },
          error: null,
        }),
      }),
    }),
  });
}

describe('Auto estimate matches the displayed durable reservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account(100);
  });
  it.each([
    { qualityTier: 'auto', selectedModel: 'auto', additionalOptions: { smartAnalysis: true } },
    { selectedModel: 'auto', additionalOptions: { smartAnalysis: true } },
  ])('quotes the same maximum before deferred model analysis for %j', async config => {
    const response = await POST(request(config, { contentType: 'document' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      breakdown: { totalCredits: 25, reservationMaximum: 25, finalChargePending: true },
      canAfford: true,
    });
  });
  it('does not promise Auto admission when the account cannot fund its maximum', async () => {
    account(24, false);
    const response = await POST(
      request({ qualityTier: 'auto', additionalOptions: { smartAnalysis: true } })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      breakdown: { totalCredits: 25 },
      canAfford: false,
    });
  });
  it('keeps explicit Quick pricing and the Smart Analysis surcharge', async () => {
    const quick = await POST(request({ qualityTier: 'quick' }));
    const smart = await POST(
      request({ qualityTier: 'quick', additionalOptions: { smartAnalysis: true } })
    );
    expect((await quick.json()).breakdown.totalCredits).toBe(1);
    expect((await smart.json()).breakdown.totalCredits).toBe(2);
  });
});
