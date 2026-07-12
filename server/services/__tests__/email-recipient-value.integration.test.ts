import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ITestState {
  queueRows: Array<Record<string, unknown>>;
  queuePageCalls: number;
  queueLimits: number[];
  runInsert?: Record<string, unknown>;
  runUpdate?: Record<string, unknown>;
  itemInserts: Array<Array<Record<string, unknown>>>;
  queueUpdates: number;
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  runRow: Record<string, unknown> | null;
}

const testState = vi.hoisted<ITestState>(() => ({
  queueRows: [],
  queuePageCalls: 0,
  queueLimits: [],
  itemInserts: [],
  queueUpdates: 0,
  rpcCalls: [],
  runRow: null,
}));

function makeChain(table: string, operation: string, _selectColumns = '') {
  const chain: Record<string, unknown> = {};
  const methods = ['eq', 'gt', 'gte', 'in', 'order', 'limit', 'select'];
  for (const method of methods) {
    chain[method] = vi.fn((...args: unknown[]) => {
      if (method === 'limit' && typeof args[0] === 'number') testState.queueLimits.push(args[0]);
      return chain;
    });
  }
  chain.maybeSingle = vi.fn(async () => ({ data: testState.runRow, error: null }));
  chain.single = vi.fn(async () => ({ data: testState.runRow, error: null }));
  chain.then = (resolve: (value: unknown) => unknown) => {
    let data: unknown = [];
    if (table === 'email_lifecycle_queue' && operation === 'select') {
      const index = testState.queuePageCalls++;
      data = index < testState.queueRows.length ? [testState.queueRows[index]] : [];
    } else if (table === 'email_lifecycle_campaigns') {
      data = [
        {
          key: 'campaign-a',
          email_type: 'marketing',
          preference_key: 'marketing_emails',
          priority: 'lifecycle',
          sort_priority: 50,
        },
      ];
    } else if (table === 'profiles') {
      data = [{ id: 'user-1', signup_country: 'PH', subscription_status: null }];
    } else if (table === 'email_preferences') {
      data = [
        {
          user_id: 'user-1',
          marketing_emails: true,
          product_updates: true,
          low_credit_alerts: true,
        },
      ];
    } else if (table === 'email_queue_pruning_runs' && operation === 'insert') {
      data = [];
    } else if (table === 'email_queue_pruning_run_items' && operation === 'insert') {
      data = [];
    }
    return Promise.resolve(resolve({ data, error: null }));
  };
  return chain;
}

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn((columns?: string) => makeChain(table, 'select', columns)),
      insert: vi.fn((payload: unknown) => {
        if (table === 'email_queue_pruning_runs') {
          testState.runInsert = payload as Record<string, unknown>;
        }
        if (table === 'email_queue_pruning_run_items') {
          testState.itemInserts.push(payload as Array<Record<string, unknown>>);
        }
        return makeChain(table, 'insert');
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        if (table === 'email_lifecycle_queue') testState.queueUpdates += 1;
        if (table === 'email_queue_pruning_runs') testState.runUpdate = payload;
        return makeChain(table, 'update');
      }),
    })),
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      testState.rpcCalls.push({ name, args });
      if (name === 'get_email_recipient_value_performance') {
        return Promise.resolve({
          data: [
            {
              country: 'US',
              pricing_region: 'standard',
              campaign_key: 'campaign-a',
              policy_version: 'v1',
              value_band: 'high',
              classified_count: 1,
              held_count: 0,
              cancelled_count: 0,
              sent_count: 20,
              clicked_count: 5,
              returned_count: 4,
              purchased_after_email_count: 2,
              hard_bounce_count: 0,
              complaint_count: 0,
              revenue_multiplier: 1,
              evidence_status: 'insufficient_evidence',
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({
        data: {
          run_id: args.p_run_id,
          action: args.p_action,
          mode: 'applied',
          changed_count: 1,
          cancelled_count: 1,
          held_count: 0,
          kept_count: 0,
        },
        error: null,
      });
    }),
  },
}));

import { EmailRecipientValueService } from '@server/services/email-recipient-value.service';

describe('EmailRecipientValueService persistence boundaries', () => {
  beforeEach(() => {
    testState.queueRows = [
      {
        id: 'queue-1',
        campaign_key: 'campaign-a',
        user_id: 'user-1',
        scheduled_for: '2026-07-10T00:00:00.000Z',
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-10T00:00:00.000Z',
        status: 'pending',
        processing_claim_id: null,
        processing_claimed_at: null,
      },
      {
        id: 'queue-2',
        campaign_key: 'campaign-a',
        user_id: null,
        scheduled_for: '2026-07-10T00:00:00.000Z',
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-10T00:00:00.000Z',
        status: 'pending',
        processing_claim_id: null,
        processing_claimed_at: null,
      },
    ];
    testState.queuePageCalls = 0;
    testState.queueLimits = [];
    testState.runInsert = undefined;
    testState.runUpdate = undefined;
    testState.itemInserts = [];
    testState.queueUpdates = 0;
    testState.rpcCalls = [];
    testState.runRow = {
      candidate_count: 2,
      candidate_checksum: 'checksum-1',
      policy_version: 'v1',
    };
  });

  it('should page candidate reads and persist checksum/classification summaries without queue status updates', async () => {
    const result = await new EmailRecipientValueService().auditQueue({ pageSize: 1 });

    expect(result.summary.candidateCount).toBe(2);
    expect(result.summary.byCountry).toMatchObject({ PH: 1, UNKNOWN: 1 });
    expect(testState.queueLimits).toEqual([1, 1, 1]);
    expect(testState.itemInserts).toHaveLength(2);
    expect(testState.itemInserts.every(items => items.length <= 1)).toBe(true);
    expect(testState.runUpdate).toMatchObject({
      candidate_count: 2,
      candidate_checksum: result.summary.candidateChecksum,
    });
    expect(testState.queueUpdates).toBe(0);
  });

  it('should refuse an apply when the persisted expected count differs and call the guarded RPC when it matches', async () => {
    const service = new EmailRecipientValueService();

    await expect(
      service.applyRun({
        action: 'apply',
        runId: 'run-1',
        policyVersion: 'v1',
        expectedCount: 1,
      })
    ).rejects.toThrow(/expected count/);
    expect(testState.rpcCalls).toHaveLength(0);

    const result = await service.applyRun({
      action: 'apply',
      runId: 'run-1',
      policyVersion: 'v1',
      expectedCount: 2,
    });

    expect(result).toMatchObject({ runId: 'run-1', changedCount: 1, cancelledCount: 1 });
    expect(testState.rpcCalls[0]).toMatchObject({
      name: 'apply_email_recipient_value_run',
      args: {
        p_run_id: 'run-1',
        p_expected_count: 2,
        p_candidate_checksum: 'checksum-1',
        p_action: 'apply',
      },
    });
  });

  it('should expose the seven-day purchase attribution metrics from the performance RPC', async () => {
    const rows = await new EmailRecipientValueService().getPerformanceReport(
      new Date('2026-07-01T00:00:00.000Z')
    );

    expect(rows[0]).toMatchObject({
      country: 'US',
      sent_count: 20,
      purchased_after_email_count: 2,
      revenue_multiplier: 1,
    });
    expect(testState.rpcCalls.at(-1)).toMatchObject({
      name: 'get_email_recipient_value_performance',
      args: { p_since: '2026-07-01T00:00:00.000Z' },
    });
  });
});
