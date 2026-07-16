import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';
import {
  getAmplitudeCohortService,
  type AmplitudeCohortService,
  type IAmplitudeCohortMember,
} from '@server/services/amplitude-cohort.service';
import { CREDIT_COSTS } from '@shared/config/credits.config';

export type RecoveryAudienceKey =
  | 'checkout_abandoner'
  | 'upgrade_click_no_purchase'
  | 'credit_wall_dismissed'
  | 'high_usage_free_user';

export interface IImportRecoveryCohortInput {
  cohortId: string;
  audienceKey: RecoveryAudienceKey;
  dryRun?: boolean;
  limit?: number;
}

export interface IImportRecoveryCohortResult {
  dryRun: boolean;
  cohortId: string;
  audienceKey: RecoveryAudienceKey;
  totalMembers: number;
  matchedProfiles: number;
  unmatched: number;
  skippedMissingEmail: number;
  alreadyPurchased: number;
  upsertedIntents: number;
  queuedEmails: number;
  duplicatePending: number;
}

export interface ICaptureRecoveryAnalyticsIntentInput {
  userId?: string;
  eventName: string;
  properties?: Record<string, unknown>;
  sessionId?: string;
}

export interface IPersistCheckoutIntentContextInput {
  userId: string;
  priceId: string;
  purchaseType: 'subscription' | 'credit_pack';
  selectedKey?: string;
  pricingRegion?: string;
  stripeCheckoutSessionId: string;
}

export interface IMarkRecoveryConvertedInput {
  userId: string;
  purchaseType: 'subscription' | 'credit_pack';
  stripeCheckoutSessionId: string;
  amountCents?: number;
  planKey?: string;
  packKey?: string;
}

export interface IQueueRecoveryEligibilityResult {
  scanned: number;
  eligible: number;
  queued: number;
  skippedPurchased: number;
  skippedPriority: number;
  skippedMissingEmail: number;
  suppressionsRecorded: number;
  suppressionsReused: number;
  dryRun: boolean;
  byAudience: Record<
    RecoveryAudienceKey,
    {
      scanned: number;
      eligible: number;
      queued: number;
      skippedPurchased: number;
      skippedPriority: number;
      skippedMissingEmail: number;
    }
  >;
}

interface IRevenueRecoveryServiceOptions {
  amplitudeService?: AmplitudeCohortService;
  lifecycleService?: ReturnType<typeof getEmailLifecycleService>;
}

interface IResolvedRecoveryUser {
  userId: string;
  email: string | null;
}

const AUDIENCE_CAMPAIGN_MAP: Record<RecoveryAudienceKey, string> = {
  checkout_abandoner: 'checkout-abandoned-24h',
  upgrade_click_no_purchase: 'upgrade-click-no-purchase-24h',
  credit_wall_dismissed: 'credit-wall-dismissed-48h',
  high_usage_free_user: 'high-usage-free-user',
};

const AUDIENCE_PRIORITY: Record<RecoveryAudienceKey, number> = {
  checkout_abandoner: 1,
  upgrade_click_no_purchase: 2,
  credit_wall_dismissed: 3,
  high_usage_free_user: 4,
};

const RECOVERY_DELAY_HOURS: Record<RecoveryAudienceKey, number> = {
  checkout_abandoner: 24,
  upgrade_click_no_purchase: 24,
  credit_wall_dismissed: 24,
  high_usage_free_user: 0,
};

const RECOVERY_PRIORITY_SUPPRESSION_DAYS = 7;
const RECOVERY_INTENT_TTL_DAYS = 7;
const RECOVERY_CONSENT_BASIS = 'email_preferences.marketing_emails';

export class RevenueRecoveryService {
  private readonly amplitudeService: AmplitudeCohortService;
  private readonly lifecycleService: ReturnType<typeof getEmailLifecycleService>;

  constructor(options: IRevenueRecoveryServiceOptions = {}) {
    this.amplitudeService = options.amplitudeService ?? getAmplitudeCohortService();
    this.lifecycleService = options.lifecycleService ?? getEmailLifecycleService();
  }

