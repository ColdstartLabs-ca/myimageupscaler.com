import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const processEligible = vi.hoisted(() => vi.fn());
vi.mock('@server/services/auto-top-up.service', () => ({
  getAutoTopUpService: () => ({ processEligible }),
}));
vi.mock('@shared/config/env', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/env')>();
  return { ...actual, serverEnv: { ...actual.serverEnv, CRON_SECRET: 'cron-test' } };
});

import { POST } from '@app/api/cron/auto-top-up/route';

describe('auto top-up cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processEligible.mockResolvedValue({ scanned: 1, claimed: 1, paymentPending: 1, failed: 0 });
  });

  test('requires cron authentication and bounds the batch size', async () => {
    expect(
      (await POST(new NextRequest('http://localhost/api/cron/auto-top-up', { method: 'POST' })))
        .status
    ).toBe(401);
    const response = await POST(
      new NextRequest('http://localhost/api/cron/auto-top-up?limit=999', {
        method: 'POST',
        headers: { 'x-cron-secret': 'cron-test' },
      })
    );
    expect(response.status).toBe(200);
    expect(processEligible).toHaveBeenCalledWith(100);
  });
});
