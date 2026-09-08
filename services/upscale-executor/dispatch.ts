import type { IClaimedOutboxRow, IExecutorRpc, ExecutorAction } from './advance';
import type { IExecutorTaskPublisher } from './index';

const DEFAULT_CLAIM_LIMIT = 50;
const DEFAULT_CLAIM_SECONDS = 120;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const MAX_ERROR_LENGTH = 500;

export interface IReconcileDeadlinesResult {
  reconciled?: number;
}

export interface IOutboxDispatcherOptions {
  rpc: IExecutorRpc;
  taskPublisher: IExecutorTaskPublisher;
  claimant: string;
  limit?: number;
  claimSeconds?: number;
  retryDelayMs?: number;
  maxErrorLength?: number;
  now?: () => number;
  /** Optional maintenance hook; callers may use it to enqueue deadline work. */
  reconcileDeadlines?: () => Promise<void | IReconcileDeadlinesResult>;
}

export interface IOutboxDispatchResult {
  claimed: number;
  published: number;
  acknowledged: number;
  retried: number;
  reconciled: number;
}

export interface IOutboxDispatcher {
  dispatch(): Promise<IOutboxDispatchResult>;
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.max(1, Math.min(maximum, value as number));
}

function boundedError(error: unknown, maximum: number): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, maximum);
}

function taskFromRow(row: IClaimedOutboxRow): {
  outboxId: string;
  jobId: string;
  action: ExecutorAction;
  generation: number;
} {
  return {
    outboxId: row.id,
    jobId: row.job_id,
    action: row.action,
    generation: row.generation,
  };
}

export function createOutboxDispatcher(options: IOutboxDispatcherOptions): IOutboxDispatcher {
  const limit = boundedInteger(options.limit, DEFAULT_CLAIM_LIMIT, 50);
  const claimSeconds = boundedInteger(options.claimSeconds, DEFAULT_CLAIM_SECONDS, 15 * 60);
  const retryDelayMs = boundedInteger(
    options.retryDelayMs,
    DEFAULT_RETRY_DELAY_MS,
    MAX_RETRY_DELAY_MS
  );
  const maxErrorLength = boundedInteger(options.maxErrorLength, MAX_ERROR_LENGTH, MAX_ERROR_LENGTH);
  const now = options.now ?? Date.now;

  async function retry(row: IClaimedOutboxRow, error: unknown): Promise<void> {
    await options.rpc.retryOutbox({
      outboxId: row.id,
      claimant: options.claimant,
      dueAt: new Date(now() + retryDelayMs).toISOString(),
      error: boundedError(error, maxErrorLength),
    });
  }

  return {
    async dispatch() {
      let reconciled = 0;
      if (options.reconcileDeadlines) {
        const result = await options.reconcileDeadlines();
        reconciled = result && typeof result.reconciled === 'number' ? result.reconciled : 0;
      }

      const rows = await options.rpc.claimOutbox({
        claimant: options.claimant,
        limit,
        claimSeconds,
      });
      let published = 0;
      let acknowledged = 0;
      let retried = 0;

      for (const row of rows) {
        try {
          await options.taskPublisher.publish(taskFromRow(row));
          published += 1;
          const acknowledgedRow = await options.rpc.acknowledgeOutbox({
            outboxId: row.id,
            claimant: options.claimant,
          });
          if (!acknowledgedRow) throw new Error('Outbox acknowledgement was rejected');
          acknowledged += 1;
        } catch (error) {
          retried += 1;
          await retry(row, error);
        }
      }

      return { claimed: rows.length, published, acknowledged, retried, reconciled };
    },
  };
}

export async function dispatchDueOutbox(
  options: IOutboxDispatcherOptions
): Promise<IOutboxDispatchResult> {
  return createOutboxDispatcher(options).dispatch();
}
