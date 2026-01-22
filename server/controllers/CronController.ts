import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BaseController } from './BaseController';
import { supabaseAdmin } from '../supabase/supabaseAdmin';
import { stripe } from '../stripe/config';
import { serverEnv } from '@shared/config/env';
import {
  createSyncRun,
  completeSyncRun,
  syncSubscriptionFromStripe,
  markSubscriptionCanceled,
  updateSubscriptionPeriod,
  getUserIdFromCustomerId,
  isStripeNotFoundError,
  processStripeEvent,
  sleep,
} from '../services/subscription-sync.service';
import type Stripe from 'stripe';

/**
 * Cron Controller
 *
 * Handles cron job endpoints for subscription maintenance:
 * - POST /api/cron/check-expirations - Check expired subscriptions
 * - POST /api/cron/reconcile - Full subscription reconciliation
 * - POST /api/cron/recover-webhooks - Recover failed webhooks
 */
export class CronController extends BaseController {
  /**
   * Rate limiting: 100ms between Stripe API calls
   */
  private readonly RATE_LIMIT_DELAY_MS = 100;

  /**
   * Cloudflare Workers free plan: 50 subrequests max
   * Process max 40 subscriptions per run
   */
  private readonly BATCH_SIZE = 40;

  /**
   * Maximum retries for webhook recovery
   */
  private readonly MAX_RETRIES = 3;

  /**
   * Batch size for webhook recovery
   */
  private readonly WEBHOOK_BATCH_SIZE = 50;

  /**
   * Handle incoming request
   */
  protected async handle(req: NextRequest): Promise<NextResponse> {
    const path = req.nextUrl.pathname;

    // Verify cron secret for all requests
    const authResult = this.verifyCronSecret(req);
    if (authResult instanceof NextResponse) return authResult;

    // Route to appropriate method based on path
    if (path.endsWith('/check-expirations') && this.isPost(req)) {
      return this.checkExpirations(req);
    }
    if (path.endsWith('/reconcile') && this.isPost(req)) {
      return this.reconcile(req);
    }
    if (path.endsWith('/recover-webhooks') && this.isPost(req)) {
      return this.recoverWebhooks(req);
    }

    return this.error('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  /**
   * Verify cron secret for authentication
   */
  private verifyCronSecret(req: NextRequest): NextResponse | null {
    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret !== serverEnv.CRON_SECRET) {
      console.error('Unauthorized cron request - invalid CRON_SECRET');
      return this.error('UNAUTHORIZED', 'Unauthorized', 401);
    }
    return null;
  }

  /**
   * POST /api/cron/check-expirations
   * Check subscriptions past their billing period and sync with Stripe
   */
  private async checkExpirations(req: NextRequest): Promise<NextResponse> {
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
        return this.json({ processed: 0, fixed: 0 });
      }

      console.log(`[CRON] Found ${expiredSubs.length} potentially expired subscriptions`);

      // Process each expired subscription
      for (const sub of expiredSubs) {
        processed++;

        try {
          // Fetch current subscription state from Stripe
          const stripeSub = await stripe.subscriptions.retrieve(sub.id);

          if (stripeSub.status !== 'active') {
            // Stripe says subscription is no longer active - sync to DB
            console.log(`[CRON] Subscription ${sub.id} is ${stripeSub.status} in Stripe (was active in DB)`);

            const userId = await getUserIdFromCustomerId(stripeSub.customer as string);
            if (userId) {
              await syncSubscriptionFromStripe(userId, stripeSub);
              fixed++;
            }
          } else {
            // Stripe says it's still active - update period
            console.log(`[CRON] Subscription ${sub.id} is still active in Stripe - updating period`);
            await updateSubscriptionPeriod(sub.id, stripeSub);
            fixed++;
          }
        } catch (error: unknown) {
          if (isStripeNotFoundError(error)) {
            // Subscription deleted in Stripe but still in our DB
            console.log(`[CRON] Subscription ${sub.id} not found in Stripe - marking as canceled`);
            await markSubscriptionCanceled(sub.user_id, sub.id);
            fixed++;
          } else {
            console.error(`[CRON] Error checking subscription ${sub.id}:`, error);
          }
        }
      }

      // Complete sync run
      await completeSyncRun(syncRunId, {
        status: 'completed',
        recordsProcessed: processed,
        recordsFixed: fixed,
      });

      console.log(`[CRON] Expiration check complete: ${processed} processed, ${fixed} fixed`);

      return this.json({
        success: true,
        processed,
        fixed,
        syncRunId,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CRON] Expiration check failed:', errorMessage);

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

      return this.error(
        'INTERNAL_ERROR',
        errorMessage,
        500,
        { processed, fixed }
      );
    }
  }

  /**
   * POST /api/cron/reconcile
   * Full subscription reconciliation with Stripe
   */
  private async reconcile(req: NextRequest): Promise<NextResponse> {
    console.log('[CRON] Starting full subscription reconciliation...');

    let syncRunId: string | null = null;
    let processed = 0;
    let discrepancies = 0;
    let fixed = 0;
    const issues: Array<{
      subId: string;
      userId: string;
      issue: string;
      action: string;
    }> = [];

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
        return this.json({ processed: 0, discrepancies: 0, fixed: 0, issues: [] });
      }

