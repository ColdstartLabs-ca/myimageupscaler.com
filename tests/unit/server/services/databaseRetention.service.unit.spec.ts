import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from },
}));

import { runDatabaseRetention } from '@server/services/databaseRetention.service';

type QueryCall = {
  table: string;
  mode: 'select' | 'delete';
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  lt: Array<[string, string]>;
  limit?: number;
};

const queryCalls: QueryCall[] = [];
const candidateIdsByTable: Record<string, string[]> = {};
const deletedIdsByTable: Record<string, string[]> = {};

function createQuery(table: string, mode: 'select' | 'delete') {
  const call: QueryCall = { table, mode, eq: [], in: [], lt: [] };
  queryCalls.push(call);

  const chain = {
    eq: vi.fn((column: string, value: unknown) => {
      call.eq.push([column, value]);
      return chain;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      call.in.push([column, values]);
      return chain;
    }),
    lt: vi.fn((column: string, value: string) => {
      call.lt.push([column, value]);
      return chain;
    }),
    order: vi.fn(() => chain),
    limit: vi.fn((limit: number) => {
      call.limit = limit;
      return Promise.resolve({
        data: (candidateIdsByTable[table] ?? []).map(id => ({ id })),
        error: null,
      });
    }),
    select: vi.fn(() =>
      Promise.resolve({
        data: (deletedIdsByTable[table] ?? []).map(id => ({ id })),
        error: null,
      })
    ),
  };

  return chain;
}

describe('runDatabaseRetention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCalls.length = 0;
    Object.keys(candidateIdsByTable).forEach(key => delete candidateIdsByTable[key]);
    Object.keys(deletedIdsByTable).forEach(key => delete deletedIdsByTable[key]);
    candidateIdsByTable.email_lifecycle_events = ['event-1', 'event-2'];
    candidateIdsByTable.email_lifecycle_queue = ['queue-1'];
    candidateIdsByTable.webhook_events = ['webhook-1', 'webhook-2', 'webhook-3'];
    candidateIdsByTable.sync_runs = ['sync-1'];
    deletedIdsByTable.email_lifecycle_events = ['event-1', 'event-2'];
    deletedIdsByTable.email_lifecycle_queue = ['queue-1'];
    deletedIdsByTable.webhook_events = ['webhook-1', 'webhook-2'];
    deletedIdsByTable.sync_runs = ['sync-1'];

    mocks.from.mockImplementation((table: string) => ({
      select: vi.fn(() => createQuery(table, 'select')),
      delete: vi.fn(() => createQuery(table, 'delete')),
    }));
  });

  it('applies only approved terminal-history policies in bounded batches', async () => {
    const result = await runDatabaseRetention({
      now: new Date('2026-09-21T12:00:00.000Z'),
      batchSize: 500,
    });

    expect(result.dryRun).toBe(false);
    expect(result.totalDeleted).toBe(7);
    expect(result.policies.map(policy => policy.key)).toEqual([
      'email_suppression_events',
      'email_terminal_queue',
      'webhook_terminal_events',
      'sync_completed_runs',
      'sync_failed_runs',
    ]);
    expect(
      queryCalls.filter(call => call.mode === 'select').every(call => call.limit === 500)
    ).toBe(true);

    expect(queryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'email_lifecycle_events',
          mode: 'select',
          in: [['event_type', ['suppressed_frequency_cap', 'suppressed_preference']]],
          lt: [['occurred_at', '2026-08-22T12:00:00.000Z']],
        }),
        expect.objectContaining({
          table: 'email_lifecycle_queue',
          mode: 'select',
          in: [['status', ['skipped', 'cancelled', 'failed']]],
          lt: [['created_at', '2026-08-22T12:00:00.000Z']],
        }),
        expect.objectContaining({
          table: 'webhook_events',
          mode: 'select',
          in: [['status', ['completed', 'unrecoverable']]],
          lt: [['created_at', '2026-06-23T12:00:00.000Z']],
        }),
        expect.objectContaining({
          table: 'sync_runs',
          mode: 'select',
          eq: [['status', 'completed']],
          lt: [['created_at', '2026-06-23T12:00:00.000Z']],
        }),
        expect.objectContaining({
          table: 'sync_runs',
          mode: 'select',
          eq: [['status', 'failed']],
          lt: [['created_at', '2026-03-25T12:00:00.000Z']],
        }),
      ])
    );
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'email_lifecycle_queue',
          mode: 'delete',
          in: [
            ['status', ['skipped', 'cancelled', 'failed']],
            ['id', ['queue-1']],
          ],
          lt: [['created_at', '2026-08-22T12:00:00.000Z']],
        }),
        expect.objectContaining({
          table: 'webhook_events',
          mode: 'delete',
          in: [
            ['status', ['completed', 'unrecoverable']],
            ['id', ['webhook-1', 'webhook-2', 'webhook-3']],
          ],
          lt: [['created_at', '2026-06-23T12:00:00.000Z']],
        }),
      ])
    );
  });

  it('caps destructive batches at 1000 rows per policy', async () => {
    const result = await runDatabaseRetention({
      now: new Date('2026-09-21T12:00:00.000Z'),
      batchSize: 5000,
    });

    expect(result.batchSize).toBe(1000);
    expect(
      queryCalls.filter(call => call.mode === 'select').every(call => call.limit === 1000)
    ).toBe(true);
  });

  it('reports candidates without deleting during dry-run', async () => {
    const result = await runDatabaseRetention({
      now: new Date('2026-09-21T12:00:00.000Z'),
      dryRun: true,
      batchSize: 100,
    });

    expect(result.dryRun).toBe(true);
    expect(result.totalCandidates).toBe(8);
    expect(result.totalDeleted).toBe(0);
    expect(queryCalls.some(call => call.mode === 'delete')).toBe(false);
  });
});
