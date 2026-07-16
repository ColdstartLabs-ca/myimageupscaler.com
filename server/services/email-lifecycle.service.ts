import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import { getEmailService } from '@server/services/email.service';
import {
  getEmailContentRecommendationService,
  type LifecycleIntent,
} from '@server/services/email-content-recommendation.service';
import {
  getRevenueRecoveryService,
  type IQueueRecoveryEligibilityResult,
} from '@server/services/revenue-recovery.service';
import {
  RECIPIENT_VALUE_POLICY_VERSION,
  type RecipientValueBand,
} from '@server/services/email-recipient-value.service';
import { EmailProviderSendError } from '@server/services/email-providers/base-email-provider-adapter';

export type LifecycleEventType =
  | 'queued'
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'clicked'
  | 'returned'
  | 'purchased_after_email'
  | 'unsubscribed'
  | 'suppressed_frequency_cap'
  | 'suppressed_preference';

type EmailPreferenceKey = 'marketing_emails' | 'product_updates' | 'low_credit_alerts';
type LifecycleQueueStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'cancelled';
type LifecycleHistoryMode = 'enqueue' | 'send';
export type CampaignPriority = 'transactional' | 'revenue_critical' | 'lifecycle' | 'education';
export const LIFECYCLE_DELIVERED_HISTORY_STATUS = 'sent' as const;

/** The zero-credit alert is the only caller allowed to bypass frequency windows. */
export type LifecycleForceFrequencyOverride = 'zero_credit_alert';

interface ICampaign {
  key: string;
  name: string;
  category: string;
  template_name: string;
  email_type: 'transactional' | 'marketing';
  preference_key: EmailPreferenceKey | null;
  enabled: boolean;
  cooldown_days: number;
  priority: CampaignPriority;
  sort_priority: number;
}

export interface ILifecycleDueQueuePolicyRow {
  id: string;
  scheduled_for: string;
  processing_claim_id?: string | null;
  processing_claimed_at?: string | null;
  recipient_value_score?: number | null;
  recipient_value_decision?:
    | 'protected'
    | 'keep_high'
    | 'keep_medium'
    | 'hold_experiment'
    | 'cancel'
    | null;
  recipient_value_policy_version?: string | null;
  campaign_email_type?: 'transactional' | 'marketing';
  campaign_enabled?: boolean;
  campaign_priority?: CampaignPriority;
  campaign_sort_priority?: number;
}

interface IQueueRow extends ILifecycleDueQueuePolicyRow {
  campaign_key: string;
  user_id: string | null;
  recipient_email: string;
  status: LifecycleQueueStatus;
  reason: string | null;
  template_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  sent_at: string | null;
  created_at: string;
  subscription_id?: string | null;
  recipient_value_band?: RecipientValueBand | null;
  campaign_name?: string;
  campaign_category?: string;
  campaign_template_name?: string;
  campaign_preference_key?: EmailPreferenceKey | null;
  campaign_cooldown_days?: number;
}

export interface IQueueLifecycleEmailInput {
  campaignKey: string;
  userId: string;
  recipientEmail?: string;
  scheduledFor?: Date;
  templateData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  subscriptionId?: string;
  forceFrequency?: LifecycleForceFrequencyOverride;
}

export interface IQueueLifecycleEmailResult {
  queued: boolean;
  skipped: boolean;
  queueId?: string;
  reason?: string;
  suppressionRecorded?: boolean;
}

export interface IProcessLifecycleQueueResult {
  queued: number;
  sent: number;
  skipped: number;
  failed: number;
  eligible: number;
  dryRun: boolean;
  recipientValueBandCounts: Record<RecipientValueBand, number>;
  stoppedByHealth: boolean;
  stoppedByProviderCapacity: boolean;
  stoppedByProvider: boolean;
  rescheduled: number;
  providerClassification?: string;
  attemptedProviders: string[];
  unavailableProviders: string[];
  fallbackReasons: string[];
  unclassifiedDueReturned: number;
  providerIoMs: number;
}

function createRecipientValueBandCounts(): Record<RecipientValueBand, number> {
  return {
    protected: 0,
    high: 0,
    medium: 0,
    experiment: 0,
    cancel: 0,
  };
}

function getQueueRowRecipientValueBand(row: IQueueRow): RecipientValueBand {
  if (row.recipient_value_band) return row.recipient_value_band;
  if (row.recipient_value_decision === 'protected') return 'protected';
  if (row.recipient_value_decision === 'keep_high') return 'high';
  if (row.recipient_value_decision === 'hold_experiment') return 'experiment';
  if (row.recipient_value_decision === 'cancel') return 'cancel';
  return 'medium';
}

export function hasPermanentEmailFailureSignal(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => hasPermanentEmailFailureSignal(item));

  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (/permanentbounce|hardbounce|complaint|complained/.test(normalizedKey)) {
      if (candidate === true) return true;
      if (Array.isArray(candidate) && candidate.length > 0) return true;
      if (
        typeof candidate === 'string' &&
        candidate.trim() !== '' &&
        !['false', 'none', '0', '[]'].includes(candidate.trim().toLowerCase())
      ) {
        return true;
      }
    }
    if (
      typeof candidate === 'string' &&
      /^(event|status|classification|error|message|reason)$/.test(normalizedKey) &&
      /hard.?bounce|permanent.?bounce|complaint|complained|invalid.?recipient/i.test(candidate)
    ) {
      return true;
    }
    if (candidate && typeof candidate === 'object' && hasPermanentEmailFailureSignal(candidate)) {
      return true;
    }
  }
  return false;
}

const CAMPAIGN_PRIORITY_RANK: Record<CampaignPriority, number> = {
  transactional: 0,
  revenue_critical: 1,
  lifecycle: 2,
  education: 3,
};

const RECIPIENT_VALUE_DECISION_RANK: Record<string, number> = {
  protected: 0,
  keep_high: 1,
  keep_medium: 2,
};

export function isLifecycleDueQueueRowEligible(
  row: ILifecycleDueQueuePolicyRow,
  now: Date = new Date()
): boolean {
  if (row.campaign_enabled !== true || !row.campaign_email_type) return false;
  if (row.processing_claim_id) {
    const claimedAt = row.processing_claimed_at ? Date.parse(row.processing_claimed_at) : NaN;
    if (!Number.isFinite(claimedAt) || claimedAt >= now.getTime() - 10 * 60 * 1000) {
      return false;
    }
  }
  if (row.campaign_email_type === 'transactional') return true;
  return (
    row.recipient_value_policy_version === RECIPIENT_VALUE_POLICY_VERSION &&
    row.recipient_value_decision !== null &&
    row.recipient_value_decision !== undefined &&
    ['protected', 'keep_high', 'keep_medium'].includes(row.recipient_value_decision)
  );
}

