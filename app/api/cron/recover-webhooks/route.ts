/**
 * Cron Endpoint: Recover Failed Webhooks
 *
 * Runs every 15 minutes to retry processing failed webhook events.
 * Fetches fresh event data from Stripe and re-processes using existing handlers.
 *
 * Triggered by: Cloudflare Cron Trigger (every 15 minutes)
 * Schedule: "star-slash-15 star star star star" (every 15 minutes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe/config';
import {
  createSyncRun,
  completeSyncRun,
  processStripeEvent,
  isStripeNotFoundError,
} from '@server/services/subscription-sync.service';

const MAX_RETRIES = 3;
const BATCH_SIZE = 50; // Process up to 50 failed events per run
const STUCK_PROCESSING_WINDOW_MS = 5 * 60 * 1000;

/**
 * POST handler for webhook recovery cron job
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret for authentication
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== serverEnv.CRON_SECRET) {
    console.error('Unauthorized cron request - invalid CRON_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CRON] Starting webhook recovery...');

  let syncRunId: string | null = null;
  let processed = 0;
  let recovered = 0;
  let unrecoverable = 0;

  try {
    // Create sync run record
    syncRunId = await createSyncRun('webhook_recovery');

    const retryableSelect =
      'id, event_id, event_type, retry_count, last_retry_at, created_at, error_message, status';
    const stuckProcessingThreshold = new Date(
      Date.now() - STUCK_PROCESSING_WINDOW_MS
    ).toISOString();

    // Retry explicitly failed events first.
    const { data: failedEvents, error: failedFetchError } = await supabaseAdmin
      .from('webhook_events')
      .select(retryableSelect)
      .eq('status', 'failed')
      .eq('recoverable', true)
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (failedFetchError) {
      throw new Error(`Failed to fetch failed webhook events: ${failedFetchError.message}`);
    }

    // Also recover events stuck in processing after the retry window.
    const { data: stuckEvents, error: stuckFetchError } = await supabaseAdmin
      .from('webhook_events')
      .select(retryableSelect)
      .eq('status', 'processing')
      .eq('recoverable', true)
      .lt('retry_count', MAX_RETRIES)
      .lt('created_at', stuckProcessingThreshold)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (stuckFetchError) {
      throw new Error(`Failed to fetch stuck webhook events: ${stuckFetchError.message}`);
    }

    const failedEventList = failedEvents ?? [];
    const stuckEventList = stuckEvents ?? [];
    const retryableEvents = [...failedEventList, ...stuckEventList]
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .slice(0, BATCH_SIZE);

    if (retryableEvents.length === 0) {
      console.log('[CRON] No failed webhook events to retry');
      await completeSyncRun(syncRunId, {
        status: 'completed',
        recordsProcessed: 0,
        recordsFixed: 0,
      });
      return NextResponse.json({ processed: 0, recovered: 0, unrecoverable: 0 });
    }

    console.log(`[CRON] Found ${retryableEvents.length} webhook events to retry`);

    // Process each failed event
    for (const event of retryableEvents) {
      processed++;

      try {
        // Fetch fresh event data from Stripe
        console.log(
          `[CRON] Retrying webhook event ${event.event_id} (attempt ${event.retry_count + 1}/${MAX_RETRIES})`
        );

        const stripeEvent = await stripe.events.retrieve(event.event_id);

        // Re-process the event using our standard processing function
        await processStripeEvent(stripeEvent);

        // Mark event as completed
        await supabaseAdmin
          .from('webhook_events')
          .update({
            status: 'completed',
            retry_count: event.retry_count + 1,
            last_retry_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .eq('id', event.id);

        console.log(`[CRON] Successfully recovered webhook event ${event.event_id}`);
        recovered++;
      } catch (error: unknown) {
        if (isStripeNotFoundError(error)) {
          // Event not found in Stripe (older than 30 days or deleted)
          console.log(
            `[CRON] Webhook event ${event.event_id} not found in Stripe - marking as unrecoverable`
          );

          await supabaseAdmin
            .from('webhook_events')
            .update({
              status: 'unrecoverable',
              recoverable: false,
              error_message: 'Event not found in Stripe (expired or invalid)',
              last_retry_at: new Date().toISOString(),
            })
            .eq('id', event.id);

          unrecoverable++;
        } else {
          // Other error - increment retry count
          const newRetryCount = event.retry_count + 1;
          const shouldMarkUnrecoverable = newRetryCount >= MAX_RETRIES;

          console.error(
            `[CRON] Error recovering webhook event ${event.event_id} (attempt ${newRetryCount}/${MAX_RETRIES}):`,
            error
          );

          await supabaseAdmin
            .from('webhook_events')
            .update({
              status: shouldMarkUnrecoverable ? 'unrecoverable' : 'failed',
              retry_count: newRetryCount,
              last_retry_at: new Date().toISOString(),
              error_message: error instanceof Error ? error.message : 'Unknown error',
              recoverable: !shouldMarkUnrecoverable,
            })
            .eq('id', event.id);

          if (shouldMarkUnrecoverable) {
            unrecoverable++;
          }
        }
      }
    }

    // Complete sync run with results
    await completeSyncRun(syncRunId, {
      status: 'completed',
      recordsProcessed: processed,
      recordsFixed: recovered,
      metadata: {
        recovered,
        unrecoverable,
      },
    });

    console.log(
      `[CRON] Webhook recovery complete: ${processed} processed, ${recovered} recovered, ${unrecoverable} unrecoverable`
    );

    return NextResponse.json({
      success: true,
      processed,
      recovered,
      unrecoverable,
      syncRunId,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Webhook recovery failed:', errorMessage);

    // Mark sync run as failed if we created one
    if (syncRunId) {
      try {
        await completeSyncRun(syncRunId, {
          status: 'failed',
          recordsProcessed: processed,
          recordsFixed: recovered,
          errorMessage,
        });
      } catch (completeError) {
        console.error('[CRON] Failed to mark sync run as failed:', completeError);
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        processed,
        recovered,
        unrecoverable,
      },
      { status: 500 }
    );
  }
}