  async captureAnalyticsIntent(input: ICaptureRecoveryAnalyticsIntentInput): Promise<boolean> {
    if (!input.userId) return false;

    const audienceKey = this.getAudienceKeyForAnalyticsEvent(input.eventName, input.properties);
    if (!audienceKey) return false;

    const verifiedUser = await this.getVerifiedAuthUserById(input.userId);
    if (!verifiedUser || !(await this.hasMarketingConsent(input.userId))) return false;

    const verifiedAt = new Date();

    await this.upsertRecoveryIntent({
      userId: input.userId,
      audienceKey,
      source: 'first_party_event',
      sourceId: input.sessionId,
      priceId: this.getStringProperty(input.properties, 'priceId'),
      purchaseType: this.normalizePurchaseType(
        this.getStringProperty(input.properties, 'purchaseType') ||
          this.getStringProperty(input.properties, 'selectedType')
      ),
      selectedKey:
        this.getStringProperty(input.properties, 'selectedKey') ||
        this.getStringProperty(input.properties, 'plan') ||
        this.getStringProperty(input.properties, 'pack'),
      trigger: this.getStringProperty(input.properties, 'trigger'),
      pricingRegion: this.getStringProperty(input.properties, 'pricingRegion'),
      creditsRemaining: this.getNumberProperty(input.properties, 'creditsRemaining'),
      freeUsageCount: this.getNumberProperty(input.properties, 'freeUsageCount'),
      identityVerifiedAt: verifiedAt.toISOString(),
      consentBasis: RECOVERY_CONSENT_BASIS,
      sourceSurface:
        this.getStringProperty(input.properties, 'sourceSurface') ||
        this.getStringProperty(input.properties, 'checkoutTrigger') ||
        this.getStringProperty(input.properties, 'trigger') ||
        'analytics_event',
      expiresAt: this.getRecoveryIntentExpiry(verifiedAt),
      context: {
        event_name: input.eventName,
        session_id: input.sessionId,
        source_properties: this.pickContextProperties(input.properties, [
          'checkoutStep',
          'checkoutTrigger',
          'trigger',
          'selectedType',
          'selectedKey',
          'priceId',
          'pricingRegion',
          'creditsRemaining',
          'freeUsageCount',
        ]),
      },
    });

    return true;
  }

  async persistCheckoutIntentContext(input: IPersistCheckoutIntentContextInput): Promise<boolean> {
    const verifiedUser = await this.getVerifiedAuthUserById(input.userId);
    if (!verifiedUser || !(await this.hasMarketingConsent(input.userId))) return false;

    const verifiedAt = new Date();
    await this.upsertRecoveryIntent({
      userId: input.userId,
      audienceKey: 'checkout_abandoner',
      source: 'checkout_session',
      sourceId: input.stripeCheckoutSessionId,
      priceId: input.priceId,
      purchaseType: input.purchaseType,
      selectedKey: input.selectedKey,
      pricingRegion: input.pricingRegion,
      identityVerifiedAt: verifiedAt.toISOString(),
      consentBasis: RECOVERY_CONSENT_BASIS,
      sourceSurface: 'checkout_session',
      expiresAt: this.getRecoveryIntentExpiry(verifiedAt),
      context: {},
    });

    return true;
  }

  async markUserConverted(input: IMarkRecoveryConvertedInput): Promise<number> {
    const now = new Date().toISOString();
    let query = supabaseAdmin
      .from('revenue_recovery_intents')
      .update({
        status: 'converted',
        converted_at: now,
        last_seen_at: now,
        context: {
          conversion: {
            purchase_type: input.purchaseType,
            stripe_checkout_session_id: input.stripeCheckoutSessionId,
            amount_cents: input.amountCents,
            plan_key: input.planKey,
            pack_key: input.packKey,
          },
        },
      })
      .eq('user_id', input.userId)
      .in('status', ['active', 'queued'])
      .select('id');

    const { data, error } = await query;
    if (error) throw new Error(`Failed to mark recovery intent converted: ${error.message}`);

    await this.lifecycleService.cancelPendingForUser(
      input.userId,
      'purchased_after_recovery_intent',
      Object.values(AUDIENCE_CAMPAIGN_MAP)
    );

    return (data || []).length;
  }

