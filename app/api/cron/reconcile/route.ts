/**
 * Cron Endpoint: Full Subscription Reconciliation
 *
 * Runs daily to perform comprehensive comparison between database and Stripe.
 * Detects and auto-fixes discrepancies in subscription status, price IDs, and periods.
 *
 * Triggered by: Cloudflare Cron Trigger (daily)
 * Schedule: 5 3 * * * (daily at 3:05 AM UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe/config';
import type Stripe from 'stripe';
import {
  createSyncRun,
  completeSyncRun,
  syncSubscriptionFromStripe,
  markSubscriptionCanceled,
  getUserIdFromCustomerId,
  isStripeNotFoundError,
  sleep,
} from '@server/services/subscription-sync.service';
import { SubscriptionHandler } from '@app/api/webhooks/stripe/handlers/subscription.handler';

// Rate limiting: 100ms between Stripe API calls to respect rate limits
const RATE_LIMIT_DELAY_MS = 100;

// Cloudflare Workers free plan: 50 subrequests max
// Process max 40 subscriptions per run to stay under limit (each needs ~1-2 Stripe API calls)
const BATCH_SIZE = 40;
const SUSPICIOUS_PROFILE_BATCH_SIZE = 10;

function isStripeManagedSubscriptionId(subscriptionId: string): boolean {
  return subscriptionId.startsWith('sub_');
}

interface IDiscrepancyIssue {
  subId: string;
  userId: string;
  issue: string;
  action: string;
}

/**
 * POST handler for full reconciliation cron job
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret for authentication
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== serverEnv.CRON_SECRET) {
    console.error('Unauthorized cron request - invalid CRON_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CRON] Starting full subscription reconciliation...');

  let syncRunId: string | null = null;
  let processed = 0;
  let discrepancies = 0;
  let fixed = 0;
  const issues: IDiscrepancyIssue[] = [];

  try {
    // Create sync run record
    syncRunId = await createSyncRun('full_reconciliation');

    // Get all active/trialing/past_due subscriptions from database
    const { data: dbSubs, error: fetchError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, price_id, current_period_end')
      .in('status', ['active', 'trialing', 'past_due']);

    if (fetchError) {
      throw new Error(`Failed to fetch subscriptions: ${fetchError.message}`);
    }

    if (!dbSubs || dbSubs.length === 0) {
      console.log('[CRON] No active subscriptions to reconcile');
      await completeSyncRun(syncRunId, {
        status: 'completed',
        recordsProcessed: 0,
        recordsFixed: 0,
        discrepanciesFound: 0,
      });
      return NextResponse.json({ processed: 0, discrepancies: 0, fixed: 0, issues: [] });
    }

    // Limit batch size for Cloudflare Workers subrequest limit (50 max)
    const batch = dbSubs.slice(0, BATCH_SIZE);
    const hasMore = dbSubs.length > BATCH_SIZE;

    console.log(
      `[CRON] Reconciling ${batch.length} subscriptions with Stripe (${dbSubs.length} total, batch processing ${hasMore ? 'enabled' : 'not needed'})...`
    );

    // Process each subscription in batch
    for (const dbSub of batch) {
      processed++;

      try {
        // Fetch subscription from Stripe (source of truth)
        const stripeSub = await stripe.subscriptions.retrieve(dbSub.id);

        // Check for status discrepancies
        if (stripeSub.status !== dbSub.status) {
          discrepancies++;
          const issue: IDiscrepancyIssue = {
            subId: dbSub.id,
            userId: dbSub.user_id,
            issue: `Status mismatch: DB=${dbSub.status}, Stripe=${stripeSub.status}`,
            action: 'auto-fixed',
          };
          issues.push(issue);

          console.log(`[CRON] ${issue.issue} - syncing from Stripe`);

          const userId = await getUserIdFromCustomerId(stripeSub.customer as string);
          if (userId) {
            await syncSubscriptionFromStripe(userId, stripeSub);
            fixed++;
          }
        }

        // Check for price ID discrepancies
        const stripePriceId = stripeSub.items.data[0]?.price.id;
        if (stripePriceId && stripePriceId !== dbSub.price_id) {
          discrepancies++;
          const issue: IDiscrepancyIssue = {
            subId: dbSub.id,
            userId: dbSub.user_id,
            issue: `Price mismatch: DB=${dbSub.price_id}, Stripe=${stripePriceId}`,
            action: 'auto-fixed',
          };
          issues.push(issue);

          console.log(`[CRON] ${issue.issue} - syncing from Stripe`);

          const userId = await getUserIdFromCustomerId(stripeSub.customer as string);
          if (userId) {
            await syncSubscriptionFromStripe(userId, stripeSub);
            fixed++;
          }
        }

        // Check for period end discrepancies (significant drift only - more than 1 hour)
        const subscriptionWithPeriod = stripeSub as unknown as Stripe.Subscription & {
          current_period_start: number;
          current_period_end: number;
        };
        const stripeCurrentPeriodEnd = subscriptionWithPeriod.current_period_end;
        const stripePeriodEndDate = new Date(stripeCurrentPeriodEnd * 1000);
        const dbPeriodEndDate = new Date(dbSub.current_period_end);
        const timeDiffMs = Math.abs(stripePeriodEndDate.getTime() - dbPeriodEndDate.getTime());
        const hoursDiff = timeDiffMs / (1000 * 60 * 60);

        if (hoursDiff > 1) {
          discrepancies++;
          const issue: IDiscrepancyIssue = {
            subId: dbSub.id,
            userId: dbSub.user_id,
            issue: `Period end drift: DB=${dbSub.current_period_end}, Stripe=${stripePeriodEndDate.toISOString()} (${hoursDiff.toFixed(1)}h difference)`,
            action: 'auto-fixed',
          };
          issues.push(issue);

          console.log(`[CRON] ${issue.issue} - syncing from Stripe`);

          const userId = await getUserIdFromCustomerId(stripeSub.customer as string);
          if (userId) {
            await syncSubscriptionFromStripe(userId, stripeSub);
            fixed++;
          }
        }

        // Rate limiting delay
        await sleep(RATE_LIMIT_DELAY_MS);
      } catch (error: unknown) {
        if (isStripeNotFoundError(error)) {
          if (!isStripeManagedSubscriptionId(dbSub.id)) {
            discrepancies++;
            issues.push({
              subId: dbSub.id,
              userId: dbSub.user_id,
              issue: 'Manual placeholder subscription skipped during reconciliation',
              action: 'skipped-manual-placeholder',
            });

            console.log(
              `[CRON] Skipping non-Stripe subscription placeholder during reconciliation: ${dbSub.id}`
            );
            await sleep(RATE_LIMIT_DELAY_MS);
            continue;
          }

          // Subscription exists in DB but not in Stripe
          discrepancies++;
          const issue: IDiscrepancyIssue = {
            subId: dbSub.id,
            userId: dbSub.user_id,
            issue: 'Subscription exists in DB but not in Stripe',
            action: 'marked-canceled',
          };
          issues.push(issue);

          console.log(`[CRON] ${issue.issue} - marking as canceled`);
          await markSubscriptionCanceled(dbSub.user_id, dbSub.id);
          fixed++;
        } else {
          // Other errors - log and continue
          console.error(`[CRON] Error reconciling subscription ${dbSub.id}:`, error);
          const issue: IDiscrepancyIssue = {
            subId: dbSub.id,
            userId: dbSub.user_id,
            issue: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            action: 'failed',
          };
          issues.push(issue);
        }

        // Rate limiting delay even on error
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }

    // Recover the original failure mode: a profile has a Stripe customer but never got activated.
    const { data: suspiciousProfiles, error: suspiciousProfilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, stripe_customer_id, subscription_status, subscription_tier')
      .not('stripe_customer_id', 'is', null)
      .or('subscription_status.is.null,subscription_tier.is.null')
      .limit(SUSPICIOUS_PROFILE_BATCH_SIZE);

    if (suspiciousProfilesError) {
      throw new Error(`Failed to fetch suspicious profiles: ${suspiciousProfilesError.message}`);
    }

    for (const profile of suspiciousProfiles ?? []) {
      processed++;

      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id!,
          status: 'all',
          limit: 5,
        });
        const activeSubscription = subscriptions.data.find(subscription =>
          ['active', 'trialing', 'past_due'].includes(subscription.status)
        );

        if (!activeSubscription) {
          await sleep(RATE_LIMIT_DELAY_MS);
          continue;
        }

        discrepancies++;
        issues.push({
          subId: activeSubscription.id,
          userId: profile.id,
          issue: 'Profile missing subscription activation despite active Stripe subscription',
          action: 'replayed-subscription-handler',
        });

        console.log(
          `[CRON] Replaying subscription activation for profile ${profile.id} from Stripe subscription ${activeSubscription.id}`
        );

        await SubscriptionHandler.handleSubscriptionUpdate(activeSubscription);
        fixed++;
      } catch (error: unknown) {
        console.error(
          `[CRON] Error reconciling suspicious profile ${profile.id} (${profile.stripe_customer_id}):`,
          error
        );
        issues.push({
          subId: profile.stripe_customer_id!,
          userId: profile.id,
          issue: `Profile recovery error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'failed',
        });
      }

      await sleep(RATE_LIMIT_DELAY_MS);
    }

    // Complete sync run with results
    await completeSyncRun(syncRunId, {
      status: 'completed',
      recordsProcessed: processed,
      recordsFixed: fixed,
      discrepanciesFound: discrepancies,
      metadata: { issues },
    });

    console.log(
      `[CRON] Reconciliation complete: ${processed} processed, ${discrepancies} discrepancies found, ${fixed} fixed`
    );

    if (issues.length > 0) {
      console.log('[CRON] Issues found:');
      issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.subId}] ${issue.issue} -> ${issue.action}`);
      });
    }

    return NextResponse.json({
      success: true,
      processed,
      discrepancies,
      fixed,
      issues,
      syncRunId,
      hasMore,
      totalSubscriptions: dbSubs.length,
      batchSize: BATCH_SIZE,
      message: hasMore
        ? `Processed batch of ${BATCH_SIZE}. Re-run to process remaining ${dbSubs.length - BATCH_SIZE} subscriptions.`
        : 'All subscriptions processed',
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Reconciliation failed:', errorMessage);

    // Mark sync run as failed if we created one
    if (syncRunId) {
      try {
        await completeSyncRun(syncRunId, {
          status: 'failed',
          recordsProcessed: processed,
          recordsFixed: fixed,
          discrepanciesFound: discrepancies,
          errorMessage,
          metadata: { issues },
        });
      } catch (completeError) {
        console.error('[CRON] Failed to mark sync run as failed:', completeError);
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        processed,
        discrepancies,
        fixed,
        issues,
      },
      { status: 500 }
    );
  }
}
