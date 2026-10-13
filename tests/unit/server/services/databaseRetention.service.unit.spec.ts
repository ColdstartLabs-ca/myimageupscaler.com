import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));

import { runDatabaseRetention } from '@server/services/databaseRetention.service';

type QueryCall = {
  table: string;
  mode: 'select' | 'delete' | 'update';
  values?: Record<string, unknown>;
  eq?: [string, unknown];
  in?: [string, unknown];
  not?: [string, string, unknown];
  lt?: [string, string];
  limit?: number;
};

const queryCalls: QueryCall[] = [];
const candidateIdsByTable: Record<string, string[]> = {};
const deletedIdsByTable: Record<string, string[]> = {};

function createChain(table: string) {
  let mutated = false;
  const call: QueryCall = { table, mode: 'select' };
  queryCalls.push(call);

  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => {
    if (mutated) {
      return Promise.resolve({
        data: (deletedIdsByTable[table] ?? []).map(id => ({ id })),
        error: null,
      });
    }
    return chain;
  });
  chain.delete = vi.fn(() => {
    mutated = true;
    call.mode = 'delete';
    return chain;
  });
  chain.update = vi.fn((values: Record<string, unknown>) => {
    mutated = true;
    call.mode = 'update';
    call.values = values;
    return chain;
  });
  chain.eq = vi.fn((column: string, value: unknown) => {
    call.eq = [column, value];
    return chain;
  });
  chain.in = vi.fn((column: string, values: unknown) => {
    call.in = [column, values];
    return chain;
  });
  chain.not = vi.fn((column: string, operator: string, value: unknown) => {
    call.not = [column, operator, value];
    return chain;
  });
  chain.lt = vi.fn((column: string, value: string) => {
    call.lt = [column, value];
    return chain;
  });
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn((limit: number) => {
    call.limit = limit;
    return Promise.resolve({
      data: (candidateIdsByTable[table] ?? []).map(id => ({ id })),
      error: null,
    });
  });
  return chain;
}

const NOW = new Date('2026-09-21T12:00:00.000Z');

