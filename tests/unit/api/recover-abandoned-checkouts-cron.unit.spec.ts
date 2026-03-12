import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSendDueRecoveryEmails, mockTrackServerEvent } = vi.hoisted(() => ({
  mockSendDueRecoveryEmails: vi.fn(),
  mockTrackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    CRON_SECRET: 'test-cron-secret',
    AMPLITUDE_API_KEY: 'test-amplitude-key',
  },
}));

vi.mock('@server/services/recovery-email.service', () => ({
  sendDueRecoveryEmails: mockSendDueRecoveryEmails,
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

import { GET } from '@/app/api/cron/recover-abandoned-checkouts/route';

describe('GET /api/cron/recover-abandoned-checkouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendDueRecoveryEmails
      .mockResolvedValueOnce({ sent: 1, failed: 0, total: 1 })
      .mockResolvedValueOnce({ sent: 2, failed: 0, total: 2 })
      .mockResolvedValueOnce({ sent: 3, failed: 0, total: 3 });
  });

  it('returns 401 when the cron secret is invalid', async () => {
    const request = new NextRequest('http://localhost/api/cron/recover-abandoned-checkouts', {
      headers: {
        authorization: 'Bearer wrong-secret',
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(mockSendDueRecoveryEmails).not.toHaveBeenCalled();
  });

  it('passes dryRun through to each recovery email batch', async () => {
    const request = new NextRequest(
      'http://localhost/api/cron/recover-abandoned-checkouts?dryRun=true',
      {
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      }
    );

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockSendDueRecoveryEmails).toHaveBeenCalledTimes(3);
    expect(mockSendDueRecoveryEmails).toHaveBeenNthCalledWith(1, '1hr', { dryRun: true });
    expect(mockSendDueRecoveryEmails).toHaveBeenNthCalledWith(2, '24hr', { dryRun: true });
    expect(mockSendDueRecoveryEmails).toHaveBeenNthCalledWith(3, '72hr', { dryRun: true });
    expect(json.data.dryRun).toBe(true);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'recovery_cron_executed',
      expect.objectContaining({
        dryRun: true,
      }),
      expect.any(Object)
    );
  });
});