  async queueEligibleRecoveryEmails(options?: {
    dryRun?: boolean;
    limit?: number;
  }): Promise<IQueueRecoveryEligibilityResult> {
    const dryRun = options?.dryRun ?? false;
    const limit = options?.limit ?? 100;
    const result: IQueueRecoveryEligibilityResult = {
      scanned: 0,
      eligible: 0,
      queued: 0,
      skippedPurchased: 0,
      skippedPriority: 0,
      skippedMissingEmail: 0,
      suppressionsRecorded: 0,
      suppressionsReused: 0,
      dryRun,
      byAudience: this.createEmptyAudienceCounts(),
    };

    await this.expireAndMinimizeRecoveryIntents();
    const intents = await this.getActiveRecoveryIntents(limit);
    await this.addHighUsageFreeUserIntents(intents, limit, dryRun);
    intents.sort(
      (left, right) =>
        AUDIENCE_PRIORITY[left.audienceKey] - AUDIENCE_PRIORITY[right.audienceKey] ||
        new Date(left.lastSeenAt).getTime() - new Date(right.lastSeenAt).getTime()
    );

    const seenUsers = new Set<string>();
    for (const intent of intents.slice(0, limit)) {
      const audienceCounts = result.byAudience[intent.audienceKey];
      result.scanned++;
      audienceCounts.scanned++;
      if (seenUsers.has(intent.userId)) {
        result.skippedPriority++;
        audienceCounts.skippedPriority++;
        continue;
      }
      if (!this.isRecoveryIntentDelayedEnough(intent)) continue;
      if (await this.userHasPurchase(intent.userId)) {
        result.skippedPurchased++;
        audienceCounts.skippedPurchased++;
        continue;
      }
      if (await this.hasHigherPriorityRecovery(intent.userId, intent.audienceKey)) {
        result.skippedPriority++;
        audienceCounts.skippedPriority++;
        continue;
      }

      const authUser = await this.getVerifiedAuthUserById(intent.userId);
      if (!authUser?.email || !(await this.hasMarketingConsent(intent.userId))) {
        result.skippedMissingEmail++;
        audienceCounts.skippedMissingEmail++;
        continue;
      }

      result.eligible++;
      audienceCounts.eligible++;
      seenUsers.add(intent.userId);
      if (dryRun) {
        result.queued++;
        audienceCounts.queued++;
        continue;
      }

      if (await this.hasPendingQueue(intent.userId, intent.audienceKey)) {
        result.skippedPriority++;
        audienceCounts.skippedPriority++;
        continue;
      }

      const queueResult = await this.lifecycleService.queueLifecycleEmail({
        campaignKey: AUDIENCE_CAMPAIGN_MAP[intent.audienceKey],
        userId: intent.userId,
        recipientEmail: authUser.email,
        scheduledFor: new Date(),
        templateData: this.getTemplateData(intent),
        metadata: {
          audience_key: intent.audienceKey,
          source: intent.source,
          source_id: intent.sourceId,
          cta_destination: this.getCtaDestination(intent),
        },
      });

      if (queueResult.queued) {
        result.queued++;
        audienceCounts.queued++;
        await this.markIntentQueued(intent.userId, intent.audienceKey);
      }
      if (queueResult.suppressionRecorded === true) result.suppressionsRecorded++;
      if (queueResult.suppressionRecorded === false) result.suppressionsReused++;
    }

    return result;
  }