      // Limit batch size
      const batch = dbSubs.slice(0, this.BATCH_SIZE);
      const hasMore = dbSubs.length > this.BATCH_SIZE;

      console.log(
        `[CRON] Reconciling ${batch.length} subscriptions with Stripe (${dbSubs.length} total, batch processing ${hasMore ? 'enabled' : 'not needed'})...`
      );

      // Process each subscription
      for (const dbSub of batch) {
        processed++;

        try {
          // Fetch subscription from Stripe
          const stripeSub = await stripe.subscriptions.retrieve(dbSub.id);

          // Check for status discrepancies
          if (stripeSub.status !== dbSub.status) {
            discrepancies++;
            const issue = {
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
            const issue = {
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

          // Check for period end discrepancies
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
            const issue = {
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
          await sleep(this.RATE_LIMIT_DELAY_MS);
        } catch (error: unknown) {
          if (isStripeNotFoundError(error)) {
            // Subscription exists in DB but not in Stripe
            discrepancies++;
            const issue = {
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
            console.error(`[CRON] Error reconciling subscription ${dbSub.id}:`, error);
            const issue = {
              subId: dbSub.id,
              userId: dbSub.user_id,
              issue: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              action: 'failed',
            };
            issues.push(issue);
          }

          // Rate limiting delay even on error
          await sleep(this.RATE_LIMIT_DELAY_MS);
        }
      }

      // Complete sync run
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

      return this.json({
        success: true,
        processed,
        discrepancies,
        fixed,
        issues,
        syncRunId,
        hasMore,
        totalSubscriptions: dbSubs.length,
        batchSize: this.BATCH_SIZE,
        message: hasMore
          ? `Processed batch of ${this.BATCH_SIZE}. Re-run to process remaining ${dbSubs.length - this.BATCH_SIZE} subscriptions.`
          : 'All subscriptions processed',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CRON] Reconciliation failed:', errorMessage);

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

      return this.error(
        'INTERNAL_ERROR',
        errorMessage,
        500,
        { processed, discrepancies, fixed, issues }
      );
    }
  }

  /**
   * POST /api/cron/recover-webhooks
   * Retry processing failed webhook events
   */
  private async recoverWebhooks(req: NextRequest): Promise<NextResponse> {
    console.log('[CRON] Starting webhook recovery...');

    let syncRunId: string | null = null;
    let processed = 0;
    let recovered = 0;
    let unrecoverable = 0;

    try {
      // Create sync run record
      syncRunId = await createSyncRun('webhook_recovery');

      // Find failed events that are retryable
      const { data: failedEvents, error: fetchError } = await supabaseAdmin
        .from('webhook_events')
        .select('*')
        .eq('status', 'failed')
        .eq('recoverable', true)
        .lt('retry_count', this.MAX_RETRIES)
        .order('created_at', { ascending: true })
        .limit(this.WEBHOOK_BATCH_SIZE);

      if (fetchError) {
        throw new Error(`Failed to fetch failed webhook events: ${fetchError.message}`);
      }

      if (!failedEvents || failedEvents.length === 0) {
        console.log('[CRON] No failed webhook events to retry');
        await completeSyncRun(syncRunId, {
          status: 'completed',
          recordsProcessed: 0,
          recordsFixed: 0,
        });
        return this.json({ processed: 0, recovered: 0, unrecoverable: 0 });
      }

      console.log(`[CRON] Found ${failedEvents.length} failed webhook events to retry`);

      // Process each failed event
      for (const event of failedEvents) {
        processed++;

        try {
          // Fetch fresh event data from Stripe
          console.log(
            `[CRON] Retrying webhook event ${event.event_id} (attempt ${event.retry_count + 1}/${this.MAX_RETRIES})`
          );

          const stripeEvent = await stripe.events.retrieve(event.event_id);

          // Re-process the event
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
            // Event not found in Stripe
            console.log(`[CRON] Webhook event ${event.event_id} not found in Stripe - marking as unrecoverable`);

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
            const shouldMarkUnrecoverable = newRetryCount >= this.MAX_RETRIES;

            console.error(
              `[CRON] Error recovering webhook event ${event.event_id} (attempt ${newRetryCount}/${this.MAX_RETRIES}):`,
              error
            );

            await supabaseAdmin
              .from('webhook_events')
              .update({
                retry_count: newRetryCount,
                last_retry_at: new Date().toISOString(),
                error_message: error instanceof Error ? error.message : 'Unknown error',
                ...(shouldMarkUnrecoverable && {
                  status: 'unrecoverable',
                  recoverable: false,
                }),
              })
              .eq('id', event.id);

            if (shouldMarkUnrecoverable) {
              unrecoverable++;
            }
          }
        }
      }

      // Complete sync run
      await completeSyncRun(syncRunId, {
        status: 'completed',
        recordsProcessed: processed,
        recordsFixed: recovered,
        metadata: { recovered, unrecoverable },
      });

      console.log(
        `[CRON] Webhook recovery complete: ${processed} processed, ${recovered} recovered, ${unrecoverable} unrecoverable`
      );

      return this.json({
        success: true,
        processed,
        recovered,
        unrecoverable,
        syncRunId,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CRON] Webhook recovery failed:', errorMessage);

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

      return this.error(
        'INTERNAL_ERROR',
        errorMessage,
        500,
        { processed, recovered, unrecoverable }
      );
    }
  }
}