export function compareLifecycleDueQueueRows(
  left: ILifecycleDueQueuePolicyRow,
  right: ILifecycleDueQueuePolicyRow
): number {
  const priorityDelta =
    (left.campaign_priority ? CAMPAIGN_PRIORITY_RANK[left.campaign_priority] : 4) -
    (right.campaign_priority ? CAMPAIGN_PRIORITY_RANK[right.campaign_priority] : 4);
  if (priorityDelta !== 0) return priorityDelta;
  const decisionDelta =
    (RECIPIENT_VALUE_DECISION_RANK[left.recipient_value_decision ?? ''] ?? 3) -
    (RECIPIENT_VALUE_DECISION_RANK[right.recipient_value_decision ?? ''] ?? 3);
  if (decisionDelta !== 0) return decisionDelta;
  const scoreDelta = (right.recipient_value_score ?? -1) - (left.recipient_value_score ?? -1);
  if (scoreDelta !== 0) return scoreDelta;
  const campaignSortDelta =
    (right.campaign_sort_priority ?? -1) - (left.campaign_sort_priority ?? -1);
  if (campaignSortDelta !== 0) return campaignSortDelta;
  const scheduledDelta = Date.parse(left.scheduled_for) - Date.parse(right.scheduled_for);
  if (scheduledDelta !== 0) return scheduledDelta;
  return left.id.localeCompare(right.id);
}

export interface IEmailLifecycleQueueHealth {
  duePending: number;
  oldestPendingScheduledFor: string | null;
}

export interface IQueueDailyEligibilityResult {
  queued: number;
  lifecycleQueued: number;
  suppressionsRecorded: number;
  suppressionsReused: number;
  recovery: IQueueRecoveryEligibilityResult;
}

interface IUserEmailContext {
  id: string;
  email: string;
  userName?: string;
}

const REVENUE_CRITICAL_CAP_HOURS = 72;
const MARKETING_CAP_DAYS = 7;

