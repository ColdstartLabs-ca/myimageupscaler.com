import dayjs from 'dayjs';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const DEFAULT_BATCH_SIZE = 1000;
const MAX_BATCH_SIZE = 5000;

// Supabase REST encodes `.in()` ids into the request URL. A 1000-id batch is
// about 37 KB and a gateway can reject it before the query runs, so destructive
// calls chunk the ids well under that limit.
const REST_IN_CHUNK_SIZE = 100;

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

const EMAIL_QUEUE_TERMINAL_RETENTION_DAYS = 30;
const EMAIL_CLICK_ATTRIBUTION_WINDOW_DAYS = 90;
const WEBHOOK_TOMBSTONE_RETENTION_DAYS = 90;
const WEBHOOK_TOMBSTONE_STATUSES = ['completed'];

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

// Bounded select-then-delete policies with no cross-table dependencies. The
// email queue and webhook policies are handled separately below.
const DELETE_POLICIES: IRetentionPolicy[] = [
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

const syncCompletedPolicy = DELETE_POLICIES[1];
const syncFailedPolicy = DELETE_POLICIES[2];

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Malformed ${label} from prune_email_lifecycle_queue`);
  }
  return value;
}

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

async function deletePolicy(
  policy: IRetentionPolicy,
  now: Date,
  dryRun: boolean,
  batchSize: number
): Promise<IRetentionPolicyResult> {
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
    for (const chunk of chunkIds(ids, REST_IN_CHUNK_SIZE)) {
      let deleteQuery = supabaseAdmin.from(policy.table).delete();
      deleteQuery = applyFilters(deleteQuery, policy.filters);
      const { data: deletedRows, error: deleteError } = await deleteQuery
        .lt(policy.timestampColumn, cutoff)
        .in('id', chunk)
        .select('id');
      if (deleteError) {
        throw new Error(
          `Failed to delete ${policy.key} retention candidates: ${deleteError.message}`
        );
      }
      deleted += deletedRows?.length ?? 0;
    }
  }

  return { key: policy.key, table: policy.table, cutoff, candidates: ids.length, deleted };
}

/**
 * Prune terminal lifecycle queue rows by terminal age through a database
 * function that refuses to delete rows any audit, rollback, holdout or click
 * attribution dependency still needs.
 */
async function pruneEmailQueue(
  now: Date,
  dryRun: boolean,
  batchSize: number
): Promise<IRetentionPolicyResult> {
  const cutoff = dayjs(now).subtract(EMAIL_QUEUE_TERMINAL_RETENTION_DAYS, 'day').toISOString();
  const attributionCutoff = dayjs(now)
    .subtract(EMAIL_CLICK_ATTRIBUTION_WINDOW_DAYS, 'day')
    .toISOString();

  const { data, error } = await supabaseAdmin.rpc('prune_email_lifecycle_queue', {
    p_terminal_cutoff: cutoff,
    p_attribution_cutoff: attributionCutoff,
    p_limit: batchSize,
    p_dry_run: dryRun,
  });

  if (error) {
    throw new Error(`Failed to prune email_terminal_queue retention candidates: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { candidates?: number; deleted?: number }
    | null
    | undefined;

  if (!row) {
    throw new Error('prune_email_lifecycle_queue returned no counts');
  }

  return {
    key: 'email_terminal_queue',
    table: 'email_lifecycle_queue',
    cutoff,
    candidates: requireNonNegativeInteger(row.candidates, 'candidates'),
    deleted: dryRun ? 0 : requireNonNegativeInteger(row.deleted, 'deleted'),
  };
}

/**
 * After the tombstone window, keep the event_id dedupe row but drop the bulky
 * payload. Deleting the row would remove the Stripe replay guard.
 */
async function tombstoneWebhookEvents(
  now: Date,
  dryRun: boolean,
  batchSize: number
): Promise<IRetentionPolicyResult> {
  const cutoff = dayjs(now).subtract(WEBHOOK_TOMBSTONE_RETENTION_DAYS, 'day').toISOString();
  const { data, error } = await supabaseAdmin
    .from('webhook_events')
    .select('id')
    .in('status', WEBHOOK_TOMBSTONE_STATUSES)
    .not('payload', 'is', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    throw new Error(
      `Failed to select webhook_terminal_events retention candidates: ${error.message}`
    );
  }

  const ids = (data ?? []).map(row => row.id as string);
  let tombstoned = 0;
  if (!dryRun && ids.length > 0) {
    for (const chunk of chunkIds(ids, REST_IN_CHUNK_SIZE)) {
      const { data: updatedRows, error: updateError } = await supabaseAdmin
        .from('webhook_events')
        .update({ payload: null })
        .in('id', chunk)
        .in('status', WEBHOOK_TOMBSTONE_STATUSES)
        .not('payload', 'is', null)
        .lt('created_at', cutoff)
        .select('id');
      if (updateError) {
        throw new Error(`Failed to tombstone webhook_terminal_events: ${updateError.message}`);
      }
      tombstoned += updatedRows?.length ?? 0;
    }
  }

  return {
    key: 'webhook_terminal_events',
    table: 'webhook_events',
    cutoff,
    candidates: ids.length,
    deleted: tombstoned,
  };
}

export async function runDatabaseRetention(
  options: IDatabaseRetentionOptions = {}
): Promise<IDatabaseRetentionResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const batchSize = normalizeBatchSize(options.batchSize, dryRun);
  const policies: IRetentionPolicyResult[] = [];

  policies.push(await deletePolicy(DELETE_POLICIES[0], now, dryRun, batchSize));
  policies.push(await pruneEmailQueue(now, dryRun, batchSize));
  policies.push(await tombstoneWebhookEvents(now, dryRun, batchSize));
  policies.push(await deletePolicy(syncCompletedPolicy, now, dryRun, batchSize));
  policies.push(await deletePolicy(syncFailedPolicy, now, dryRun, batchSize));

  return {
    dryRun,
    batchSize,
    totalCandidates: policies.reduce((sum, policy) => sum + policy.candidates, 0),
    totalDeleted: policies.reduce((sum, policy) => sum + policy.deleted, 0),
    policies,
    timestamp: now.toISOString(),
  };
}
