import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';

const DEFAULT_SCAN_LIMIT = 100;
const MAX_SCAN_LIMIT = 1000;
const MAX_SEND_LIMIT = 1;

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
  const drainOnly = url.searchParams.get('drainOnly') === 'true';
  const scanLimit = parseBoundedInteger(
    url.searchParams.get('scanLimit') ?? url.searchParams.get('batchSize'),
    DEFAULT_SCAN_LIMIT,
    MAX_SCAN_LIMIT
  );
  const sendLimit = parseBoundedInteger(url.searchParams.get('sendLimit'), 1, MAX_SEND_LIMIT);
  const lifecycleService = getEmailLifecycleService();
  const startedAt = Date.now();

  try {
    console.log('[CRON] Email lifecycle started', {
      dryRun,
      drainOnly,
      scanLimit,
      sendLimit,
    });

    const eligibility = drainOnly
      ? {
          queued: 0,
          lifecycleQueued: 0,
          suppressionsRecorded: 0,
          suppressionsReused: 0,
          recovery: null,
        }
      : await lifecycleService.queueDailyEligibilityDetailed({ dryRun, limit: scanLimit });
    const processed = await lifecycleService.processDueQueue({
      dryRun,
      scanLimit,
      sendLimit,
    });
    const queueHealth = await lifecycleService.getQueueHealth();
    const durationMs = Date.now() - startedAt;
    if (queueHealth.unclassified > 0) {
      console.error('[CRON] Lifecycle queue contains structurally invalid unclassified rows', {
        unclassifiedPending: queueHealth.unclassified,
      });
    }

    console.log('[CRON] Email lifecycle completed', {
      dryRun,
      drainOnly,
      scanLimit,
      sendLimit,
      queuedFromEligibility: eligibility.queued,
      lifecycleQueuedFromEligibility: eligibility.lifecycleQueued,
      suppressionsRecordedFromEligibility: eligibility.suppressionsRecorded,
      suppressionsReusedFromEligibility: eligibility.suppressionsReused,
      recoveryEligibility: eligibility.recovery,
      sent: processed.sent,
      skipped: processed.skipped,
      failed: processed.failed,
      recipientValueBandCounts: processed.recipientValueBandCounts,
      stoppedByHealth: processed.stoppedByHealth,
      stoppedByProviderCapacity: processed.stoppedByProviderCapacity,
      stoppedByProvider: processed.stoppedByProvider,
      rescheduled: processed.rescheduled,
      providerClassification: processed.providerClassification,
      attemptedProviders: processed.attemptedProviders,
      unavailableProviders: processed.unavailableProviders,
      fallbackReasons: processed.fallbackReasons,
      unclassifiedDueReturned: processed.unclassifiedDueReturned,
      providerIoMs: processed.providerIoMs,
      expiredCancelled: processed.expiredCancelled,
      holdoutReleased: processed.holdoutReleased,
      pending: queueHealth.pending,
      duePending: queueHealth.duePending,
      eligiblePending: queueHealth.eligible,
      heldPending: queueHealth.held,
      unclassifiedPending: queueHealth.unclassified,
      eligibilityStalled: queueHealth.eligibilityStalled,
      oldestPendingScheduledFor: queueHealth.oldestPendingScheduledFor,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      dryRun,
      drainOnly,
      scanLimit,
      sendLimit,
      queued: eligibility.queued + processed.queued,
      queuedFromEligibility: eligibility.queued,
      lifecycleQueuedFromEligibility: eligibility.lifecycleQueued,
      suppressionsRecordedFromEligibility: eligibility.suppressionsRecorded,
      suppressionsReusedFromEligibility: eligibility.suppressionsReused,
      recoveryEligibility: eligibility.recovery,
      sent: processed.sent,
      skipped: processed.skipped,
      failed: processed.failed,
      eligible: processed.eligible,
      recipientValueBandCounts: processed.recipientValueBandCounts,
      stoppedByHealth: processed.stoppedByHealth,
      stoppedByProviderCapacity: processed.stoppedByProviderCapacity,
      stoppedByProvider: processed.stoppedByProvider,
      rescheduled: processed.rescheduled,
      providerClassification: processed.providerClassification,
      attemptedProviders: processed.attemptedProviders,
      unavailableProviders: processed.unavailableProviders,
      fallbackReasons: processed.fallbackReasons,
      unclassifiedDueReturned: processed.unclassifiedDueReturned,
      providerIoMs: processed.providerIoMs,
      expiredCancelled: processed.expiredCancelled,
      holdoutReleased: processed.holdoutReleased,
      pending: queueHealth.pending,
      duePending: queueHealth.duePending,
      eligiblePending: queueHealth.eligible,
      heldPending: queueHealth.held,
      unclassifiedPending: queueHealth.unclassified,
      eligibilityStalled: queueHealth.eligibilityStalled,
      oldestPendingScheduledFor: queueHealth.oldestPendingScheduledFor,
      durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown lifecycle cron failure';
    console.error('[CRON] Email lifecycle failed', {
      message,
      dryRun,
      drainOnly,
      scanLimit,
      sendLimit,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
