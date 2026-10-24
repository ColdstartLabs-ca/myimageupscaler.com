import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { runSeoLockDigest } from '@server/services/seo-lock-digest.service';
import { createSyncRun, completeSyncRun } from '@server/services/subscription-sync.service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!serverEnv.CRON_SECRET || request.headers.get('x-cron-secret') !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let runId: string | null = null;
  try {
    runId = await createSyncRun('seo_lock_digest');
    const result = await runSeoLockDigest();
    await completeSyncRun(runId, {
      status: 'completed',
      recordsProcessed: result.checked,
      metadata: result,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (runId)
      await completeSyncRun(runId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    return NextResponse.json({ success: false, error: 'SEO lock digest failed' }, { status: 500 });
  }
}
