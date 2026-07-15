import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_SCAN_LIMIT = 100;
const MAX_BATCH_SIZE = 250;
const MAX_SCAN_LIMIT = 1000;

function parseBoundedInteger(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(1, Math.floor(parsed)), max);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== serverEnv.CRON_SECRET) {
    console.error('Unauthorized lifecycle cron request - invalid CRON_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';
  const batchSize = parseBoundedInteger(
    url.searchParams.get('batchSize'),
    DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE
  );
  const scanLimit = parseBoundedInteger(
    url.searchParams.get('scanLimit'),
    DEFAULT_SCAN_LIMIT,
    MAX_SCAN_LIMIT
  );
  const lifecycleService = getEmailLifecycleService();
  const startedAt = Date.now();

  try {
    console.log('[CRON] Email lifecycle started', {
      dryRun,
      batchSize,
      scanLimit,
    });

    const eligibility = await lifecycleService.queueDailyEligibilityDetailed({
      dryRun,
      limit: scanLimit,
    });
    const processed = await lifecycleService.processDueQueue({
      dryRun,
      batchSize,
    });
    const queueHealth = await lifecycleService.getQueueHealth();
    const durationMs = Date.now() - startedAt;

    console.log('[CRON] Email lifecycle completed', {
      dryRun,
      batchSize,
      scanLimit,
      queuedFromEligibility: eligibility.queued,
      lifecycleQueuedFromEligibility: eligibility.lifecycleQueued,
      recoveryEligibility: eligibility.recovery,
      sent: processed.sent,
      skipped: processed.skipped,
      failed: processed.failed,
      recipientValueBandCounts: processed.recipientValueBandCounts,
      stoppedByHealth: processed.stoppedByHealth,
      stoppedByProviderCapacity: processed.stoppedByProviderCapacity,
      duePending: queueHealth.duePending,
      oldestPendingScheduledFor: queueHealth.oldestPendingScheduledFor,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      dryRun,
      batchSize,
      scanLimit,
      queued: eligibility.queued + processed.queued,
      queuedFromEligibility: eligibility.queued,
      lifecycleQueuedFromEligibility: eligibility.lifecycleQueued,
      recoveryEligibility: eligibility.recovery,
      sent: processed.sent,
      skipped: processed.skipped,
      failed: processed.failed,
      eligible: processed.eligible,
      recipientValueBandCounts: processed.recipientValueBandCounts,
      stoppedByHealth: processed.stoppedByHealth,
      stoppedByProviderCapacity: processed.stoppedByProviderCapacity,
      duePending: queueHealth.duePending,
      oldestPendingScheduledFor: queueHealth.oldestPendingScheduledFor,
      durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown lifecycle cron failure';
    console.error('[CRON] Email lifecycle failed', {
      message,
      dryRun,
      batchSize,
      scanLimit,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
