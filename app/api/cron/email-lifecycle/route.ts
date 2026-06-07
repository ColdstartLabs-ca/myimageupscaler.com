import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== serverEnv.CRON_SECRET) {
    console.error('Unauthorized lifecycle cron request - invalid CRON_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';
  const batchSize = Number(url.searchParams.get('batchSize') || 50);
  const scanLimit = Number(url.searchParams.get('scanLimit') || 100);
  const lifecycleService = getEmailLifecycleService();

  try {
    const queuedFromEligibility = await lifecycleService.queueDailyEligibility({
      dryRun,
      limit: Number.isFinite(scanLimit) ? scanLimit : 100,
    });
    const processed = await lifecycleService.processDueQueue({
      dryRun,
      batchSize: Number.isFinite(batchSize) ? batchSize : 50,
    });

    return NextResponse.json({
      success: true,
      dryRun,
      queued: queuedFromEligibility + processed.queued,
      sent: processed.sent,
      skipped: processed.skipped,
      failed: processed.failed,
      eligible: processed.eligible,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown lifecycle cron failure';
    console.error('[CRON] Email lifecycle failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
