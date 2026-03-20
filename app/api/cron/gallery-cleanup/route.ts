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
    // Run the cleanup job
    const result = await runGalleryCleanup();

    const duration = Date.now() - startTime;
    console.log(
      `[CRON] Gallery cleanup complete: ${result.usersProcessed} users, ${result.imagesDeleted} images deleted in ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      cleaned: result.usersProcessed,
      imagesDeleted: result.imagesDeleted,
      timestamp: result.timestamp,
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
