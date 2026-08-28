import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eqJob: vi.fn(),
  eqUser: vi.fn(),
  eqStatus: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

import { bindReservationToWorkerRay } from '@server/services/reservation-worker-binding';

describe('reservation Worker-ray binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eqJob });
    mocks.eqJob.mockReturnValue({ eq: mocks.eqUser });
    mocks.eqUser.mockReturnValue({ eq: mocks.eqStatus });
    mocks.eqStatus.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { job_id: 'job-1' }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it('persists the server-issued ray before provider work', async () => {
    await bindReservationToWorkerRay('user-1', 'job-1', 'abc-123');

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ failure_reason: 'active_ray:abc-123' })
    );
    expect(mocks.eqJob).toHaveBeenCalledWith('job_id', 'job-1');
    expect(mocks.eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mocks.eqStatus).toHaveBeenCalledWith('status', 'processing');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refunds and fails closed when the ray cannot be bound', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'write failed' } });

    await expect(bindReservationToWorkerRay('user-1', 'job-1', 'abc-123')).rejects.toThrow(
      'Failed to bind processing reservation'
    );
    expect(mocks.rpc).toHaveBeenCalledWith('refund_processing_credit_reservation', {
      p_user_id: 'user-1',
      p_job_id: 'job-1',
      p_failure_reason: 'worker_ray_binding_failed',
    });
  });
});
