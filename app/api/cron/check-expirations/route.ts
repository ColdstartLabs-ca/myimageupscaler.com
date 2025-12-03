/**
 * Cron Endpoint: Check Expired Subscriptions
 *
 * Runs hourly to detect subscriptions past their billing period and sync with Stripe.
 * Ensures database stays in sync even if webhooks fail or are delayed.
 *
 * Triggered by: Cloudflare Cron Trigger (hourly)
 * Schedule: 5 * * * * (every hour at :05)
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe/config';
import {
  createSyncRun,
  completeSyncRun,
  syncSubscriptionFromStripe,
  markSubscriptionCanceled,
  updateSubscriptionPeriod,
  getUserIdFromCustomerId,
  isStripeNotFoundError,
} from '@server/services/subscription-sync.service';

export const runtime = 'edge';

/**
 * POST handler for expiration check cron job
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret for authentication
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== serverEnv.CRON_SECRET) {
    console.error('Unauthorized cron request - invalid CRON_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CRON] Starting expiration check...');

  let syncRunId: string | null = null;
  let processed = 0;
  let fixed = 0;

  try {
    // Create sync run record
    syncRunId = await createSyncRun('expiration_check');

    // Find subscriptions that are active but past their current_period_end
    const { data: expiredSubs, error: fetchError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, current_period_end')
      .eq('status', 'active')
      .lt('current_period_end', new Date().toISOString());

    if (fetchError) {
      throw new Error(`Failed to fetch expired subscriptions: ${fetchError.message}`);
    }

    if (!expiredSubs || expiredSubs.length === 0) {
      console.log('[CRON] No expired subscriptions found');
      await completeSyncRun(syncRunId, {
        status: 'completed',
        recordsProcessed: 0,
        recordsFixed: 0,
      });
      return NextResponse.json({ processed: 0, fixed: 0 });
    }

    console.log(`[CRON] Found ${expiredSubs.length} potentially expired subscriptions`);

    // Process each expired subscription
    for (const sub of expiredSubs) {
      processed++;

      try {
        // Fetch current subscription state from Stripe (source of truth)
        const stripeSub = await stripe.subscriptions.retrieve(sub.id);

        if (stripeSub.status !== 'active') {
          // Stripe says subscription is no longer active - sync to DB
          console.log(
            `[CRON] Subscription ${sub.id} is ${stripeSub.status} in Stripe (was active in DB)`
          );

          const userId = await getUserIdFromCustomerId(stripeSub.customer as string);
          if (userId) {
            await syncSubscriptionFromStripe(userId, stripeSub);
            fixed++;
          }
        } else {
          // Stripe says it's still active - webhook was slow, update period
          console.log(
            `[CRON] Subscription ${sub.id} is still active in Stripe - updating period (webhook delayed)`
          );
          await updateSubscriptionPeriod(sub.id, stripeSub);
          fixed++;
        }
      } catch (error: any) {
        if (isStripeNotFoundError(error)) {
          // Subscription deleted in Stripe but still in our DB
          console.log(`[CRON] Subscription ${sub.id} not found in Stripe - marking as canceled`);
          await markSubscriptionCanceled(sub.user_id, sub.id);
          fixed++;
        } else {
          // Other errors - log and continue
          console.error(`[CRON] Error checking subscription ${sub.id}:`, error);
        }
      }
    }

    // Complete sync run with results
    await completeSyncRun(syncRunId, {
      status: 'completed',
      recordsProcessed: processed,
      recordsFixed: fixed,
    });

    console.log(`[CRON] Expiration check complete: ${processed} processed, ${fixed} fixed`);

    return NextResponse.json({
      success: true,
      processed,
      fixed,
      syncRunId,
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Expiration check failed:', errorMessage);

    // Mark sync run as failed if we created one
    if (syncRunId) {
      try {
        await completeSyncRun(syncRunId, {
          status: 'failed',
          recordsProcessed: processed,
          recordsFixed: fixed,
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
        fixed,
      },
      { status: 500 }
    );
  }
}
