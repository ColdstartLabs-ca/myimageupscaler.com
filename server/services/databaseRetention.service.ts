import dayjs from 'dayjs';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const DEFAULT_BATCH_SIZE = 1000;
const MAX_BATCH_SIZE = 5000;

type RetentionFilter =
  | { operator: 'eq'; column: string; value: string }
  | { operator: 'in'; column: string; values: string[] };

interface IRetentionPolicy {
  key: string;
  table: string;
  timestampColumn: string;
  retentionDays: number;
  filters: RetentionFilter[];
}

export interface IRetentionPolicyResult {
  key: string;
  table: string;
  cutoff: string;
  candidates: number;
  deleted: number;
}

export interface IDatabaseRetentionResult {
  dryRun: boolean;
  batchSize: number;
  totalCandidates: number;
  totalDeleted: number;
  policies: IRetentionPolicyResult[];
  timestamp: string;
}

export interface IDatabaseRetentionOptions {
  now?: Date;
  dryRun?: boolean;
  batchSize?: number;
}

const RETENTION_POLICIES: IRetentionPolicy[] = [
  {
    key: 'email_suppression_events',
    table: 'email_lifecycle_events',
    timestampColumn: 'occurred_at',
    retentionDays: 30,
    filters: [
      {
        operator: 'in',
        column: 'event_type',
        values: ['suppressed_frequency_cap', 'suppressed_preference'],
      },
    ],
  },
  {
    key: 'email_terminal_queue',
    table: 'email_lifecycle_queue',
    timestampColumn: 'created_at',
    retentionDays: 30,
    filters: [{ operator: 'in', column: 'status', values: ['skipped', 'cancelled', 'failed'] }],
  },
  {
    key: 'webhook_terminal_events',
    table: 'webhook_events',
    timestampColumn: 'created_at',
    retentionDays: 90,
    filters: [{ operator: 'in', column: 'status', values: ['completed', 'unrecoverable'] }],
  },
  {
    key: 'sync_completed_runs',
    table: 'sync_runs',
    timestampColumn: 'created_at',
    retentionDays: 90,
    filters: [{ operator: 'eq', column: 'status', value: 'completed' }],
  },
  {
    key: 'sync_failed_runs',
    table: 'sync_runs',
    timestampColumn: 'created_at',
    retentionDays: 180,
    filters: [{ operator: 'eq', column: 'status', value: 'failed' }],
  },
];

function normalizeBatchSize(batchSize: number | undefined, dryRun: boolean): number {
  if (!Number.isFinite(batchSize)) return DEFAULT_BATCH_SIZE;
  const maximum = dryRun ? MAX_BATCH_SIZE : DEFAULT_BATCH_SIZE;
  return Math.min(maximum, Math.max(1, Math.floor(batchSize as number)));
}

function applyFilters<
  T extends { eq(column: string, value: string): T; in(column: string, values: string[]): T },
>(query: T, filters: RetentionFilter[]): T {
  let filtered = query;
  for (const filter of filters) {
    filtered =
      filter.operator === 'eq'
        ? filtered.eq(filter.column, filter.value)
        : filtered.in(filter.column, filter.values);
  }
  return filtered;
}

export async function runDatabaseRetention(
  options: IDatabaseRetentionOptions = {}
): Promise<IDatabaseRetentionResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const batchSize = normalizeBatchSize(options.batchSize, dryRun);
  const policies: IRetentionPolicyResult[] = [];

  for (const policy of RETENTION_POLICIES) {
    const cutoff = dayjs(now).subtract(policy.retentionDays, 'day').toISOString();
    let query = supabaseAdmin.from(policy.table).select('id');
    query = applyFilters(query, policy.filters);
    const { data, error } = await query
      .lt(policy.timestampColumn, cutoff)
      .order(policy.timestampColumn, { ascending: true })
      .limit(batchSize);

    if (error) {
      throw new Error(`Failed to select ${policy.key} retention candidates: ${error.message}`);
    }

    const ids = (data ?? []).map(row => row.id as string);
    let deleted = 0;
    if (!dryRun && ids.length > 0) {
      let deleteQuery = supabaseAdmin.from(policy.table).delete();
      deleteQuery = applyFilters(deleteQuery, policy.filters);
      const { data: deletedRows, error: deleteError } = await deleteQuery
        .lt(policy.timestampColumn, cutoff)
        .in('id', ids)
        .select('id');
      if (deleteError) {
        throw new Error(
          `Failed to delete ${policy.key} retention candidates: ${deleteError.message}`
        );
      }
      deleted = deletedRows?.length ?? 0;
    }

    policies.push({
      key: policy.key,
      table: policy.table,
      cutoff,
      candidates: ids.length,
      deleted,
    });
  }

  return {
    dryRun,
    batchSize,
    totalCandidates: policies.reduce((sum, policy) => sum + policy.candidates, 0),
    totalDeleted: policies.reduce((sum, policy) => sum + policy.deleted, 0),
    policies,
    timestamp: now.toISOString(),
  };
}
