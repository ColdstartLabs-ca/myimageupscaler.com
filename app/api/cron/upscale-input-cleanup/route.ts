import { NextRequest, NextResponse } from 'next/server';
import { cleanupStaleUpscaleInputs } from '@server/services/galleryCleanup.service';
import { serverEnv } from '@shared/config/env';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get('x-cron-secret') !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
    const result = await cleanupStaleUpscaleInputs(new Date(), { dryRun });
    return NextResponse.json({
      success: true,
      dryRun,
      deleted: result.deleted,
      failed: result.failed,
      ...(typeof result.eligible === 'number' ? { eligible: result.eligible } : {}),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Temporary upscale input cleanup failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
