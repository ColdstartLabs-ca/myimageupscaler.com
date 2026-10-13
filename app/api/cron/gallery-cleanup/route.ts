/**
 * Cron Endpoint: Gallery Cleanup
 *
 * Runs daily to clean up gallery images for inactive free users.
 * Ensures database storage is consistent with the subscription state.
 *
 * Triggered by: Cloudflare Cron Trigger (daily at 00:00 UTC)
 * Schedule: 0 0 * * * (daily at midnight UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { runGalleryCleanup } from '@server/services/galleryCleanup.service';
import { queueGalleryExpiryWarnings } from '@server/services/gallery-expiry-warning.service';
import { recordCronJobSuccess } from '@server/services/cronHealth.service';

/**
 * POST handler for gallery cleanup cron job
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret for authentication
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== serverEnv.CRON_SECRET) {
    console.error('[CRON] Unauthorized cron request - invalid CRON_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CRON] Gallery cleanup job starting...');
  const startTime = Date.now();

  try {
    const warnings = await queueGalleryExpiryWarnings();
    if (warnings.failed > 0) throw new Error(`Failed to queue ${warnings.failed} gallery warnings`);
    // Run the cleanup job
    const result = await runGalleryCleanup();
    await recordCronJobSuccess('gallery-cleanup', {
      warned: warnings.warned,
      deleted: result.imagesDeleted,
      failed: result.failed,
    });

    const duration = Date.now() - startTime;
    console.log(
      `[CRON] Gallery cleanup complete: ${result.imagesProcessed} processed, ${result.imagesDeleted} deleted, ${result.recovered} recovered, ${result.failed} failed in ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      cleaned: result.imagesDeleted,
      imagesProcessed: result.imagesProcessed,
      imagesDeleted: result.imagesDeleted,
      recovered: result.recovered,
      failed: result.failed,
      warned: warnings.warned,
      timestamp: result.timestamp,
      deletionDisabled: result.deletionDisabled,
      reason: result.reason,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Gallery cleanup failed:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