  async importAmplitudeCohort(
    input: IImportRecoveryCohortInput
  ): Promise<IImportRecoveryCohortResult> {
    const dryRun = input.dryRun ?? true;
    const result: IImportRecoveryCohortResult = {
      dryRun,
      cohortId: input.cohortId,
      audienceKey: input.audienceKey,
      totalMembers: 0,
      matchedProfiles: 0,
      unmatched: 0,
      skippedMissingEmail: 0,
      alreadyPurchased: 0,
      upsertedIntents: 0,
      queuedEmails: 0,
      duplicatePending: 0,
    };

    if (!dryRun && !serverEnv.RECOVERY_EMAILS_ENABLED) {
      throw new Error('Recovery email queueing is disabled');
    }

    const members = await this.amplitudeService.downloadCohortMembers(input.cohortId);
    const boundedMembers =
      typeof input.limit === 'number' ? members.slice(0, input.limit) : members;
    const seenUsers = new Set<string>();
    result.totalMembers = boundedMembers.length;

    for (const member of boundedMembers) {
      const user = await this.resolveMember(member);
      if (!user) {
        result.unmatched++;
        continue;
      }
      result.matchedProfiles++;

      if (!user.email) {
        result.skippedMissingEmail++;
        continue;
      }

      const dedupeKey = `${user.userId}:${input.audienceKey}`;
      if (seenUsers.has(dedupeKey)) {
        result.duplicatePending++;
        continue;
      }
      seenUsers.add(dedupeKey);

      if (await this.userHasPurchase(user.userId)) {
        result.alreadyPurchased++;
        continue;
      }

      if (dryRun) continue;

      const upserted = await this.upsertImportedCohortIntent({
        userId: user.userId,
        audienceKey: input.audienceKey,
        cohortId: input.cohortId,
        member,
      });
      if (upserted) result.upsertedIntents++;

      if (await this.hasPendingQueue(user.userId, input.audienceKey)) {
        result.duplicatePending++;
        continue;
      }

      const queueResult = await this.lifecycleService.queueLifecycleEmail({
        campaignKey: AUDIENCE_CAMPAIGN_MAP[input.audienceKey],
        userId: user.userId,
        recipientEmail: user.email,
        scheduledFor: new Date(),
        templateData: this.getTemplateData({ audienceKey: input.audienceKey }),
        metadata: {
          audience_key: input.audienceKey,
          source: 'amplitude_cohort',
          source_id: input.cohortId,
          cta_destination: this.getCtaDestination({ audienceKey: input.audienceKey }),
        },
      });
      if (queueResult.queued) {
        result.queuedEmails++;
        await this.markIntentQueued(user.userId, input.audienceKey);
      } else if (queueResult.reason === 'suppressed_frequency_cap') {
        result.duplicatePending++;
      }
    }

    return result;
  }

  private async resolveMember(
    member: IAmplitudeCohortMember
  ): Promise<IResolvedRecoveryUser | null> {
    if (member.userId) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', member.userId)
        .maybeSingle();
      if (profile?.id) {
        const authUser = await this.getVerifiedAuthUserById(String(profile.id));
        return authUser ?? { userId: String(profile.id), email: null };
      }
    }

