import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { rpc: mocks.rpc },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'production', NODE_ENV: 'production', PLAYWRIGHT_TEST: '0' },
}));

vi.mock('@shared/config/subscription.utils', () => ({
  getHourlyProcessingLimit: () => 5,
}));

import { batchLimitCheck } from '@server/services/batch-limit.service';

describe('batchLimitCheck.release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should atomically release the current hourly slot', async () => {
    mocks.rpc.mockResolvedValue({ data: 2, error: null });

    await expect(batchLimitCheck.release('c38c94d5-9b76-4d41-b94b-075f8ea65d48')).resolves.toBe(
      true
    );
    expect(mocks.rpc).toHaveBeenCalledWith('release_batch_limit_slot', {
      p_user_id: 'c38c94d5-9b76-4d41-b94b-075f8ea65d48',
      p_window_hours: 1,
    });
  });

  it('should report a failed release without throwing', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });

    await expect(batchLimitCheck.release('c38c94d5-9b76-4d41-b94b-075f8ea65d48')).resolves.toBe(
      false
    );
  });
});
