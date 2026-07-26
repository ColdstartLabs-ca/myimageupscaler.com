import { createHash, randomUUID } from 'node:crypto';
import { getPricingRegion, type PricingRegion } from '@shared/config/pricing-regions';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export const RECIPIENT_VALUE_POLICY_VERSION = 'v1' as const;
export const UNKNOWN_RECIPIENT_COUNTRY = 'UNKNOWN' as const;

export type RecipientValuePolicyVersion = typeof RECIPIENT_VALUE_POLICY_VERSION;
export type RecipientValueCampaignPriority =
  | 'transactional'
  | 'revenue_critical'
  | 'lifecycle'
  | 'education';
export type RecipientValueDecision =
  | 'protected'
  | 'keep_high'
  | 'keep_medium'
  | 'hold_experiment'
  | 'cancel';
export type RecipientValueBand = 'protected' | 'high' | 'medium' | 'experiment' | 'cancel';
export type RecipientValueRunAction = 'apply' | 'rollback';

export interface IRecipientValueIntentSignal {
  audienceKey: string;
  status?: string | null;
  lastSeenAt: string | Date;
}

export interface IRecipientValueInput {
  emailType: 'transactional' | 'marketing';
  campaignKey: string;
  campaignPriority: RecipientValueCampaignPriority;
  campaignSortPriority?: number;
  priorPackPurchase?: boolean;
  priorSubscriptionTransaction?: boolean;
  subscriptionStatus?: string | null;
  recentIntents?: readonly IRecipientValueIntentSignal[];
  recoveryIntents?: readonly IRecipientValueIntentSignal[];
  creditsConsumed?: number;
  lifetimeCreditsConsumed?: number;
  emailEngagedWithin90Days?: boolean;
  country?: string | null;
  createdAt: string | Date;
  scheduledFor: string | Date;
  now?: string | Date;
  suppressedReason?: string | null;
  concurrentClaim?: boolean;
  campaignMissing?: boolean;
}

export type IRecipientValueSignals = IRecipientValueInput;

export interface IRecipientValueClassification {
  score: number;
  baseScore: number;
  band: RecipientValueBand;
  decision: RecipientValueDecision;
  reasons: string[];
  policyVersion: RecipientValuePolicyVersion;
  normalizedCountry: string;
}

export interface IRecipientValueAuditOptions {
  pageSize?: number;
  onProgress?: (processedCount: number) => void;
}

export interface IRecipientValueSummary {
  candidateCount: number;
  candidateChecksum: string;
  byDecision: Record<string, number>;
  byReason: Record<string, number>;
  byCampaign: Record<string, number>;
  byCountry: Record<string, number>;
  byBand: Record<string, number>;
}

export interface IRecipientValueAuditResult {
  runId: string;
  summary: IRecipientValueSummary;
}

export interface IApplyRecipientValueRunInput {
  action: RecipientValueRunAction;
  runId: string;
  policyVersion: string;
  expectedCount: number;
}

export interface IApplyRecipientValueRunResult {
  runId: string;
  action: RecipientValueRunAction;
  mode: string;
  changedCount: number;
  cancelledCount: number;
  heldCount: number;
  keptCount: number;
}

export interface IClassifyRecipientValueEnqueueInput {
  campaignKey: string;
  userId: string;
  scheduledFor: Date;
}

export interface IEmailRecipientValuePerformanceRow {
  country: string;
  pricing_region: string;
  campaign_key: string;
  policy_version: string;
  value_band: string;
  classified_count: number;
  held_count: number;
  cancelled_count: number;
  sent_count: number;
  clicked_count: number;
  returned_count: number;
  purchased_after_email_count: number;
  send_to_purchase_conversion_rate: number | null;
  conversion_ci_lower: number | null;
  conversion_ci_upper: number | null;
  hard_bounce_count: number;
  complaint_count: number;
  hard_bounce_rate: number | null;
  complaint_rate: number | null;
  revenue_multiplier: number;
  evidence_status: string;
}

interface IQueueCandidate {
  id: string;
  campaign_key: string;
  user_id: string | null;
  scheduled_for: string;
  created_at: string;
  updated_at: string;
  status: 'pending';
  processing_claim_id: string | null;
  processing_claimed_at: string | null;
}

