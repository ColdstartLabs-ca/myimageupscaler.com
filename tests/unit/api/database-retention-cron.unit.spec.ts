import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  runDatabaseRetention: vi.fn(),
}));

vi.mock('@server/services/databaseRetention.service', () => ({
  runDatabaseRetention: mocks.runDatabaseRetention,
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { CRON_SECRET: 'cron-secret' },
}));

import { POST } from '@/app/api/cron/database-retention/route';

function request(path = '', secret = 'cron-secret'): NextRequest {
  return new NextRequest(`https://example.com/api/cron/database-retention${path}`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });
}

describe('POST /api/cron/database-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runDatabaseRetention.mockResolvedValue({
      dryRun: false,
      batchSize: 1000,
      totalCandidates: 100,
      totalDeleted: 100,
      policies: [],
      timestamp: '2026-09-21T12:00:00.000Z',
    });
  });

  it('rejects an invalid cron secret', async () => {
    const response = await POST(request('', 'wrong-secret'));

    expect(response.status).toBe(401);
    expect(mocks.runDatabaseRetention).not.toHaveBeenCalled();
  });

  it('runs destructive retention by default for the authenticated schedule', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.runDatabaseRetention).toHaveBeenCalledWith({
      dryRun: false,
      batchSize: undefined,
    });
  });

  it('supports authenticated dry-run and bounded batch-size overrides', async () => {
    const response = await POST(request('?dryRun=true&batchSize=250'));

    expect(response.status).toBe(200);
    expect(mocks.runDatabaseRetention).toHaveBeenCalledWith({
      dryRun: true,
      batchSize: 250,
    });
  });
});
