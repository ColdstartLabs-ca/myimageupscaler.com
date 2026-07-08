import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@app/api/admin/recovery-cohorts/import/route';
import { requireAdmin } from '@/server/middleware/requireAdmin';
import { getRevenueRecoveryService } from '@/server/services/revenue-recovery.service';

vi.mock('@/server/middleware/requireAdmin', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/server/services/revenue-recovery.service', () => ({
  getRevenueRecoveryService: vi.fn(),
}));

describe('POST /api/admin/recovery-cohorts/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRevenueRecoveryService).mockReturnValue({
      importAmplitudeCohort: vi.fn().mockResolvedValue({
        dryRun: true,
        cohortId: 'i1u84c2g',
        audienceKey: 'checkout_abandoner',
        totalMembers: 1,
        matchedProfiles: 1,
        unmatched: 0,
        skippedMissingEmail: 0,
        alreadyPurchased: 0,
        upsertedIntents: 0,
        queuedEmails: 0,
        duplicatePending: 0,
      }),
    } as never);
  });

  it('should return 401 when admin auth is missing', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      isAdmin: false,
      userId: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/admin/recovery-cohorts/import', {
        method: 'POST',
        body: JSON.stringify({
          cohortId: 'i1u84c2g',
          audienceKey: 'checkout_abandoner',
          dryRun: true,
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(getRevenueRecoveryService).not.toHaveBeenCalled();
  });

  it('should not persist rows during dry run', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ isAdmin: true, userId: 'admin_1' });

    const response = await POST(
      new NextRequest('http://localhost/api/admin/recovery-cohorts/import', {
        method: 'POST',
        body: JSON.stringify({
          cohortId: 'i1u84c2g',
          audienceKey: 'checkout_abandoner',
          dryRun: true,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      totalMembers: 1,
      upsertedIntents: 0,
      queuedEmails: 0,
    });
    const service = vi.mocked(getRevenueRecoveryService).mock.results[0].value;
    expect(service.importAmplitudeCohort).toHaveBeenCalledWith({
      cohortId: 'i1u84c2g',
      audienceKey: 'checkout_abandoner',
      dryRun: true,
    });
  });
});