interface ICampaignSignal {
  key: string;
  email_type: 'transactional' | 'marketing';
  preference_key: 'marketing_emails' | 'product_updates' | 'low_credit_alerts' | null;
  priority: RecipientValueCampaignPriority;
  sort_priority: number;
}

interface IProfileSignal {
  id: string;
  signup_country: string | null;
  subscription_status: string | null;
}

interface IPreferenceSignal {
  user_id: string;
  marketing_emails?: boolean;
  product_updates?: boolean;
  low_credit_alerts?: boolean;
}

interface IRecoveryIntentSignalRow {
  user_id: string;
  audience_key: string;
  status: string;
  last_seen_at: string;
}

interface ICreditTransactionSignal {
  user_id: string;
  type: string;
  amount: number;
}

interface ITransactionSignalSummary {
  user_id: string;
  prior_pack_purchase: boolean;
  prior_subscription_transaction: boolean;
  credits_consumed: number;
}

interface ILifecycleEventSignal {
  user_id: string | null;
  event_type: string;
  occurred_at: string;
}

interface IEmailLogSignal {
  user_id: string | null;
  provider_response: unknown;
  status: string;
}

interface IPageSignals {
  campaigns: Map<string, ICampaignSignal>;
  profiles: Map<string, IProfileSignal>;
  preferences: Map<string, IPreferenceSignal>;
  intents: Map<string, IRecoveryIntentSignalRow[]>;
  transactions: Map<string, ICreditTransactionSignal[]>;
  events: Map<string, ILifecycleEventSignal[]>;
  failedEmailLogs: Map<string, IEmailLogSignal[]>;
}

const CUSTOMER_HISTORY_POINTS = {
  pack: 100,
  subscriptionTransaction: 100,
  activeSubscription: 120,
} as const;

const PURCHASE_INTENT_POINTS = {
  checkout_abandoner: 80,
  upgrade_click_no_purchase: 60,
  credit_wall_dismissed: 55,
} as const;

const DECISION_RANK: Record<RecipientValueDecision, number> = {
  cancel: 0,
  hold_experiment: 1,
  keep_medium: 2,
  keep_high: 3,
  protected: 4,
};

const CLAIM_LEASE_MINUTES = 10;
const AUDIT_PAGE_SIZE = 250;
const INTENT_WINDOW_DAYS = 14;
const ENGAGEMENT_WINDOW_DAYS = 90;
const MAX_RECENT_SIGNALS_PER_USER = 100;

const ISO_UNKNOWN_COUNTRY_CODES = new Set(['', 'XX', 'ZZ', 'UN', UNKNOWN_RECIPIENT_COUNTRY]);

export function normalizeRecipientCountry(country: string | null | undefined): string {
  const normalized = typeof country === 'string' ? country.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(normalized) || ISO_UNKNOWN_COUNTRY_CODES.has(normalized)) {
    return UNKNOWN_RECIPIENT_COUNTRY;
  }
  return normalized;
}