export function evaluateCampaignFrequencyCap(input: {
  priority: CampaignPriority;
  revenueCriticalLast72Hours: number;
  revenueCriticalLast7Days: number;
  lifecycleEducationLast7Days: number;
  allMarketingLast7Days: number;
}): string | null {
  if (input.priority === 'transactional') return null;
  if (input.allMarketingLast7Days >= 3) return 'suppressed_emergency_ceiling';
  if (input.priority === 'revenue_critical') {
    if (input.revenueCriticalLast72Hours >= 1) return 'suppressed_revenue_72h_cap';
    if (input.revenueCriticalLast7Days >= 2) return 'suppressed_revenue_weekly_cap';
    return null;
  }
  return input.lifecycleEducationLast7Days >= 1 ? 'suppressed_lifecycle_weekly_cap' : null;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function appendUtm(
  destination: string,
  campaignKey: string,
  templateKey: string,
  baseUrl = serverEnv.BASE_URL
): string {
  const url = new URL(destination, baseUrl);
  url.searchParams.set('utm_source', 'email');
  url.searchParams.set('utm_medium', 'lifecycle');
  url.searchParams.set('utm_campaign', campaignKey);
  url.searchParams.set('utm_content', templateKey);
  return url.pathname + url.search + url.hash;
}

function normalizeInternalDestination(destination: string): string {
  const url = new URL(destination, serverEnv.BASE_URL);
  const base = new URL(serverEnv.BASE_URL);
  if (url.origin !== base.origin) {
    throw new Error('Unsafe lifecycle email redirect');
  }
  return url.pathname + url.search + url.hash;
}

export class EmailLifecycleService {
  private readonly emailService = getEmailService();
  private readonly contentService = getEmailContentRecommendationService();

  async queueLifecycleEmail(input: IQueueLifecycleEmailInput): Promise<IQueueLifecycleEmailResult> {
    const campaign = await this.getCampaign(input.campaignKey);
    if (!campaign?.enabled) {
      return { queued: false, skipped: true, reason: 'campaign_disabled' };
    }

    const user = await this.getUserEmailContext(input.userId, input.recipientEmail);
    if (!user?.email) {
      return { queued: false, skipped: true, reason: 'missing_recipient_email' };
    }

    const suppression = await this.getSuppressionReason(campaign, input.userId, {
      historyMode: 'enqueue',
      forceFrequency: Boolean(input.forceFrequency),
    });
    if (suppression) {
      const existingQueueId = await this.getRecentSuppressionQueueId(
        input.userId,
        campaign.key,
        suppression
      );
      if (existingQueueId) {
        return {
          queued: false,
          skipped: true,
          queueId: existingQueueId,
          reason: suppression,
          suppressionRecorded: false,
        };
      }
      const suppressionRecord = await this.recordSuppressionDecision({
        campaign,
        user,
        reason: suppression,
        scheduledFor: input.scheduledFor ?? new Date(),
        templateData: input.templateData,
        metadata: input.metadata,
        subscriptionId: input.subscriptionId,
      });
      const queueId = suppressionRecord.queueId;
      if (!suppressionRecord.recorded) {
        return {
          queued: false,
          skipped: true,
          queueId,
          reason: suppression,
          suppressionRecorded: false,
        };
      }
      await this.recordLifecycleEvent({
        queueId,
        userId: input.userId,
        campaignKey: campaign.key,
        eventType:
          suppression === 'suppressed_preference'
            ? 'suppressed_preference'
            : 'suppressed_frequency_cap',
        metadata: { reason: suppression },
      });
      await this.trackLifecycleAnalytics('email_lifecycle_skipped', input.userId, campaign, {
        reason: suppression,
      });
      return {
        queued: false,
        skipped: true,
        queueId,
        reason: suppression,
        suppressionRecorded: true,
      };
    }

    const queueId = await this.insertQueueRow({
      campaign,
      user,
      status: 'pending',
      scheduledFor: input.scheduledFor ?? new Date(),
      templateData: input.templateData,
      metadata: input.metadata,
      subscriptionId: input.subscriptionId,
    });

    await this.recordLifecycleEvent({
      queueId,
      userId: input.userId,
      campaignKey: campaign.key,
      eventType: 'queued',
      metadata: { scheduledFor: input.scheduledFor?.toISOString() ?? new Date().toISOString() },
    });
    await this.trackLifecycleAnalytics('email_lifecycle_queued', input.userId, campaign);

    return { queued: true, skipped: false, queueId };
  }

  async queueLowCreditAlert(params: {
    userId: string;
    creditsRemaining: number;
    requiredCredits?: number;
    returnUrl?: string;
    reason?: 'low' | 'zero' | 'insufficient';
  }): Promise<IQueueLifecycleEmailResult> {
    const reason =
      params.reason ??
      (params.requiredCredits && params.requiredCredits > params.creditsRemaining
        ? 'insufficient'
        : params.creditsRemaining <= 0
          ? 'zero'
          : 'low');

    if (reason === 'low' && params.creditsRemaining > 3) {
      return { queued: false, skipped: true, reason: 'above_low_credit_threshold' };
    }

    const campaignKey =
      reason === 'insufficient'
        ? 'insufficient-credits-finish-image'
        : reason === 'zero'
          ? 'zero-credits'
          : 'low-credits';

    const ctaDestination =
      params.returnUrl && reason === 'insufficient' ? params.returnUrl : '/pricing';
    const ctaUrl = appendUtm(ctaDestination, campaignKey, 'low-credits');

    return this.queueLifecycleEmail({
      campaignKey,
      userId: params.userId,
      scheduledFor: reason === 'insufficient' ? addMinutes(new Date(), 10) : new Date(),
      forceFrequency: reason === 'zero' ? 'zero_credit_alert' : undefined,
      templateData: {
        creditsRemaining: Math.max(params.creditsRemaining, 0),
        requiredCredits: params.requiredCredits,
        returnUrl: params.returnUrl,
        ctaUrl,
        preferenceUrl: '/dashboard/settings',
        variant: reason,
      },
      metadata: {
        credits_remaining: params.creditsRemaining,
        required_credits: params.requiredCredits,
        cta_destination: ctaDestination,
      },
    });
  }

  async queueBlogEducationEmail(params: {
    userId: string;
    intent: LifecycleIntent;
    scheduledFor?: Date;
  }): Promise<IQueueLifecycleEmailResult> {
    const recommendation = await this.contentService.recommendForIntent(params.intent);
    const campaignKey = `blog-education-${params.intent}`;
    const articleUrl = appendUtm(recommendation.url, campaignKey, 'blog-education');
    const productCtaUrl = appendUtm(recommendation.productCtaUrl, campaignKey, 'blog-education');

    return this.queueLifecycleEmail({
      campaignKey,
      userId: params.userId,
      scheduledFor: params.scheduledFor ?? addDays(new Date(), 2),
      templateData: {
        articleTitle: recommendation.title,
        articleDescription: recommendation.description,
        articleUrl,
        productCtaUrl,
        productCtaLabel: recommendation.productCtaLabel,
        preferenceUrl: '/dashboard/settings',
      },
      metadata: {
        blog_slug: recommendation.slug,
        intent: params.intent,
        cta_destination: recommendation.productCtaUrl,
      },
    });
  }

  async queueFirstResultFollowup(userId: string): Promise<IQueueLifecycleEmailResult> {
    if (await this.userHasPurchase(userId)) {
      return { queued: false, skipped: true, reason: 'user_already_purchased' };
    }

    return this.queueLifecycleEmail({
      campaignKey: 'first-result-followup',
      userId,
      scheduledFor: addMinutes(new Date(), 15),
      templateData: {
        headline: 'Want a sharper version of your image?',
        featureList: ['Try HD for cleaner edges', 'Use Ultra for print-ready detail'],
        ctaUrl: appendUtm('/upscale', 'first-result-followup', 'feature-reminder'),
        preferenceUrl: '/dashboard/settings',
      },
      metadata: {
        cta_destination: '/upscale',
      },
    });
  }

  async processDueQueue(options?: {
    dryRun?: boolean;
    scanLimit?: number;
    sendLimit?: number;
    /** @deprecated Use scanLimit. Retained for internal caller compatibility. */
    batchSize?: number;
  }): Promise<IProcessLifecycleQueueResult> {
    const dryRun = options?.dryRun ?? false;
    const scanLimit = Math.min(Math.max(1, options?.scanLimit ?? options?.batchSize ?? 50), 250);
    const sendLimit = Math.min(Math.max(1, options?.sendLimit ?? 1), 1);
    const result: IProcessLifecycleQueueResult = {
      queued: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      eligible: 0,
      dryRun,
      recipientValueBandCounts: createRecipientValueBandCounts(),
      stoppedByHealth: false,
      stoppedByProviderCapacity: false,
      stoppedByProvider: false,
      rescheduled: 0,
      attemptedProviders: [],
      unavailableProviders: [],
      fallbackReasons: [],
      providerIoMs: 0,
      unclassifiedDueReturned: 0,
    };

    if (!dryRun) {
      const { data: health, error: healthError } = await supabaseAdmin.rpc(
        'get_email_lifecycle_health',
        { p_since: daysAgo(1) }
      );
      if (healthError) {
        throw new Error(`Failed to check lifecycle delivery health: ${healthError.message}`);
      }
      if (
        ((health || []) as Array<{ stop_recommended?: boolean }>).some(
          row => row.stop_recommended === true
        )
      ) {
        result.stoppedByHealth = true;
        return result;
      }
    }

    const { data, error } = await supabaseAdmin.rpc('get_due_email_lifecycle_queue', {
      p_limit: scanLimit,
      p_due_before: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to fetch lifecycle queue: ${error.message}`);
    }

    const rawRows = (data || []) as IQueueRow[];
    result.unclassifiedDueReturned = rawRows.filter(
      row => row.campaign_email_type === 'marketing' && !row.recipient_value_decision
    ).length;
    const rows = rawRows
      .filter(row => Boolean(row) && isLifecycleDueQueueRowEligible(row))
      .sort(compareLifecycleDueQueueRows);
    result.eligible = rows.length;
    let providerSubmissions = 0;

    for (const row of rows) {
      result.recipientValueBandCounts[getQueueRowRecipientValueBand(row)]++;
      const campaign = this.getCampaignFromQueueRow(row);
      if (!campaign) {
        await this.markQueueRow(row.id, 'skipped', 'campaign_missing');
        result.skipped++;
        continue;
      }

      let suppression: string | null = null;
      try {
        suppression = row.user_id
          ? await this.getSuppressionReason(campaign, row.user_id, {
              historyMode: 'send',
              queueId: row.id,
            })
          : null;
      } catch (error) {
        // Leave the row pending so a transient preference/status read failure
        // is retried by the next cron pass.
        console.error('[EMAIL_LIFECYCLE_SUPPRESSION_CHECK_FAILED]', error);
        result.failed++;
        continue;
      }

      if (suppression) {
        if (!dryRun) {
          await this.markQueueRow(row.id, 'skipped', suppression);
          await this.recordLifecycleEvent({
            queueId: row.id,
            userId: row.user_id,
            campaignKey: row.campaign_key,
            eventType:
              suppression === 'suppressed_preference'
                ? 'suppressed_preference'
                : 'suppressed_frequency_cap',
            metadata: { reason: suppression },
          });
          await this.trackLifecycleAnalytics('email_lifecycle_skipped', row.user_id, campaign, {
            reason: suppression,
          });
        }
        result.skipped++;
        continue;
      }

      if (dryRun) {
        result.queued++;
        continue;
      }

      try {
        const claimResult = await this.claimQueueRow(row.id);
        if (claimResult === 'capacity_exhausted') {
          result.stoppedByProviderCapacity = true;
          break;
        }
        if (claimResult !== 'claimed') continue;
      } catch (error) {
        console.error('[EMAIL_LIFECYCLE_QUEUE_CLAIM_FAILED]', error);
        result.failed++;
        continue;
      }

      let providerStartedAt: number | null = null;
      try {
        const templateData = await this.prepareTemplateData(row, campaign);
        providerStartedAt = Date.now();
        providerSubmissions++;
        const sendResult = await this.emailService.send({
          to: row.recipient_email,
          template: campaign.template_name,
          type: campaign.email_type,
          userId: row.user_id ?? undefined,
          data: templateData,
        });
        result.providerIoMs += Date.now() - providerStartedAt;
        providerStartedAt = null;

        if (sendResult.skipped) {
          await this.markQueueRow(row.id, 'skipped', 'provider_preference_skip');
          result.skipped++;
        } else {
          await this.markQueueRow(row.id, 'sent');
          await this.recordLifecycleEvent({
            queueId: row.id,
            userId: row.user_id,
            campaignKey: row.campaign_key,
            eventType: 'sent',
            metadata: {
              provider: sendResult.provider,
              messageId: sendResult.messageId,
              attemptedProviders: sendResult.attemptedProviders,
              unavailableProviders: sendResult.unavailableProviders,
              fallbackReasons: sendResult.fallbackReasons,
            },
          });
          await this.trackLifecycleAnalytics('email_lifecycle_sent', row.user_id, campaign, {
            cta_destination: row.metadata?.cta_destination,
            blog_slug: row.metadata?.blog_slug,
          });
          result.sent++;
        }
        if (providerSubmissions >= sendLimit) break;
      } catch (error) {
        if (providerStartedAt !== null) {
          result.providerIoMs += Date.now() - providerStartedAt;
        }
        const message = error instanceof Error ? error.message : 'Unknown email send failure';
        const providerError = error instanceof EmailProviderSendError ? error : null;
        const isProviderStop = providerError?.scope === 'provider';
        const isCapacityStop =
          providerError?.classification === 'rate_limited' ||
          (providerError?.classification === 'provider_unavailable' &&
            providerError.attemptedProviders.length === 0);
        if (isProviderStop) {
          const category = isCapacityStop
            ? 'provider_capacity_exhausted'
            : `provider_incident_${providerError.classification}`;
          await this.rescheduleQueueRow(row.id, providerError.classification, category);
          result.rescheduled++;
          result.stoppedByProvider = true;
          result.stoppedByProviderCapacity = isCapacityStop;
          result.providerClassification = providerError.classification;
          result.attemptedProviders = [...providerError.attemptedProviders];
          result.unavailableProviders = [...providerError.unavailableProviders];
          result.fallbackReasons = providerError.fallbackReasons.length
            ? [...providerError.fallbackReasons]
            : [providerError.classification];
        } else {
          await this.markQueueRow(row.id, 'failed', providerError?.classification ?? message);
        }
        await this.recordLifecycleEvent({
          queueId: row.id,
          userId: row.user_id,
          campaignKey: row.campaign_key,
          eventType: 'failed',
          metadata: {
            classification: providerError?.classification ?? 'application_error',
            scope: providerError?.scope ?? 'recipient',
            transient: providerError?.transient ?? false,
            attemptedProviders: providerError?.attemptedProviders ?? [],
            unavailableProviders: providerError?.unavailableProviders ?? [],
            fallbackReasons: providerError?.fallbackReasons ?? [],
          },
        });
        await this.trackLifecycleAnalytics('email_lifecycle_skipped', row.user_id, campaign, {
          reason: 'failed',
          classification: providerError?.classification ?? 'application_error',
          scope: providerError?.scope ?? 'recipient',
        });
        if (!isProviderStop) result.failed++;
        if (providerSubmissions >= sendLimit) break;
      }
    }

    return result;
  }

  async getQueueHealth(now: Date = new Date()): Promise<IEmailLifecycleQueueHealth> {
    const dueCutoff = now.toISOString();
    const { count, error: countError } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lte('scheduled_for', dueCutoff);

    if (countError) {
      throw new Error(`Failed to count due lifecycle queue: ${countError.message}`);
    }

    const { data, error: oldestError } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .select('scheduled_for')
      .eq('status', 'pending')
      .lte('scheduled_for', dueCutoff)
      .order('scheduled_for', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (oldestError) {
      throw new Error(`Failed to load oldest due lifecycle queue row: ${oldestError.message}`);
    }

    return {
      duePending: count ?? 0,
      oldestPendingScheduledFor: data?.scheduled_for ? String(data.scheduled_for) : null,
    };
  }

  async queueDailyEligibility(options?: { dryRun?: boolean; limit?: number }): Promise<number> {
    const result = await this.queueDailyEligibilityDetailed(options);
    return result.queued;
  }

  async queueDailyEligibilityDetailed(options?: {
    dryRun?: boolean;
    limit?: number;
  }): Promise<IQueueDailyEligibilityResult> {
    const limit = options?.limit ?? 100;
    const dryRun = options?.dryRun ?? false;
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(
        'id, created_at, subscription_status, subscription_tier, subscription_credits_balance, purchased_credits_balance'
      )
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to scan lifecycle eligibility: ${error.message}`);
    }

    let lifecycleQueued = 0;
    let suppressionsRecorded = 0;
    let suppressionsReused = 0;
    for (const profile of (data || []) as Array<Record<string, unknown>>) {
      const userId = String(profile.id);
      const email = await this.resolveUserEmail(userId);
      if (!email) continue;

      const createdAt = new Date(String(profile.created_at));
      const uploaded = await this.userHasCompletedJob(userId);
      const purchased = await this.userHasPurchase(userId);
      const cancelingSubscription = await this.getCancelingSubscription(userId);
      const cancelingPeriodEnd = cancelingSubscription?.periodEnd ?? null;
      const lastJob = await this.getLastCompletedJob(userId);
      const lastJobAt = lastJob?.completedAt ?? null;
      const totalCredits =
        Number(profile.subscription_credits_balance ?? 0) +
        Number(profile.purchased_credits_balance ?? 0);
      const purchasedCredits = Number(profile.purchased_credits_balance ?? 0);

      const candidates: IQueueLifecycleEmailInput[] = [];
      const now = Date.now();
      const ageHours = (now - createdAt.getTime()) / (60 * 60 * 1000);
      const inactiveDays = lastJobAt
        ? (now - lastJobAt.getTime()) / (24 * 60 * 60 * 1000)
        : ageHours / 24;

      if (!uploaded && ageHours >= 2 && ageHours < 24) {
        candidates.push({
          campaignKey: 'signup-no-upload-2h',
          userId,
          recipientEmail: email,
          templateData: {
            ctaUrl: appendUtm('/upscale', 'signup-no-upload-2h', 'lifecycle-welcome'),
            preferenceUrl: '/dashboard/settings',
          },
          metadata: { cta_destination: '/upscale', days_since_last_session: inactiveDays },
        });
      }

      if (!uploaded && ageHours >= 24 && ageHours < 72) {
        candidates.push({
          campaignKey: 'signup-no-upload-24h',
          userId,
          recipientEmail: email,
          templateData: {
            headline: 'Try one of these image workflows',
            featureList: [
              'Restore a portrait',
              'Sharpen a product photo',
              'Prepare an image for print',
            ],
            ctaUrl: appendUtm('/upscale?sample=photo', 'signup-no-upload-24h', 'feature-reminder'),
            preferenceUrl: '/dashboard/settings',
          },
          metadata: {
            cta_destination: '/upscale?sample=photo',
            days_since_last_session: inactiveDays,
          },
        });
      }

      if (!uploaded && ageHours >= 72 && ageHours < 24 * 14) {
        const recommendation = await this.contentService.recommendForIntent('file-prep');
        candidates.push({
          campaignKey: 'signup-no-upload-3d-blog',
          userId,
          recipientEmail: email,
          templateData: {
            articleTitle: recommendation.title,
            articleDescription: recommendation.description,
            articleUrl: appendUtm(recommendation.url, 'signup-no-upload-3d-blog', 'blog-education'),
            productCtaUrl: appendUtm('/upscale', 'signup-no-upload-3d-blog', 'blog-education'),
            productCtaLabel: 'Try it on an image',
            preferenceUrl: '/dashboard/settings',
          },
          metadata: {
            blog_slug: recommendation.slug,
            intent: 'file-prep',
            cta_destination: '/upscale',
            days_since_last_session: inactiveDays,
          },
        });
      }

      if (!uploaded && ageHours >= 24 * 14) {
        candidates.push({
          campaignKey: 'winback-never-uploaded-14d',
          userId,
          recipientEmail: email,
          templateData: {
            ctaUrl: appendUtm('/upscale?sample=photo', 'winback-never-uploaded-14d', 'win-back'),
            preferenceUrl: '/dashboard/settings',
            reason: 'Start with a sample image',
          },
          metadata: {
            cta_destination: '/upscale?sample=photo',
            days_since_last_session: inactiveDays,
          },
        });
      }

      if (uploaded && !purchased && inactiveDays >= 7) {
        candidates.push({
          campaignKey: 'winback-free-7d',
          userId,
          recipientEmail: email,
          templateData: {
            ctaUrl: appendUtm('/upscale', 'winback-free-7d', 'win-back'),
            preferenceUrl: '/dashboard/settings',
            reason: 'Your next image can look better',
          },
          metadata: { cta_destination: '/upscale', days_since_last_session: inactiveDays },
        });
      }

      if (purchasedCredits > 0 && inactiveDays >= 14) {
        candidates.push({
          campaignKey: 'unused-credits-14d',
          userId,
          recipientEmail: email,
          templateData: {
            creditsRemaining: purchasedCredits,
            ctaUrl: appendUtm('/upscale', 'unused-credits-14d', 'unused-credits'),
            preferenceUrl: '/dashboard/settings',
          },
          metadata: {
            credits_remaining: purchasedCredits,
            cta_destination: '/upscale',
            days_since_last_session: inactiveDays,
          },
        });
      }

      if (totalCredits > 0 && inactiveDays >= 21) {
        candidates.push({
          campaignKey: 'winback-credit-holder-21d',
          userId,
          recipientEmail: email,
          templateData: {
            creditsRemaining: totalCredits,
            ctaUrl: appendUtm('/upscale', 'winback-credit-holder-21d', 'unused-credits'),
            preferenceUrl: '/dashboard/settings',
          },
          metadata: {
            credits_remaining: totalCredits,
            cta_destination: '/upscale',
            days_since_last_session: inactiveDays,
          },
        });
      }

      if (purchased && inactiveDays >= 45) {
        candidates.push({
          campaignKey: 'winback-former-buyer-45d',
          userId,
          recipientEmail: email,
          templateData: {
            ctaUrl: appendUtm('/upscale', 'winback-former-buyer-45d', 'win-back'),
            preferenceUrl: '/dashboard/settings',
            reason: 'Try a new image workflow',
          },
          metadata: { cta_destination: '/upscale', days_since_last_session: inactiveDays },
        });
      }

      if (String(profile.subscription_status || '') === 'active' && inactiveDays >= 5) {
        candidates.push({
          campaignKey: 'subscription-idle-5d',
          userId,
          recipientEmail: email,
          templateData: {
            headline: 'Your plan includes features you have not tried yet',
            featureList: ['Batch processing', 'Ultra upscaling', 'Text preservation'],
            ctaUrl: appendUtm('/upscale', 'subscription-idle-5d', 'feature-reminder'),
            preferenceUrl: '/dashboard/settings',
          },
          metadata: { cta_destination: '/upscale', days_since_last_session: inactiveDays },
        });
      }

      if (
        cancelingPeriodEnd &&
        cancelingPeriodEnd.getTime() > now &&
        cancelingPeriodEnd.getTime() - now <= 7 * 24 * 60 * 60 * 1000
      ) {
        candidates.push({
          campaignKey: 'cancelled-period-ending',
          userId,
          recipientEmail: email,
          subscriptionId: cancelingSubscription?.id,
          templateData: {
            ctaUrl: appendUtm('/pricing', 'cancelled-period-ending', 'win-back'),
            preferenceUrl: '/dashboard/settings',
            reason: 'Keep access to premium models',
          },
          metadata: {
            cta_destination: '/pricing',
            period_end: cancelingPeriodEnd.toISOString(),
            days_since_last_session: inactiveDays,
          },
        });
      }

      const blogIntent = this.getIntentFromProcessingMode(lastJob?.processingMode);
      if (blogIntent && lastJobAt && inactiveDays >= 2) {
        const recommendation = await this.contentService.recommendForIntent(blogIntent);
        const campaignKey = `blog-education-${blogIntent}`;
        candidates.push({
          campaignKey,
          userId,
          recipientEmail: email,
          templateData: {
            articleTitle: recommendation.title,
            articleDescription: recommendation.description,
            articleUrl: appendUtm(recommendation.url, campaignKey, 'blog-education'),
            productCtaUrl: appendUtm(recommendation.productCtaUrl, campaignKey, 'blog-education'),
            productCtaLabel: recommendation.productCtaLabel,
            preferenceUrl: '/dashboard/settings',
          },
          metadata: {
            blog_slug: recommendation.slug,
            intent: blogIntent,
            cta_destination: recommendation.productCtaUrl,
            days_since_last_session: inactiveDays,
          },
        });
      }

      for (const candidate of candidates) {
        if (dryRun) {
          lifecycleQueued++;
          continue;
        }
        const outcome = await this.queueLifecycleEmail(candidate);
        if (outcome.queued) lifecycleQueued++;
        if (outcome.suppressionRecorded === true) suppressionsRecorded++;
        if (outcome.suppressionRecorded === false) suppressionsReused++;
      }
    }

    const recoveryResult = await getRevenueRecoveryService().queueEligibleRecoveryEmails({
      dryRun,
      limit,
    });

    return {
      queued: lifecycleQueued + recoveryResult.queued,
      lifecycleQueued,
      suppressionsRecorded: suppressionsRecorded + recoveryResult.suppressionsRecorded,
      suppressionsReused: suppressionsReused + recoveryResult.suppressionsReused,
      recovery: recoveryResult,
    };
  }

  async cancelPendingForUser(
    userId: string,
    reason: string,
    campaignKeys?: string[]
  ): Promise<number> {
    let query = supabaseAdmin
      .from('email_lifecycle_queue')
      .update({ status: 'cancelled', reason, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (campaignKeys?.length) {
      query = query.in('campaign_key', campaignKeys);
    }

    const { data, error } = await query.select('id');
    if (error) {
      throw new Error(`Failed to cancel lifecycle queue: ${error.message}`);
    }
    return (data || []).length;
  }

  async recordClick(params: {
    queueId: string;
    destination: string;
  }): Promise<{ redirectUrl: string }> {
    const { data, error } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .select('*')
      .eq('id', params.queueId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load clicked lifecycle email: ${error.message}`);
    }
    if (!data) {
      throw new Error('Lifecycle email queue row not found');
    }

    const row = data as IQueueRow;
    const campaign = await this.getCampaign(row.campaign_key);
    const safeDestination = normalizeInternalDestination(params.destination);
    const redirectUrl = appendUtm(
      safeDestination,
      row.campaign_key,
      campaign?.template_name ?? row.campaign_key
    );

    await this.recordLifecycleEvent({
      queueId: row.id,
      userId: row.user_id,
      campaignKey: row.campaign_key,
      eventType: 'clicked',
      metadata: { cta_destination: safeDestination },
    });
    await this.recordLifecycleEvent({
      queueId: row.id,
      userId: row.user_id,
      campaignKey: row.campaign_key,
      eventType: 'returned',
      metadata: { cta_destination: safeDestination },
    });
    if (campaign) {
      await this.trackLifecycleAnalytics('email_lifecycle_clicked', row.user_id, campaign, {
        cta_destination: safeDestination,
        blog_slug: row.metadata?.blog_slug,
      });
      await this.trackLifecycleAnalytics('email_lifecycle_returned', row.user_id, campaign, {
        cta_destination: safeDestination,
        blog_slug: row.metadata?.blog_slug,
      });
    }
    if (row.user_id) {
      await this.cancelPendingForUser(row.user_id, 'returned_from_lifecycle_email');
    }

    return { redirectUrl };
  }

  createClickToken(queueId: string, destination: string): string {
    const payload = `${queueId}|${destination}`;
    return createHmac('sha256', serverEnv.CRON_SECRET || serverEnv.BASE_URL)
      .update(payload)
      .digest('hex');
  }

  verifyClickToken(queueId: string, destination: string, token: string): boolean {
    const expected = this.createClickToken(queueId, destination);
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(token);
    return (
      expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  async recordLifecycleEvent(params: {
    queueId?: string | null;
    userId?: string | null;
    eventType: LifecycleEventType;
    campaignKey?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await supabaseAdmin.from('email_lifecycle_events').insert({
      queue_id: params.queueId ?? null,
      user_id: params.userId ?? null,
      event_type: params.eventType,
      campaign_key: params.campaignKey ?? null,
      metadata: params.metadata ?? {},
    });

    if (error) {
      console.error('Failed to record lifecycle email event', error);
    }
  }

  async recordPurchaseAttribution(
    userId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const { data, error } = await supabaseAdmin
        .from('email_lifecycle_events')
        .select('queue_id, campaign_key, occurred_at')
        .eq('user_id', userId)
        .eq('event_type', 'clicked')
        .gte('occurred_at', daysAgo(7))
        .order('occurred_at', { ascending: false })
        .limit(1);

      if (error || !data?.[0]) {
        if (error) console.error('Failed to query lifecycle purchase attribution', error);
        return;
      }

      await this.recordLifecycleEvent({
        queueId: data[0].queue_id,
        userId,
        campaignKey: data[0].campaign_key,
        eventType: 'purchased_after_email',
        metadata: metadata ?? {},
      });
      await trackServerEvent(
        'email_lifecycle_purchase_attributed',
        {
          campaign_key: data[0].campaign_key,
          ...metadata,
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
      );
      await this.cancelPendingForUser(userId, 'purchased_after_lifecycle_email');
    } catch (error) {
      console.error('Failed to record lifecycle purchase attribution', error);
    }
  }

  private async prepareTemplateData(
    row: IQueueRow,
    campaign: ICampaign
  ): Promise<Record<string, unknown>> {
    const data = { ...(row.template_data || {}) };
    const withClick = (url: unknown): unknown => {
      if (typeof url !== 'string') return url;
      const destination = normalizeInternalDestination(url);
      const token = this.createClickToken(row.id, destination);
      return `/api/email/click?q=${encodeURIComponent(row.id)}&url=${encodeURIComponent(destination)}&token=${token}`;
    };

    return {
      ...data,
      campaignKey: campaign.key,
      templateKey: campaign.template_name,
      ctaUrl: withClick(data.ctaUrl),
      articleUrl: withClick(data.articleUrl),
      productCtaUrl: withClick(data.productCtaUrl),
      preferenceUrl: withClick(data.preferenceUrl ?? '/dashboard/settings'),
    };
  }

  private async insertQueueRow(params: {
    campaign: ICampaign;
    user: IUserEmailContext;
    status: LifecycleQueueStatus;
    scheduledFor: Date;
    reason?: string;
    templateData?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    subscriptionId?: string;
  }): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .insert({
        campaign_key: params.campaign.key,
        user_id: params.user.id,
        recipient_email: params.user.email,
        scheduled_for: params.scheduledFor.toISOString(),
        status: params.status,
        reason: params.reason ?? null,
        template_data: {
          userName: params.user.userName ?? 'there',
          ...(params.templateData ?? {}),
        },
        metadata: params.metadata ?? {},
        subscription_id: params.subscriptionId ?? null,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505' && params.status === 'pending') {
        const { data: existing, error: existingError } = await supabaseAdmin
          .from('email_lifecycle_queue')
          .select('id')
          .eq('user_id', params.user.id)
          .eq('campaign_key', params.campaign.key)
          .eq('status', 'pending')
          .maybeSingle();
        if (!existingError && existing?.id) {
          return String(existing.id);
        }
      }
      throw new Error(`Failed to queue lifecycle email: ${error.message}`);
    }

    return String(data.id);
  }

  private async recordSuppressionDecision(params: {
    campaign: ICampaign;
    user: IUserEmailContext;
    scheduledFor: Date;
    reason: string;
    templateData?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    subscriptionId?: string;
  }): Promise<{ queueId: string; recorded: boolean }> {
    const { data, error } = await supabaseAdmin.rpc('record_email_lifecycle_suppression', {
      p_campaign_key: params.campaign.key,
      p_user_id: params.user.id,
      p_recipient_email: params.user.email,
      p_scheduled_for: params.scheduledFor.toISOString(),
      p_reason: params.reason,
      p_template_data: {
        userName: params.user.userName ?? 'there',
        ...(params.templateData ?? {}),
      },
      p_metadata: params.metadata ?? {},
      p_subscription_id: params.subscriptionId ?? null,
    });
    const row = (data as Array<{ queue_id?: string; inserted?: boolean }> | null)?.[0];
    if (error || !row?.queue_id) {
      throw new Error(`Failed to record lifecycle suppression: ${error?.message ?? 'missing row'}`);
    }
    return { queueId: String(row.queue_id), recorded: row.inserted === true };
  }

  private async markQueueRow(
    queueId: string,
    status: LifecycleQueueStatus,
    reason?: string
  ): Promise<void> {
    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (reason) update.reason = reason;
    if (status === 'sent') update.sent_at = new Date().toISOString();
    update.processing_claim_id = null;
    update.processing_claimed_at = null;

    const { error } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .update(update)
      .eq('id', queueId);
    if (error) {
      throw new Error(`Failed to update lifecycle queue row: ${error.message}`);
    }
  }

  private async claimQueueRow(
    queueId: string
  ): Promise<'claimed' | 'not_claimed' | 'capacity_exhausted'> {
    const { data, error } = await supabaseAdmin.rpc(
      'claim_email_lifecycle_queue_row_for_delivery',
      {
        p_queue_id: queueId,
        p_claim_id: crypto.randomUUID(),
        p_marketing_daily_limit: 200,
      }
    );
    if (error) {
      throw new Error(`Failed to claim lifecycle queue row: ${error.message}`);
    }
    return data === 'claimed' || data === 'capacity_exhausted' ? data : 'not_claimed';
  }

  private async rescheduleQueueRow(
    queueId: string,
    reason: string,
    category = 'transient_provider_failure'
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .update({
        status: 'pending',
        reason: `${category}:${reason}`,
        scheduled_for: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        processing_claim_id: null,
        processing_claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId);
    if (error) throw new Error(`Failed to reschedule lifecycle queue row: ${error.message}`);
  }

  private async getCampaign(campaignKey: string): Promise<ICampaign | null> {
    const { data, error } = await supabaseAdmin
      .from('email_lifecycle_campaigns')
      .select('*')
      .eq('key', campaignKey)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load lifecycle campaign ${campaignKey}: ${error.message}`);
    }

    return (data as ICampaign | null) ?? null;
  }

  private async getSuppressionReason(
    campaign: ICampaign,
    userId: string,
    options: {
      historyMode: LifecycleHistoryMode;
      forceFrequency?: boolean;
      queueId?: string;
    }
  ): Promise<string | null> {
    if (campaign.email_type === 'transactional') return null;

    if (!campaign.enabled) return 'campaign_disabled';

    if (campaign.preference_key) {
      const allowed = await this.isPreferenceAllowed(userId, campaign.preference_key);
      if (!allowed) return 'suppressed_preference';
    }

    if (await this.hasBounceOrComplaintStatus(userId)) {
      return 'suppressed_email_status';
    }

    if (
      options.historyMode === 'enqueue' &&
      (await this.hasPendingCampaignRow(userId, campaign.key, options.queueId))
    ) {
      return 'suppressed_campaign_cooldown';
    }

    if (options.forceFrequency) return null;

    const recentSame = await this.hasRecentSentCampaignRow(
      userId,
      campaign.key,
      campaign.cooldown_days,
      options.queueId
    );
    if (recentSame) return 'suppressed_campaign_cooldown';

    const allMarketingLast7Days = await this.countRecentMarketing(
      userId,
      MARKETING_CAP_DAYS,
      options.queueId
    );
    const revenueCriticalLast72Hours = await this.countRecentMarketingByPriorities(
      userId,
      ['revenue_critical'],
      REVENUE_CRITICAL_CAP_HOURS / 24,
      options.queueId
    );
    const revenueCriticalLast7Days = await this.countRecentMarketingByPriorities(
      userId,
      ['revenue_critical'],
      MARKETING_CAP_DAYS,
      options.queueId
    );
    const lifecycleEducationLast7Days = await this.countRecentMarketingByPriorities(
      userId,
      ['lifecycle', 'education'],
      MARKETING_CAP_DAYS,
      options.queueId
    );

    return evaluateCampaignFrequencyCap({
      priority: campaign.priority,
      revenueCriticalLast72Hours,
      revenueCriticalLast7Days,
      lifecycleEducationLast7Days,
      allMarketingLast7Days,
    });
  }

  private async isPreferenceAllowed(
    userId: string,
    preferenceKey: EmailPreferenceKey
  ): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('email_preferences')
      .select(preferenceKey)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load email preferences', error);
      throw new Error(`Failed to load email preferences: ${error.message}`);
    }
    return (data as Record<EmailPreferenceKey, boolean> | null)?.[preferenceKey] !== false;
  }

  private async getRecentSuppressionQueueId(
    userId: string,
    campaignKey: string,
    reason: string
  ): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('campaign_key', campaignKey)
      .eq('status', 'skipped')
      .eq('reason', reason)
      .gte('created_at', daysAgo(1))
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      throw new Error(`Failed to check lifecycle suppression audit: ${error.message}`);
    }
    return data?.[0]?.id ? String(data[0].id) : null;
  }

  private async hasPendingCampaignRow(
    userId: string,
    campaignKey: string,
    excludeQueueId?: string
  ): Promise<boolean> {
    let query = supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('campaign_key', campaignKey)
      .eq('status', 'pending')
      .limit(1);
    if (excludeQueueId) query = query.neq('id', excludeQueueId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to check pending lifecycle campaign: ${error.message}`);
    return !!data?.length;
  }

  private async hasRecentSentCampaignRow(
    userId: string,
    campaignKey: string,
    days: number,
    excludeQueueId?: string
  ): Promise<boolean> {
    let query = supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('campaign_key', campaignKey)
      .eq('status', LIFECYCLE_DELIVERED_HISTORY_STATUS)
      .gte('created_at', daysAgo(days))
      .limit(1);
    if (excludeQueueId) query = query.neq('id', excludeQueueId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to check lifecycle cooldown: ${error.message}`);
    return !!data?.length;
  }

  private async hasRecentCategory(
    userId: string,
    category: string,
    days: number,
    excludeQueueId?: string
  ): Promise<boolean> {
    const campaignKeys = await this.getCampaignKeysByCategory(category);
    if (!campaignKeys.length) return false;
    let query = supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id')
      .eq('user_id', userId)
      .in('campaign_key', campaignKeys)
      .eq('status', LIFECYCLE_DELIVERED_HISTORY_STATUS)
      .gte('created_at', daysAgo(days))
      .limit(1);
    if (excludeQueueId) query = query.neq('id', excludeQueueId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to check lifecycle category cooldown: ${error.message}`);
    return !!data?.length;
  }

  private async countRecentMarketing(
    userId: string,
    days: number,
    excludeQueueId?: string
  ): Promise<number> {
    const campaignKeys = await this.getMarketingCampaignKeys();
    if (!campaignKeys.length) return 0;
    let query = supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id')
      .eq('user_id', userId)
      .in('campaign_key', campaignKeys)
      .eq('status', LIFECYCLE_DELIVERED_HISTORY_STATUS)
      .gte('created_at', daysAgo(days));
    if (excludeQueueId) query = query.neq('id', excludeQueueId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to check lifecycle marketing cap: ${error.message}`);
    return data?.length ?? 0;
  }

  private async countRecentMarketingByPriorities(
    userId: string,
    priorities: CampaignPriority[],
    days: number,
    excludeQueueId?: string
  ): Promise<number> {
    const { data: campaigns, error: campaignError } = await supabaseAdmin
      .from('email_lifecycle_campaigns')
      .select('key')
      .eq('email_type', 'marketing')
      .in('priority', priorities);
    if (campaignError) {
      throw new Error(`Failed to load lifecycle campaign priorities: ${campaignError.message}`);
    }
    const campaignKeys = (campaigns || []).map(row => String(row.key));
    if (!campaignKeys.length) return 0;

    let query = supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id')
      .eq('user_id', userId)
      .in('campaign_key', campaignKeys)
      .eq('status', LIFECYCLE_DELIVERED_HISTORY_STATUS)
      .gte('created_at', daysAgo(days));
    if (excludeQueueId) query = query.neq('id', excludeQueueId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to check lifecycle priority cap: ${error.message}`);
    return data?.length ?? 0;
  }

  private async countRecentLifecycle(
    userId: string,
    days: number,
    excludeQueueId?: string
  ): Promise<number> {
    let query = supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['pending', 'sent'])
      .gte('created_at', daysAgo(days));
    if (excludeQueueId) query = query.neq('id', excludeQueueId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to check lifecycle total cap: ${error.message}`);
    return data?.length ?? 0;
  }

  private async hasBounceOrComplaintStatus(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('email_logs')
      .select('provider_response, status')
      .eq('user_id', userId)
      .eq('status', 'failed')
      .gte('sent_at', daysAgo(90))
      .order('sent_at', { ascending: false })
      .limit(20);
    if (error) {
      console.error('Failed to check lifecycle email status suppression', error);
      throw new Error(`Failed to check lifecycle email status suppression: ${error.message}`);
    }

    return (data || []).some(row => hasPermanentEmailFailureSignal(row.provider_response));
  }

  private getCampaignFromQueueRow(row: IQueueRow): ICampaign | null {
    if (
      !row.campaign_name ||
      !row.campaign_category ||
      !row.campaign_template_name ||
      !row.campaign_email_type ||
      !row.campaign_priority ||
      row.campaign_enabled === undefined ||
      row.campaign_cooldown_days === undefined ||
      row.campaign_sort_priority === undefined
    ) {
      return null;
    }
    return {
      key: row.campaign_key,
      name: row.campaign_name,
      category: row.campaign_category,
      template_name: row.campaign_template_name,
      email_type: row.campaign_email_type,
      preference_key: row.campaign_preference_key ?? null,
      enabled: row.campaign_enabled,
      cooldown_days: row.campaign_cooldown_days,
      priority: row.campaign_priority,
      sort_priority: row.campaign_sort_priority,
    };
  }

  private async getCampaignKeysByCategory(category: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
      .from('email_lifecycle_campaigns')
      .select('key')
      .eq('category', category);
    if (error) throw new Error(`Failed to load lifecycle campaign category: ${error.message}`);
    return (data || []).map(row => String(row.key));
  }

  private async getMarketingCampaignKeys(): Promise<string[]> {
    const { data, error } = await supabaseAdmin
      .from('email_lifecycle_campaigns')
      .select('key')
      .eq('email_type', 'marketing');
    if (error) throw new Error(`Failed to load marketing lifecycle campaigns: ${error.message}`);
    return (data || []).map(row => String(row.key));
  }

  private async getUserEmailContext(
    userId: string,
    fallbackEmail?: string
  ): Promise<IUserEmailContext | null> {
    const email = fallbackEmail ?? (await this.resolveUserEmail(userId));
    if (!email) return null;
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return {
      id: userId,
      email,
      userName:
        (data.user?.user_metadata?.full_name as string | undefined) ||
        (data.user?.user_metadata?.name as string | undefined),
    };
  }

  private async resolveUserEmail(userId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) {
      console.error('Failed to resolve lifecycle email recipient', error);
      return null;
    }
    return data.user?.email ?? null;
  }

  private async userHasCompletedJob(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('processing_jobs')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .limit(1);
    if (error) return false;
    return !!data?.length;
  }

  private async userHasPurchase(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .in('type', ['purchase', 'subscription'])
      .limit(1);
    if (error) return false;
    return !!data?.length;
  }

  private async getCancelingSubscription(
    userId: string
  ): Promise<{ id: string; periodEnd: Date } | null> {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, current_period_end')
      .eq('user_id', userId)
      .eq('cancel_at_period_end', true)
      .in('status', ['active', 'trialing'])
      .order('current_period_end', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data?.current_period_end) return null;
    return { id: String(data.id), periodEnd: new Date(String(data.current_period_end)) };
  }

  private async getLastCompletedJob(
    userId: string
  ): Promise<{ completedAt: Date; processingMode?: string } | null> {
    const { data, error } = await supabaseAdmin
      .from('processing_jobs')
      .select('completed_at, created_at, processing_mode')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      completedAt: new Date(String(data.completed_at ?? data.created_at)),
      processingMode: data.processing_mode ? String(data.processing_mode) : undefined,
    };
  }

  private getIntentFromProcessingMode(processingMode?: string): LifecycleIntent | null {
    if (!processingMode) return null;
    if (processingMode === 'portrait') return 'face-restore';
    if (processingMode === 'product') return 'ecommerce';
    if (processingMode === 'enhanced') return 'hd-ultra';
    return null;
  }

  private async trackLifecycleAnalytics(
    eventName:
      | 'email_lifecycle_queued'
      | 'email_lifecycle_sent'
      | 'email_lifecycle_skipped'
      | 'email_lifecycle_clicked'
      | 'email_lifecycle_returned',
    userId: string | null | undefined,
    campaign: ICampaign,
    extra?: Record<string, unknown>
  ): Promise<void> {
    await trackServerEvent(
      eventName,
      {
        campaign_key: campaign.key,
        template_name: campaign.template_name,
        category: campaign.category,
        preference_key: campaign.preference_key,
        ...extra,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: userId ?? undefined }
    );
  }
}

let lifecycleServiceInstance: EmailLifecycleService | null = null;

export function getEmailLifecycleService(): EmailLifecycleService {
  if (!lifecycleServiceInstance) {
    lifecycleServiceInstance = new EmailLifecycleService();
  }
  return lifecycleServiceInstance;
}
