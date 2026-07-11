import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: fromMock },
}));

import {
  revenueRolloutBucket,
  isRevenueFeatureEligible,
} from '@server/services/revenue-feature-rollout.service';

function queryResult(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const query = {
    select: () => query,
    eq: () => query,
    like: () => query,
    limit: () => query,
    maybeSingle: () => result,
  };
  return query;
}

describe('revenue feature rollout', () => {
  beforeEach(() => fromMock.mockReset());

  it('fails closed when the kill switch is disabled', async () => {
    fromMock.mockReturnValueOnce(
      queryResult({ auto_top_up_enabled: false, auto_top_up_percent: 100 })
    );

    await expect(isRevenueFeatureEligible('user-1', 'auto_top_up')).resolves.toBe(false);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('always includes staff while enabled', async () => {
    fromMock
      .mockReturnValueOnce(
        queryResult({ repeat_purchase_enabled: true, repeat_purchase_percent: 0 })
      )
      .mockReturnValueOnce(queryResult({ role: 'admin' }));

    await expect(isRevenueFeatureEligible('staff-1', 'repeat_purchase')).resolves.toBe(true);
  });

  it('uses a stable percentage bucket only for prior pack buyers', async () => {
    const percent = revenueRolloutBucket('buyer-1') + 1;
    fromMock
      .mockReturnValueOnce(queryResult({ auto_top_up_enabled: true, auto_top_up_percent: percent }))
      .mockReturnValueOnce(queryResult({ role: 'user' }))
      .mockReturnValueOnce(queryResult({ id: 'purchase-1' }));

    await expect(isRevenueFeatureEligible('buyer-1', 'auto_top_up')).resolves.toBe(true);
    expect(revenueRolloutBucket('buyer-1')).toBe(revenueRolloutBucket('buyer-1'));
  });

  it('excludes users without a genuine prior pack purchase', async () => {
    fromMock
      .mockReturnValueOnce(queryResult({ auto_top_up_enabled: true, auto_top_up_percent: 100 }))
      .mockReturnValueOnce(queryResult({ role: 'user' }))
      .mockReturnValueOnce(queryResult(null));

    await expect(isRevenueFeatureEligible('user-2', 'auto_top_up')).resolves.toBe(false);
  });
});