    if (!member.email) return null;
    return this.getVerifiedAuthUserByEmail(member.email);
  }

  private async getVerifiedAuthUserById(userId: string): Promise<IResolvedRecoveryUser | null> {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data.user?.email || !this.isEmailVerified(data.user)) return null;
    return { userId, email: data.user.email };
  }

  private async getVerifiedAuthUserByEmail(email: string): Promise<IResolvedRecoveryUser | null> {
    const normalizedEmail = email.toLowerCase();
    let page = 1;
    for (;;) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return null;
      const users = data.users ?? [];
      const match = users.find(
        user => user.email?.toLowerCase() === normalizedEmail && this.isEmailVerified(user)
      );
      if (match && (await this.profileExists(match.id))) {
        return { userId: match.id, email: match.email as string };
      }
      if (users.length < 1000) return null;
      page++;
    }
  }

  private async profileExists(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.id);
  }

  private isEmailVerified(user: {
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  }): boolean {
    return Boolean(user.email_confirmed_at || user.confirmed_at);
  }

  private async userHasPurchase(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .in('type', ['purchase', 'subscription'])
      .limit(1);
    if (error) return false;
    return Boolean(data?.length);
  }

  private async hasPendingQueue(
    userId: string,
    audienceKey: RecoveryAudienceKey
  ): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('campaign_key', AUDIENCE_CAMPAIGN_MAP[audienceKey])
      .eq('status', 'pending')
      .limit(1);
    if (error) throw new Error(`Failed to check pending recovery queue: ${error.message}`);
    return Boolean(data?.length);
  }

  private async getActiveRecoveryIntents(limit: number): Promise<
    Array<{
      userId: string;
      audienceKey: RecoveryAudienceKey;
      source: string;
      sourceId?: string;
      selectedKey?: string;
      trigger?: string;
      purchaseType?: 'subscription' | 'credit_pack';
      lastSeenAt: string;
    }>
  > {
    const { data, error } = await supabaseAdmin
      .from('revenue_recovery_intents')
      .select(
        'user_id, audience_key, source, source_id, selected_key, trigger, purchase_type, last_seen_at'
      )
      .in('audience_key', Object.keys(AUDIENCE_CAMPAIGN_MAP))
      .eq('status', 'active')
      .not('identity_verified_at', 'is', null)
      .eq('consent_basis', RECOVERY_CONSENT_BASIS)
      .gt('expires_at', new Date().toISOString())
      .order('last_seen_at', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Failed to scan recovery intents: ${error.message}`);

    return ((data || []) as Array<Record<string, unknown>>)
      .filter(row => this.isRecoveryAudienceKey(String(row.audience_key)))
      .map(row => ({
        userId: String(row.user_id),
        audienceKey: String(row.audience_key) as RecoveryAudienceKey,
        source: String(row.source),
        sourceId: row.source_id ? String(row.source_id) : undefined,
        selectedKey: row.selected_key ? String(row.selected_key) : undefined,
        trigger: row.trigger ? String(row.trigger) : undefined,
        purchaseType: this.normalizePurchaseType(
          row.purchase_type ? String(row.purchase_type) : undefined
        ),
        lastSeenAt: String(row.last_seen_at),
      }));
  }

  private async addHighUsageFreeUserIntents(
    intents: Array<{
      userId: string;
      audienceKey: RecoveryAudienceKey;
      source: string;
      sourceId?: string;
      selectedKey?: string;
      trigger?: string;
      purchaseType?: 'subscription' | 'credit_pack';
      lastSeenAt: string;
    }>,
    limit: number,
    dryRun: boolean
  ): Promise<void> {
    const remaining = Math.max(0, limit - intents.length);
    if (remaining === 0) return;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, subscription_status, subscription_credits_balance, purchased_credits_balance')
      .lte('subscription_credits_balance', 1)
      .eq('purchased_credits_balance', 0)
      .limit(remaining);
    if (error) throw new Error(`Failed to scan high usage free profiles: ${error.message}`);

    const existingUsers = new Set(intents.map(intent => intent.userId));
    for (const profile of (data || []) as Array<Record<string, unknown>>) {
      const userId = String(profile.id);
      if (existingUsers.has(userId)) continue;
      if (String(profile.subscription_status || '') === 'active') continue;
      if (await this.userHasPurchase(userId)) continue;

      const creditsRemaining = Number(profile.subscription_credits_balance ?? 0);
      const freeUsageCount = Math.max(0, CREDIT_COSTS.DEFAULT_FREE_CREDITS - creditsRemaining);
      if (freeUsageCount < CREDIT_COSTS.DEFAULT_FREE_CREDITS - 1) continue;

      if (!dryRun) {
        const verifiedUser = await this.getVerifiedAuthUserById(userId);
        if (!verifiedUser || !(await this.hasMarketingConsent(userId))) continue;
        const verifiedAt = new Date();
        await this.upsertRecoveryIntent({
          userId,
          audienceKey: 'high_usage_free_user',
          source: 'profile_credit_scan',
          creditsRemaining,
          freeUsageCount,
          identityVerifiedAt: verifiedAt.toISOString(),
          consentBasis: RECOVERY_CONSENT_BASIS,
          sourceSurface: 'profile_credit_scan',
          expiresAt: this.getRecoveryIntentExpiry(verifiedAt),
          context: {
            profile_subscription_status: profile.subscription_status,
          },
        });
      }

      intents.push({
        userId,
        audienceKey: 'high_usage_free_user',
        source: 'profile_credit_scan',
        lastSeenAt: new Date().toISOString(),
      });
      existingUsers.add(userId);
    }
  }

  private isRecoveryIntentDelayedEnough(intent: {
    audienceKey: RecoveryAudienceKey;
    lastSeenAt: string;
  }): boolean {
    const delayHours = RECOVERY_DELAY_HOURS[intent.audienceKey];
    if (delayHours <= 0) return true;
    return Date.now() - new Date(intent.lastSeenAt).getTime() >= delayHours * 60 * 60 * 1000;
  }

  private async hasHigherPriorityRecovery(
    userId: string,
    audienceKey: RecoveryAudienceKey
  ): Promise<boolean> {
    const higherCampaigns = Object.entries(AUDIENCE_CAMPAIGN_MAP)
      .filter(
        ([key]) => AUDIENCE_PRIORITY[key as RecoveryAudienceKey] < AUDIENCE_PRIORITY[audienceKey]
      )
      .map(([, campaignKey]) => campaignKey);
    if (!higherCampaigns.length) return false;

    const { data, error } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id')
      .eq('user_id', userId)
      .in('campaign_key', higherCampaigns)
      .in('status', ['pending', 'sent'])
      .gte(
        'created_at',
        new Date(
          Date.now() - RECOVERY_PRIORITY_SUPPRESSION_DAYS * 24 * 60 * 60 * 1000
        ).toISOString()
      )
      .limit(1);
    if (error) throw new Error(`Failed to check recovery priority suppression: ${error.message}`);
    return Boolean(data?.length);
  }

  private async upsertImportedCohortIntent(params: {
    userId: string;
    audienceKey: RecoveryAudienceKey;
    cohortId: string;
    member: IAmplitudeCohortMember;
  }): Promise<boolean> {
    const { error } = await supabaseAdmin.from('revenue_recovery_intents').upsert(
      this.stripUndefined({
        user_id: params.userId,
        audience_key: params.audienceKey,
        source: 'amplitude_cohort',
        source_id: params.cohortId,
        status: 'active',
        last_seen_at: new Date().toISOString(),
        context: this.stripUndefined({
          amplitude_id: params.member.amplitudeId,
          has_email_identifier: Boolean(params.member.email),
        }),
      }),
      { onConflict: 'user_id,audience_key' }
    );
    if (error) throw new Error(`Failed to upsert recovery intent: ${error.message}`);
    return true;
  }

  private async upsertRecoveryIntent(params: {
    userId: string;
    audienceKey: RecoveryAudienceKey;
    source: string;
    sourceId?: string;
    priceId?: string;
    purchaseType?: 'subscription' | 'credit_pack';
    selectedKey?: string;
    trigger?: string;
    pricingRegion?: string;
    creditsRemaining?: number;
    freeUsageCount?: number;
    identityVerifiedAt: string;
    consentBasis: typeof RECOVERY_CONSENT_BASIS;
    sourceSurface: string;
    expiresAt: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await supabaseAdmin.from('revenue_recovery_intents').upsert(
      this.stripUndefined({
        user_id: params.userId,
        audience_key: params.audienceKey,
        source: params.source,
        source_id: params.sourceId,
        price_id: params.priceId,
        purchase_type: params.purchaseType,
        selected_key: params.selectedKey,
        trigger: params.trigger,
        pricing_region: params.pricingRegion,
        credits_remaining: params.creditsRemaining,
        free_usage_count: params.freeUsageCount,
        identity_verified_at: params.identityVerifiedAt,
        consent_basis: params.consentBasis,
        source_surface: params.sourceSurface,
        expires_at: params.expiresAt,
        status: 'active',
        last_seen_at: new Date().toISOString(),
        context: this.stripUndefined(params.context),
      }),
      { onConflict: 'user_id,audience_key' }
    );
    if (error) throw new Error(`Failed to upsert recovery intent: ${error.message}`);
  }

  private async markIntentQueued(userId: string, audienceKey: RecoveryAudienceKey): Promise<void> {
    const { error } = await supabaseAdmin
      .from('revenue_recovery_intents')
      .update({ status: 'queued', queued_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('audience_key', audienceKey);
    if (error) throw new Error(`Failed to mark recovery intent queued: ${error.message}`);
  }

  private async hasMarketingConsent(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('email_preferences')
      .select('marketing_emails')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return false;
    return data?.marketing_emails === true;
  }

  private async expireAndMinimizeRecoveryIntents(): Promise<void> {
    const { error: legacyContextError } = await supabaseAdmin
      .from('revenue_recovery_intents')
      .update({ context: {} })
      .eq('status', 'active')
      .is('expires_at', null);
    if (legacyContextError) {
      throw new Error(`Failed to minimize legacy recovery intents: ${legacyContextError.message}`);
    }

    const { error } = await supabaseAdmin
      .from('revenue_recovery_intents')
      .update({ status: 'expired', context: {} })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());
    if (error) throw new Error(`Failed to expire recovery intents: ${error.message}`);
  }

  private getRecoveryIntentExpiry(verifiedAt: Date): string {
    return new Date(
      verifiedAt.getTime() + RECOVERY_INTENT_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  private getTemplateData(intent: {
    audienceKey: RecoveryAudienceKey;
    selectedKey?: string;
    trigger?: string;
    purchaseType?: 'subscription' | 'credit_pack';
  }): Record<string, unknown> {
    return {
      ctaUrl: this.getCtaDestination(intent),
      preferenceUrl: '/dashboard/settings',
      recoveryAudience: intent.audienceKey,
    };
  }

  private getCtaDestination(intent: {
    audienceKey: RecoveryAudienceKey;
    selectedKey?: string;
    trigger?: string;
    purchaseType?: 'subscription' | 'credit_pack';
  }): string {
    const params = new URLSearchParams({ intent: intent.audienceKey });

    if (intent.audienceKey === 'checkout_abandoner') {
      params.set('recovery', 'checkout-abandoned');
      if (intent.selectedKey) params.set('selected', intent.selectedKey);
      if (intent.purchaseType) params.set('type', intent.purchaseType);
      return `/pricing?${params.toString()}`;
    }

    if (intent.audienceKey === 'upgrade_click_no_purchase') {
      params.set('recovery', 'upgrade-click');
      params.set('trigger', intent.trigger || intent.selectedKey || 'upgrade_prompt');
      if (intent.selectedKey) params.set('selected', intent.selectedKey);
      return `/pricing?${params.toString()}`;
    }

    if (intent.audienceKey === 'credit_wall_dismissed') {
      params.set('recovery', 'credit-wall');
      params.set('trigger', intent.trigger || 'insufficient_credits');
      return `/pricing?${params.toString()}`;
    }

    params.set('recovery', 'free-limit');
    return `/pricing?${params.toString()}`;
  }

  private getAudienceKeyForAnalyticsEvent(
    eventName: string,
    properties: Record<string, unknown> = {}
  ): RecoveryAudienceKey | null {
    if (eventName === 'checkout_opened' || eventName === 'checkout_abandoned') {
      return 'checkout_abandoner';
    }
    if (eventName === 'upgrade_prompt_clicked') {
      return 'upgrade_click_no_purchase';
    }
    if (
      eventName === 'upgrade_prompt_dismissed' &&
      this.getStringProperty(properties, 'trigger') === 'insufficient_credits'
    ) {
      return 'credit_wall_dismissed';
    }
    return null;
  }

  private isRecoveryAudienceKey(value: string): value is RecoveryAudienceKey {
    return Object.prototype.hasOwnProperty.call(AUDIENCE_CAMPAIGN_MAP, value);
  }

  private createEmptyAudienceCounts(): IQueueRecoveryEligibilityResult['byAudience'] {
    return {
      checkout_abandoner: {
        scanned: 0,
        eligible: 0,
        queued: 0,
        skippedPurchased: 0,
        skippedPriority: 0,
        skippedMissingEmail: 0,
      },
      upgrade_click_no_purchase: {
        scanned: 0,
        eligible: 0,
        queued: 0,
        skippedPurchased: 0,
        skippedPriority: 0,
        skippedMissingEmail: 0,
      },
      credit_wall_dismissed: {
        scanned: 0,
        eligible: 0,
        queued: 0,
        skippedPurchased: 0,
        skippedPriority: 0,
        skippedMissingEmail: 0,
      },
      high_usage_free_user: {
        scanned: 0,
        eligible: 0,
        queued: 0,
        skippedPurchased: 0,
        skippedPriority: 0,
        skippedMissingEmail: 0,
      },
    };
  }

  private normalizePurchaseType(value?: string): 'subscription' | 'credit_pack' | undefined {
    if (value === 'subscription' || value === 'plan') return 'subscription';
    if (value === 'credit_pack' || value === 'credits' || value === 'pack') return 'credit_pack';
    return undefined;
  }

  private getStringProperty(
    properties: Record<string, unknown> | undefined,
    key: string
  ): string | undefined {
    const value = properties?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private getNumberProperty(
    properties: Record<string, unknown> | undefined,
    key: string
  ): number | undefined {
    const value = properties?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private pickContextProperties(
    properties: Record<string, unknown> | undefined,
    keys: string[]
  ): Record<string, unknown> {
    const selected: Record<string, unknown> = {};
    for (const key of keys) {
      const value = properties?.[key];
      if (value !== undefined && value !== null) selected[key] = value;
    }
    return selected;
  }

  private stripUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined)
    ) as T;
  }
}

export function getRevenueRecoveryService(): RevenueRecoveryService {
  return new RevenueRecoveryService();
}