describe('runDatabaseRetention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCalls.length = 0;
    Object.keys(candidateIdsByTable).forEach(key => delete candidateIdsByTable[key]);
    Object.keys(deletedIdsByTable).forEach(key => delete deletedIdsByTable[key]);

    candidateIdsByTable.email_lifecycle_events = ['event-1', 'event-2'];
    candidateIdsByTable.webhook_events = ['webhook-1', 'webhook-2'];
    candidateIdsByTable.sync_runs = ['sync-1'];
    deletedIdsByTable.email_lifecycle_events = ['event-1', 'event-2'];
    deletedIdsByTable.webhook_events = ['webhook-1', 'webhook-2'];
    deletedIdsByTable.sync_runs = ['sync-1'];

    mocks.from.mockImplementation((table: string) => createChain(table));
    mocks.rpc.mockResolvedValue({ data: [{ candidates: 5, deleted: 3 }], error: null });
  });

  it('prunes terminal lifecycle queue rows by terminal age through the guarded function', async () => {
    const result = await runDatabaseRetention({ now: NOW, batchSize: 500 });

    expect(mocks.rpc).toHaveBeenCalledWith('prune_email_lifecycle_queue', {
      p_terminal_cutoff: '2026-08-22T12:00:00.000Z',
      p_attribution_cutoff: '2026-06-23T12:00:00.000Z',
      p_limit: 500,
      p_dry_run: false,
    });

    const queue = result.policies.find(policy => policy.key === 'email_terminal_queue');
    expect(queue).toEqual({
      key: 'email_terminal_queue',
      table: 'email_lifecycle_queue',
      cutoff: '2026-08-22T12:00:00.000Z',
      candidates: 5,
      deleted: 3,
    });
    expect(queryCalls.some(call => call.table === 'email_lifecycle_queue')).toBe(false);
  });

  it('tombstones old webhook payloads instead of deleting the dedupe row', async () => {
    const result = await runDatabaseRetention({ now: NOW, batchSize: 500 });

    const webhookSelect = queryCalls.find(
      call => call.table === 'webhook_events' && call.mode === 'select'
    );
    expect(webhookSelect?.not).toEqual(['payload', 'is', null]);
    expect(webhookSelect?.lt).toEqual(['created_at', '2026-06-23T12:00:00.000Z']);

    const webhookUpdate = queryCalls.find(
      call => call.table === 'webhook_events' && call.mode === 'update'
    );
    expect(webhookUpdate?.values).toEqual({ payload: null });
    // The update re-applies eligibility predicates so an intervening retry
    // (status change or new payload) cannot lose data.
    expect(webhookUpdate?.in).toEqual(['status', ['completed']]);
    expect(webhookUpdate?.not).toEqual(['payload', 'is', null]);
    expect(webhookUpdate?.lt).toEqual(['created_at', '2026-06-23T12:00:00.000Z']);
    expect(queryCalls.some(call => call.table === 'webhook_events' && call.mode === 'delete')).toBe(
      false
    );

    const webhook = result.policies.find(policy => policy.key === 'webhook_terminal_events');
    expect(webhook).toEqual({
      key: 'webhook_terminal_events',
      table: 'webhook_events',
      cutoff: '2026-06-23T12:00:00.000Z',
      candidates: 2,
      deleted: 2,
    });
  });

  it('keeps the approved policy order and bounded delete policies', async () => {
    const result = await runDatabaseRetention({ now: NOW, batchSize: 500 });

    expect(result.dryRun).toBe(false);
    expect(result.totalDeleted).toBe(2 + 3 + 2 + 1 + 1);
    expect(result.policies.map(policy => policy.key)).toEqual([
      'email_suppression_events',
      'email_terminal_queue',
      'webhook_terminal_events',
      'sync_completed_runs',
      'sync_failed_runs',
    ]);
    const selects = queryCalls.filter(call => call.mode === 'select');
    expect(selects.every(call => call.limit === 500)).toBe(true);
    expect(selects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'email_lifecycle_events',
          in: ['event_type', ['suppressed_frequency_cap', 'suppressed_preference']],
          lt: ['occurred_at', '2026-08-22T12:00:00.000Z'],
        }),
        expect.objectContaining({
          table: 'sync_runs',
          eq: ['status', 'completed'],
          lt: ['created_at', '2026-06-23T12:00:00.000Z'],
        }),
        expect.objectContaining({
          table: 'sync_runs',
          eq: ['status', 'failed'],
          lt: ['created_at', '2026-03-25T12:00:00.000Z'],
        }),
      ])
    );
  });

  it('caps destructive batches at 1000 rows per policy', async () => {
    const result = await runDatabaseRetention({ now: NOW, batchSize: 5000 });

    expect(result.batchSize).toBe(1000);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'prune_email_lifecycle_queue',
      expect.objectContaining({ p_limit: 1000 })
    );
  });

  it('chunks destructive REST .in() id lists to at most 100 ids per request', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `event-${index}`);
    candidateIdsByTable.email_lifecycle_events = ids;
    deletedIdsByTable.email_lifecycle_events = ids;

    await runDatabaseRetention({ now: NOW, batchSize: 1000 });

    const deletes = queryCalls.filter(
      call => call.table === 'email_lifecycle_events' && call.mode === 'delete'
    );
    const chunkSizes = deletes.map(call => (call.in?.[1] as string[]).length);
    expect(chunkSizes).toEqual([100, 100, 50]);
    expect(deletes.every(call => (call.in?.[1] as string[]).length <= 100)).toBe(true);
  });

  it('fails closed when the prune RPC returns malformed counts', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ candidates: 'many', deleted: 3 }], error: null });
    await expect(runDatabaseRetention({ now: NOW, batchSize: 100 })).rejects.toThrow(/Malformed/);
  });

  it('fails closed when the prune RPC returns no counts', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(runDatabaseRetention({ now: NOW, batchSize: 100 })).rejects.toThrow(/no counts/);
  });

  it('reports candidates without mutating during dry-run', async () => {
    const result = await runDatabaseRetention({ now: NOW, dryRun: true, batchSize: 100 });

    expect(result.dryRun).toBe(true);
    expect(result.totalDeleted).toBe(0);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'prune_email_lifecycle_queue',
      expect.objectContaining({ p_dry_run: true, p_limit: 100 })
    );
    expect(queryCalls.some(call => call.mode === 'delete' || call.mode === 'update')).toBe(false);
  });
});
