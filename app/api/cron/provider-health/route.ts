import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@server/monitoring/logger';
import { getEmailService } from '@server/services/email.service';
import {
  asyncUpscaleService,
  type IAsyncReconciliationResult,
} from '@server/services/async-upscale.service';
import { providerHealthService } from '@server/services/provider-health.service';
import { creditManager } from '@server/services/replicate/utils/credit-manager';
import { serverEnv } from '@shared/config/env';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'provider-health-cron');

  try {
    if (request.headers.get('x-cron-secret') !== serverEnv.CRON_SECRET) {
      logger.warn('Unauthorized provider health cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let asyncReconciliation: IAsyncReconciliationResult | null = null;
    let reconciliationIncomplete = false;
    try {
      asyncReconciliation = await asyncUpscaleService.reconcileDue(20, 2);
      reconciliationIncomplete = asyncReconciliation.failedCount > 0;
      logger.info('Async upscale reconciliation completed', {
        processed: asyncReconciliation.processedCount,
        failed: asyncReconciliation.failedCount,
        remaining: asyncReconciliation.remainingCount,
        oldestDueAgeMs: asyncReconciliation.oldestDueAgeMs,
      });
    } catch (error) {
      reconciliationIncomplete = true;
      logger.error('Async upscale reconciliation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    let staleReconciliation: { refundedCount: number; quarantinedCount: number } | null = null;
    try {
      staleReconciliation = await creditManager.reconcileStaleReservations(10 * 60, 100);
      logger.info('Stale credit reservation reconciliation completed', staleReconciliation);
    } catch (error) {
      reconciliationIncomplete = true;
      logger.error('Stale credit reservation reconciliation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const snapshot = await providerHealthService.claimAlert();
    if (!snapshot) {
      throw new Error('Provider health summary is unavailable');
    }

    if (!snapshot.shouldAlert) {
      logger.info('Provider health threshold not met', { ...snapshot });
      if (reconciliationIncomplete) {
        return NextResponse.json(
          {
            success: false,
            alerted: false,
            error: 'Provider reconciliation incomplete',
            asyncReconciliation,
            staleReconciliation,
            ...snapshot,
          },
          { status: 503 }
        );
      }
      return NextResponse.json({
        success: true,
        alerted: false,
        asyncReconciliation,
        staleReconciliation,
        ...snapshot,
      });
    }

    logger.error('Provider failure-rate alert', { ...snapshot });

    try {
      const delivery = await getEmailService().send({
        to: serverEnv.PROVIDER_ALERT_EMAIL,
        type: 'transactional',
        template: 'provider-incident',
        data: {
          severity: snapshot.severity || 'warning',
          attempts: snapshot.attempts,
          failures: snapshot.failures,
          failureRatioPercent: Math.round(snapshot.failureRatio * 100),
          baselineRatioPercent:
            snapshot.baselineRatio === null ? null : Math.round(snapshot.baselineRatio * 100),
          billingFailures: snapshot.billingFailures,
          circuitStatus: snapshot.circuitStatus,
        },
      });
      if (!delivery.success) {
        throw new Error(delivery.error || 'Provider incident email was not accepted');
      }
    } catch (error) {
      await providerHealthService.releaseAlertClaim();
      throw error;
    }

    if (reconciliationIncomplete) {
      return NextResponse.json(
        {
          success: false,
          alerted: true,
          error: 'Provider reconciliation incomplete',
          asyncReconciliation,
          staleReconciliation,
          ...snapshot,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({
      success: true,
      alerted: true,
      asyncReconciliation,
      staleReconciliation,
      ...snapshot,
    });
  } catch (error) {
    logger.error('Provider health cron failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Provider health check failed' },
      { status: 500 }
    );
  } finally {
    await logger.flush();
  }
}
