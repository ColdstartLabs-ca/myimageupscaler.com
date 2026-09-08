import { describe, expect, it, vi } from 'vitest';

import type { IExecutorRpc, IClaimedOutboxRow } from './advance';
import { dispatchDueOutbox } from './dispatch';

const row: IClaimedOutboxRow = {
  id: 'outbox-1',
  job_id: 'job-1',
  action: 'advance',
  generation: 3,
  payload: { jobId: 'job-1' },
};

function rpc(overrides: Partial<IExecutorRpc> = {}): IExecutorRpc {
  return {
    getExecution: vi.fn(),
    findAttemptByCorrelation: vi.fn(),
    getActiveAttempt: vi.fn(),
    getLatestTerminalAttempt: vi.fn(),
    createAttempt: vi.fn(),
    bindPrediction: vi.fn(),
    markSubmissionUnknown: vi.fn(),
    markProviderTerminal: vi.fn(),
    markReady: vi.fn(),
    settleFailure: vi.fn(),
    retryOutbox: vi.fn(async () => true),
    acknowledgeOutbox: vi.fn(async () => true),
    claimOutbox: vi.fn(async () => [row]),
    ...overrides,
  } as IExecutorRpc;
}

describe('dispatchDueOutbox', () => {
  it('claims rows, publishes deterministic tasks, and acknowledges them', async () => {
    const database = rpc();
    const publish = vi.fn(async () => undefined);

    const result = await dispatchDueOutbox({
      rpc: database,
      taskPublisher: { publish },
      claimant: 'dispatcher-1',
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    });

    expect(database.claimOutbox).toHaveBeenCalledWith({
      claimant: 'dispatcher-1',
      limit: 50,
      claimSeconds: 120,
    });
    expect(publish).toHaveBeenCalledWith({
      outboxId: 'outbox-1',
      jobId: 'job-1',
      action: 'advance',
      generation: 3,
    });
    expect(database.acknowledgeOutbox).toHaveBeenCalledWith({
      outboxId: 'outbox-1',
      claimant: 'dispatcher-1',
    });
    expect(result).toEqual({
      claimed: 1,
      published: 1,
      acknowledged: 1,
      retried: 0,
      reconciled: 0,
    });
  });

  it('retries publication failures with bounded delay and error', async () => {
    const database = rpc();
    const retryOutbox = vi.mocked(database.retryOutbox);
    const publish = vi.fn(async () => {
      throw new Error('x'.repeat(700));
    });

    const result = await dispatchDueOutbox({
      rpc: database,
      taskPublisher: { publish },
      claimant: 'dispatcher-1',
      retryDelayMs: 99 * 60_000,
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    });

    expect(retryOutbox).toHaveBeenCalledWith({
      outboxId: 'outbox-1',
      claimant: 'dispatcher-1',
      dueAt: '2026-01-01T00:05:00.000Z',
      error: 'x'.repeat(500),
    });
    expect(result).toMatchObject({ claimed: 1, published: 0, acknowledged: 0, retried: 1 });
  });

  it('runs the optional deadline reconciliation hook before claiming', async () => {
    const database = rpc();
    const events: string[] = [];
    vi.mocked(database.claimOutbox).mockImplementation(async () => {
      events.push('claim');
      return [];
    });

    const result = await dispatchDueOutbox({
      rpc: database,
      taskPublisher: { publish: vi.fn() },
      claimant: 'dispatcher-1',
      reconcileDeadlines: async () => {
        events.push('reconcile');
        return { reconciled: 2 };
      },
    });

    expect(events).toEqual(['reconcile', 'claim']);
    expect(result.reconciled).toBe(2);
  });
});