function asDate(value: string | Date | undefined, fallback: Date): Date {
  const parsed = value instanceof Date ? new Date(value) : value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function addReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function addScore(
  reasons: string[],
  reason: string,
  points: number,
  state: { score: number }
): void {
  state.score += points;
  addReason(reasons, reason);
}

function getSuppressionReasonCode(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const knownReasons = new Set([
    'suppressed_preference',
    'suppressed_email_status',
    'suppressed_campaign_cooldown',
    'suppressed_frequency_cap',
    'suppressed_emergency_ceiling',
  ]);
  return knownReasons.has(reason) ? reason : 'existing_suppression';
}

function getRecentIntents(input: IRecipientValueInput, now: Date): IRecipientValueIntentSignal[] {
  const intents = [...(input.recentIntents ?? input.recoveryIntents ?? [])];
  const cutoff = now.getTime() - INTENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return intents.filter(intent => {
    if (intent.status && !['active', 'queued'].includes(intent.status)) return false;
    const lastSeen = asDate(intent.lastSeenAt, new Date(0));
    return lastSeen.getTime() >= cutoff && lastSeen.getTime() <= now.getTime();
  });
}

function getDecisionForScore(score: number): RecipientValueDecision {
  if (score >= 80) return 'keep_high';
  if (score >= 40) return 'keep_medium';
  if (score >= 10) return 'hold_experiment';
  return 'cancel';
}

function getBandForDecision(decision: RecipientValueDecision): RecipientValueBand {
  if (decision === 'protected') return 'protected';
  if (decision === 'keep_high') return 'high';
  if (decision === 'keep_medium') return 'medium';
  if (decision === 'hold_experiment') return 'experiment';
  return 'cancel';
}

function raiseDecisionAtLeast(
  current: RecipientValueDecision,
  minimum: 'keep_medium' | 'keep_high'
): RecipientValueDecision {
  return DECISION_RANK[current] >= DECISION_RANK[minimum] ? current : minimum;
}

function getPricingRegionForCountry(country: string): PricingRegion | 'unknown' {
  if (country === UNKNOWN_RECIPIENT_COUNTRY) return 'unknown';
  return getPricingRegion(country).region;
}

export function classifyRecipient(input: IRecipientValueInput): IRecipientValueClassification {
  const now = asDate(input.now, new Date());
  const normalizedCountry = normalizeRecipientCountry(input.country);
  const reasons: string[] = [];

  if (input.emailType === 'transactional') {
    return {
      score: 0,
      baseScore: 0,
      band: 'protected',
      decision: 'protected',
      reasons: ['transactional_protected'],
      policyVersion: RECIPIENT_VALUE_POLICY_VERSION,
      normalizedCountry,
    };
  }

  if (input.campaignMissing) {
    return {
      score: 0,
      baseScore: 0,
      band: 'protected',
      decision: 'protected',
      reasons: ['campaign_missing'],
      policyVersion: RECIPIENT_VALUE_POLICY_VERSION,
      normalizedCountry,
    };
  }

  const suppressionReason = getSuppressionReasonCode(input.suppressedReason);
  if (suppressionReason) {
    return {
      score: 0,
      baseScore: 0,
      band: 'protected',
      decision: 'protected',
      reasons: [suppressionReason],
      policyVersion: RECIPIENT_VALUE_POLICY_VERSION,
      normalizedCountry,
    };
  }

  if (input.concurrentClaim) {
    return {
      score: 0,
      baseScore: 0,
      band: 'protected',
      decision: 'protected',
      reasons: ['concurrent_claim'],
      policyVersion: RECIPIENT_VALUE_POLICY_VERSION,
      normalizedCountry,
    };
  }

  const state = { score: 0 };
  const history = {
    priorPackPurchase: input.priorPackPurchase === true,
    priorSubscriptionTransaction: input.priorSubscriptionTransaction === true,
    activeSubscription: ['active', 'trialing'].includes(input.subscriptionStatus ?? ''),
    formerSubscription: ['canceled', 'past_due', 'unpaid'].includes(input.subscriptionStatus ?? ''),
  };

  if (history.activeSubscription) {
    addScore(reasons, 'active_subscription', CUSTOMER_HISTORY_POINTS.activeSubscription, state);
  } else if (history.priorPackPurchase) {
    addScore(reasons, 'prior_pack_buyer', CUSTOMER_HISTORY_POINTS.pack, state);
  } else if (history.priorSubscriptionTransaction) {
    addScore(
      reasons,
      'prior_subscription_transaction',
      CUSTOMER_HISTORY_POINTS.subscriptionTransaction,
      state
    );
  }

  const recentIntents = getRecentIntents(input, now);
  if (recentIntents.some(intent => intent.audienceKey === 'high_usage_free_user')) {
    addReason(reasons, 'high_usage_intent_14d');
  }
  const selectedIntent = [...recentIntents]
    .filter(intent => intent.audienceKey in PURCHASE_INTENT_POINTS)
    .sort((a, b) => {
      const pointDifference =
        PURCHASE_INTENT_POINTS[b.audienceKey as keyof typeof PURCHASE_INTENT_POINTS] -
        PURCHASE_INTENT_POINTS[a.audienceKey as keyof typeof PURCHASE_INTENT_POINTS];
      return pointDifference || a.audienceKey.localeCompare(b.audienceKey);
    })[0];

  if (selectedIntent) {
    const audienceKey = selectedIntent.audienceKey as keyof typeof PURCHASE_INTENT_POINTS;
    addScore(
      reasons,
      audienceKey === 'checkout_abandoner'
        ? 'checkout_intent_14d'
        : audienceKey === 'upgrade_click_no_purchase'
          ? 'upgrade_intent_14d'
          : 'credit_wall_intent_14d',
      PURCHASE_INTENT_POINTS[audienceKey],
      state
    );
  }

  const creditsConsumed = Math.max(
    0,
    Number(input.creditsConsumed ?? input.lifetimeCreditsConsumed ?? 0)
  );
  if (creditsConsumed >= 10) addScore(reasons, 'usage_10_plus_credits', 40, state);
  else if (creditsConsumed >= 3) addScore(reasons, 'usage_3_to_9_credits', 20, state);

  if (input.emailEngagedWithin90Days) addScore(reasons, 'engaged_90d', 30, state);

  if (input.campaignPriority === 'revenue_critical') {
    addScore(reasons, 'revenue_critical_campaign', 30, state);
  } else if (input.campaignPriority === 'lifecycle') {
    addScore(reasons, 'lifecycle_campaign', 5, state);
  } else if (input.campaignPriority === 'education') {
    addScore(reasons, 'education_campaign', -20, state);
  }

  if (input.campaignKey === 'winback-never-uploaded-14d') {
    addScore(reasons, 'winback_never_uploaded_14d', -30, state);
  }

  if (normalizedCountry === UNKNOWN_RECIPIENT_COUNTRY) {
    addReason(reasons, 'country_unknown');
  } else if (normalizedCountry === 'US') {
    addScore(reasons, 'country_us', 25, state);
  } else if (normalizedCountry === 'GB' || normalizedCountry === 'CA') {
    addScore(reasons, 'country_gb_ca', 20, state);
  } else if (normalizedCountry === 'IN') {
    addScore(reasons, 'country_in', -20, state);
    addReason(reasons, 'discounted_region');
  } else if (normalizedCountry === 'PH') {
    addScore(reasons, 'country_ph', -40, state);
    addReason(reasons, 'discounted_region');
  } else if (getPricingRegionForCountry(normalizedCountry) === 'standard') {
    addScore(reasons, 'standard_price_country', 10, state);
  } else {
    addScore(reasons, 'discounted_region', -10, state);
  }

  const scheduledFor = asDate(input.scheduledFor, now);
  const ageDays = Math.max(0, (now.getTime() - scheduledFor.getTime()) / (24 * 60 * 60 * 1000));
  if (ageDays <= 7) addScore(reasons, 'fresh_0_to_7d', 10, state);
  else if (ageDays <= 30) addReason(reasons, 'fresh_8_to_30d');
  else if (ageDays <= 60) addScore(reasons, 'stale_31_to_60d', -30, state);
  else addScore(reasons, 'stale_over_60d', -50, state);

  const baseScore = state.score;
  let decision = getDecisionForScore(baseScore);
  const hasPurchaseHistory =
    history.priorPackPurchase || history.priorSubscriptionTransaction || history.activeSubscription;
  const hasSubscriberProtection = hasPurchaseHistory || history.formerSubscription;
  const hasCheckoutIntent = selectedIntent?.audienceKey === 'checkout_abandoner';
  const hasStrongPurchaseIntent = Boolean(selectedIntent);

  if (history.priorPackPurchase || history.priorSubscriptionTransaction) {
    decision = raiseDecisionAtLeast(decision, 'keep_high');
    addReason(reasons, 'override_former_buyer');
  }
  if (history.activeSubscription || history.formerSubscription) {
    decision = raiseDecisionAtLeast(decision, 'keep_high');
    addReason(
      reasons,
      history.activeSubscription ? 'override_active_subscriber' : 'override_former_subscriber'
    );
  }
  if (hasCheckoutIntent) {
    decision = raiseDecisionAtLeast(decision, 'keep_high');
    addReason(reasons, 'override_checkout_intent');
  } else if (selectedIntent) {
    decision = raiseDecisionAtLeast(decision, 'keep_medium');
    addReason(reasons, 'override_recent_purchase_intent');
  }

  const staleNeverUploaded = input.campaignKey === 'winback-never-uploaded-14d' && ageDays > 30;
  if (staleNeverUploaded && !hasSubscriberProtection && !hasStrongPurchaseIntent) {
    decision = 'cancel';
    addReason(reasons, 'stale_never_uploaded_over_30d');
  }

  const lifetimeUsageProtectsIndia = creditsConsumed >= 10;
  if (
    normalizedCountry === 'PH' &&
    !hasSubscriberProtection &&
    !hasStrongPurchaseIntent &&
    DECISION_RANK[decision] > DECISION_RANK.hold_experiment
  ) {
    decision = 'hold_experiment';
    addReason(reasons, 'country_ph_hold_cap');
  }
  if (
    normalizedCountry === 'IN' &&
    !hasSubscriberProtection &&
    !hasStrongPurchaseIntent &&
    !lifetimeUsageProtectsIndia &&
    DECISION_RANK[decision] > DECISION_RANK.hold_experiment
  ) {
    decision = 'hold_experiment';
    addReason(reasons, 'country_in_hold_cap');
  }

  return {
    score: state.score,
    baseScore,
    band: getBandForDecision(decision),
    decision,
    reasons,
    policyVersion: RECIPIENT_VALUE_POLICY_VERSION,
    normalizedCountry,
  };
}

function ensurePriority(value: unknown): RecipientValueCampaignPriority {
  if (
    value === 'transactional' ||
    value === 'revenue_critical' ||
    value === 'lifecycle' ||
    value === 'education'
  ) {
    return value;
  }
  return 'lifecycle';
}

function groupIncrement(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function isActiveClaim(row: IQueueCandidate, now: Date): boolean {
  if (!row.processing_claim_id) return false;
  if (!row.processing_claimed_at) return true;
  const claimedAt = new Date(row.processing_claimed_at);
  return (
    !Number.isNaN(claimedAt.getTime()) &&
    now.getTime() - claimedAt.getTime() < CLAIM_LEASE_MINUTES * 60 * 1000
  );
}

function hasDeliverabilityFailure(logs: readonly IEmailLogSignal[]): boolean {
  return logs.some(log => {
    const response = JSON.stringify(log.provider_response ?? {}).toLowerCase();
    return (
      response.includes('permanent_bounce') ||
      response.includes('bounce') ||
      response.includes('complaint') ||
      response.includes('complained')
    );
  });
}

function isPreferenceDisabled(
  campaign: ICampaignSignal,
  preference: IPreferenceSignal | undefined
): boolean {
  if (!campaign.preference_key || !preference) return false;
  return preference[campaign.preference_key] === false;
}

function mapByKey<T extends Record<string, unknown>>(
  rows: readonly T[],
  key: keyof T
): Map<string, T> {
  return new Map(rows.map(row => [String(row[key]), row]));
}

async function getRows<T>(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export class EmailRecipientValueService {
  async classifyEnqueue(
    input: IClassifyRecipientValueEnqueueInput
  ): Promise<IRecipientValueClassification> {
    const now = new Date();
    const row: IQueueCandidate = {
      id: randomUUID(),
      campaign_key: input.campaignKey,
      user_id: input.userId,
      scheduled_for: input.scheduledFor.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      status: 'pending',
      processing_claim_id: null,
      processing_claimed_at: null,
    };
    const signals = await this.loadPageSignals([row]);
    return this.classifyQueueCandidate(row, signals);
  }

  async auditQueue(options: IRecipientValueAuditOptions = {}): Promise<IRecipientValueAuditResult> {
    const pageSize = Math.min(
      Math.max(Math.floor(options.pageSize ?? AUDIT_PAGE_SIZE), 1),
      AUDIT_PAGE_SIZE
    );
    const runId = randomUUID();
    const snapshotAt = new Date().toISOString();
    const pendingChecksum = 'pending';

    const { error: createRunError } = await supabaseAdmin.from('email_queue_pruning_runs').insert({
      id: runId,
      policy_version: RECIPIENT_VALUE_POLICY_VERSION,
      mode: 'dry_run',
      queue_snapshot_at: snapshotAt,
      candidate_count: 0,
      candidate_checksum: pendingChecksum,
      summary_by_decision: {},
      summary_by_reason: {},
      summary_by_campaign: {},
      summary_by_country: {},
      summary_by_band: {},
    });
    if (createRunError)
      throw new Error(`Failed to create recipient-value run: ${createRunError.message}`);

    const summary: IRecipientValueSummary = {
      candidateCount: 0,
      candidateChecksum: '',
      byDecision: {},
      byReason: {},
      byCampaign: {},
      byCountry: {},
      byBand: {},
    };
    const checksum = createHash('md5');
    let lastId: string | undefined;

    while (true) {
      const rows = await this.loadQueuePage(lastId, pageSize);
      if (rows.length === 0) break;

      const signals = await this.loadPageSignals(rows);
      const items = rows.map(row => {
        checksum.update(
          `${summary.candidateCount === 0 ? '' : ','}${row.id}:${new Date(row.updated_at).toISOString()}`
        );
        const classification = this.classifyQueueCandidate(row, signals);
        summary.candidateCount += 1;
        groupIncrement(summary.byDecision, classification.decision);
        groupIncrement(summary.byBand, classification.band);
        groupIncrement(summary.byCampaign, row.campaign_key);
        groupIncrement(summary.byCountry, classification.normalizedCountry);
        for (const reason of classification.reasons) groupIncrement(summary.byReason, reason);
        return {
          run_id: runId,
          queue_id: row.id,
          queue_updated_at: row.updated_at,
          recipient_value_score: classification.score,
          recipient_value_band: classification.band,
          recipient_value_decision: classification.decision,
          recipient_value_reasons: classification.reasons,
          recipient_value_policy_version: classification.policyVersion,
        };
      });

      const { error: itemError } = await supabaseAdmin
        .from('email_queue_pruning_run_items')
        .insert(items);
      if (itemError)
        throw new Error(`Failed to persist recipient-value run page: ${itemError.message}`);

      options.onProgress?.(summary.candidateCount);

      lastId = rows[rows.length - 1].id;
      if (rows.length < pageSize) break;
    }

    summary.candidateChecksum = checksum.digest('hex');
    const { error: finalizeError } = await supabaseAdmin
      .from('email_queue_pruning_runs')
      .update({
        candidate_count: summary.candidateCount,
        candidate_checksum: summary.candidateChecksum,
        summary_by_decision: summary.byDecision,
        summary_by_reason: summary.byReason,
        summary_by_campaign: summary.byCampaign,
        summary_by_country: summary.byCountry,
        summary_by_band: summary.byBand,
      })
      .eq('id', runId);
    if (finalizeError)
      throw new Error(`Failed to finalize recipient-value run: ${finalizeError.message}`);

    return { runId, summary };
  }

  async applyRun(input: IApplyRecipientValueRunInput): Promise<IApplyRecipientValueRunResult> {
    const { data: run, error: runError } = await supabaseAdmin
      .from('email_queue_pruning_runs')
      .select('candidate_count, candidate_checksum, policy_version')
      .eq('id', input.runId)
      .maybeSingle();
    if (runError) throw new Error(`Failed to load recipient-value run: ${runError.message}`);
    if (!run) throw new Error('Recipient-value pruning run not found');
    if (run.policy_version !== input.policyVersion) {
      throw new Error('Recipient-value policy version does not match persisted dry-run');
    }
    if (Number(run.candidate_count) !== input.expectedCount) {
      throw new Error('Recipient-value expected count does not match persisted dry-run');
    }

    const { data, error } = await supabaseAdmin.rpc('apply_email_recipient_value_run', {
      p_run_id: input.runId,
      p_policy_version: input.policyVersion,
      p_expected_count: input.expectedCount,
      p_candidate_checksum: String(run.candidate_checksum),
      p_action: input.action,
    });
    if (error) throw new Error(`Failed to ${input.action} recipient-value run: ${error.message}`);

    const result = (data ?? {}) as Record<string, unknown>;
    return {
      runId: String(result.run_id ?? input.runId),
      action: input.action,
      mode: String(result.mode ?? input.action),
      changedCount: Number(result.changed_count ?? 0),
      cancelledCount: Number(result.cancelled_count ?? 0),
      heldCount: Number(result.held_count ?? 0),
      keptCount: Number(result.kept_count ?? 0),
    };
  }

  async getPerformanceReport(since: Date): Promise<IEmailRecipientValuePerformanceRow[]> {
    const { data, error } = await supabaseAdmin.rpc('get_email_recipient_value_performance', {
      p_since: since.toISOString(),
    });
    if (error) throw new Error(`Failed to load recipient-value performance: ${error.message}`);
    return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
      ...(row as unknown as IEmailRecipientValuePerformanceRow),
      classified_count: Number(row.classified_count ?? 0),
      held_count: Number(row.held_count ?? 0),
      cancelled_count: Number(row.cancelled_count ?? 0),
      sent_count: Number(row.sent_count ?? 0),
      clicked_count: Number(row.clicked_count ?? 0),
      returned_count: Number(row.returned_count ?? 0),
      purchased_after_email_count: Number(row.purchased_after_email_count ?? 0),
      hard_bounce_count: Number(row.hard_bounce_count ?? 0),
      complaint_count: Number(row.complaint_count ?? 0),
      revenue_multiplier: Number(row.revenue_multiplier ?? 1),
    }));
  }

  private async loadQueuePage(
    lastId: string | undefined,
    pageSize: number
  ): Promise<IQueueCandidate[]> {
    let query = supabaseAdmin
      .from('email_lifecycle_queue')
      .select(
        'id, campaign_key, user_id, scheduled_for, created_at, updated_at, status, processing_claim_id, processing_claimed_at'
      )
      .eq('status', 'pending')
      .order('id', { ascending: true })
      .limit(pageSize);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) {
      const timeoutHint = /statement timeout|canceling statement/i.test(error.message)
        ? ' Retry with a smaller --page-size; the audit remains count-only and resumable by a new run.'
        : '';
      throw new Error(`Failed to page pending lifecycle queue: ${error.message}.${timeoutHint}`);
    }
    return (data ?? []) as IQueueCandidate[];
  }

  private async loadPageSignals(rows: readonly IQueueCandidate[]): Promise<IPageSignals> {
    const userIds = [
      ...new Set(rows.map(row => row.user_id).filter((id): id is string => Boolean(id))),
    ];
    const campaignKeys = [...new Set(rows.map(row => row.campaign_key))];
    const cutoff90 = new Date(
      Date.now() - ENGAGEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const cutoff14 = new Date(Date.now() - INTENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const boundedSignalLimit = Math.max(rows.length * MAX_RECENT_SIGNALS_PER_USER, 1);

    const [
      campaignRows,
      profileRows,
      preferenceRows,
      intentRows,
      transactionRows,
      eventRows,
      logRows,
    ] = await Promise.all([
      getRows<ICampaignSignal>(
        supabaseAdmin
          .from('email_lifecycle_campaigns')
          .select('key, email_type, preference_key, priority, sort_priority')
          .in('key', campaignKeys)
      ),
      userIds.length
        ? getRows<IProfileSignal>(
            supabaseAdmin
              .from('profiles')
              .select('id, signup_country, subscription_status')
              .in('id', userIds)
          )
        : Promise.resolve([]),
      userIds.length
        ? getRows<IPreferenceSignal>(
            supabaseAdmin
              .from('email_preferences')
              .select('user_id, marketing_emails, product_updates, low_credit_alerts')
              .in('user_id', userIds)
          )
        : Promise.resolve([]),
      userIds.length
        ? getRows<IRecoveryIntentSignalRow>(
            supabaseAdmin
              .from('revenue_recovery_intents')
              .select('user_id, audience_key, status, last_seen_at')
              .in('user_id', userIds)
              .in('status', ['active', 'queued'])
              .gte('last_seen_at', cutoff14)
              .limit(boundedSignalLimit)
          )
        : Promise.resolve([]),
      userIds.length
        ? getRows<ITransactionSignalSummary>(
            supabaseAdmin.rpc('get_email_recipient_value_transaction_signals', {
              p_user_ids: userIds,
            })
          )
        : Promise.resolve([]),
      userIds.length
        ? getRows<ILifecycleEventSignal>(
            supabaseAdmin
              .from('email_lifecycle_events')
              .select('user_id, event_type, occurred_at')
              .in('user_id', userIds)
              .in('event_type', ['clicked', 'returned'])
              .gte('occurred_at', cutoff90)
              .order('occurred_at', { ascending: false })
              .limit(boundedSignalLimit)
          )
        : Promise.resolve([]),
      userIds.length
        ? getRows<IEmailLogSignal>(
            supabaseAdmin
              .from('email_logs')
              .select('user_id, provider_response, status')
              .in('user_id', userIds)
              .eq('status', 'failed')
              .gte('sent_at', cutoff90)
              .order('sent_at', { ascending: false })
              .limit(boundedSignalLimit)
          )
        : Promise.resolve([]),
    ]);

    const intents = new Map<string, IRecoveryIntentSignalRow[]>();
    for (const row of intentRows) {
      const values = intents.get(row.user_id) ?? [];
      values.push(row);
      intents.set(row.user_id, values);
    }
    const transactions = new Map<string, ICreditTransactionSignal[]>();
    for (const row of transactionRows) {
      const values: ICreditTransactionSignal[] = [];
      if (row.prior_pack_purchase) {
        values.push({ user_id: row.user_id, type: 'purchase', amount: 0 });
      }
      if (row.prior_subscription_transaction) {
        values.push({ user_id: row.user_id, type: 'subscription', amount: 0 });
      }
      if (Number(row.credits_consumed) > 0) {
        values.push({
          user_id: row.user_id,
          type: 'usage',
          amount: -Number(row.credits_consumed),
        });
      }
      transactions.set(row.user_id, values);
    }
    const events = new Map<string, ILifecycleEventSignal[]>();
    for (const row of eventRows) {
      if (!row.user_id) continue;
      const values = events.get(row.user_id) ?? [];
      values.push(row);
      events.set(row.user_id, values);
    }
    const failedEmailLogs = new Map<string, IEmailLogSignal[]>();
    for (const row of logRows) {
      if (!row.user_id) continue;
      const values = failedEmailLogs.get(row.user_id) ?? [];
      values.push(row);
      failedEmailLogs.set(row.user_id, values);
    }

    return {
      campaigns: mapByKey(
        campaignRows as unknown as Array<Record<string, unknown>>,
        'key'
      ) as unknown as Map<string, ICampaignSignal>,
      profiles: mapByKey(
        profileRows as unknown as Array<Record<string, unknown>>,
        'id'
      ) as unknown as Map<string, IProfileSignal>,
      preferences: mapByKey(
        preferenceRows as unknown as Array<Record<string, unknown>>,
        'user_id'
      ) as unknown as Map<string, IPreferenceSignal>,
      intents,
      transactions,
      events,
      failedEmailLogs,
    };
  }

  private classifyQueueCandidate(
    row: IQueueCandidate,
    signals: IPageSignals
  ): IRecipientValueClassification {
    const campaign = signals.campaigns.get(row.campaign_key);
    const profile = row.user_id ? signals.profiles.get(row.user_id) : undefined;
    const preference = row.user_id ? signals.preferences.get(row.user_id) : undefined;
    const transactions = row.user_id ? (signals.transactions.get(row.user_id) ?? []) : [];
    const events = row.user_id ? (signals.events.get(row.user_id) ?? []) : [];
    const failedEmailLogs = row.user_id ? (signals.failedEmailLogs.get(row.user_id) ?? []) : [];
    const userIntents = row.user_id ? (signals.intents.get(row.user_id) ?? []) : [];
    const effectiveCampaign: ICampaignSignal = campaign ?? {
      key: row.campaign_key,
      email_type: 'transactional',
      preference_key: null,
      priority: 'transactional',
      sort_priority: 0,
    };
    const suppressedReason =
      effectiveCampaign.email_type === 'marketing' &&
      isPreferenceDisabled(effectiveCampaign, preference)
        ? 'suppressed_preference'
        : effectiveCampaign.email_type === 'marketing' && hasDeliverabilityFailure(failedEmailLogs)
          ? 'suppressed_email_status'
          : null;
    const creditsConsumed = transactions
      .filter(transaction => transaction.type === 'usage' && Number(transaction.amount) < 0)
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);

    return classifyRecipient({
      emailType: effectiveCampaign.email_type,
      campaignKey: row.campaign_key,
      campaignPriority: ensurePriority(effectiveCampaign.priority),
      campaignSortPriority: effectiveCampaign.sort_priority,
      priorPackPurchase: transactions.some(transaction => transaction.type === 'purchase'),
      priorSubscriptionTransaction: transactions.some(
        transaction => transaction.type === 'subscription'
      ),
      subscriptionStatus: profile?.subscription_status,
      recentIntents: userIntents.map(intent => ({
        audienceKey: intent.audience_key,
        status: intent.status,
        lastSeenAt: intent.last_seen_at,
      })),
      creditsConsumed,
      emailEngagedWithin90Days: events.some(
        event => event.event_type === 'clicked' || event.event_type === 'returned'
      ),
      country: profile?.signup_country,
      createdAt: row.created_at,
      scheduledFor: row.scheduled_for,
      suppressedReason,
      concurrentClaim: isActiveClaim(row, new Date()),
      campaignMissing: !campaign,
    });
  }
}

let recipientValueServiceInstance: EmailRecipientValueService | null = null;

export function getEmailRecipientValueService(): EmailRecipientValueService {
  if (!recipientValueServiceInstance) {
    recipientValueServiceInstance = new EmailRecipientValueService();
  }
  return recipientValueServiceInstance;
}
