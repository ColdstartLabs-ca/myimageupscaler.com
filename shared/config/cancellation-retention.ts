export type CancellationReasonKey =
  | 'too_expensive'
  | 'not_using_enough'
  | 'missing_features'
  | 'switching_competitor'
  | 'technical_issues'
  | 'other';

export type RetentionPlanKey = 'starter' | 'hobby' | 'pro' | 'business';

export interface ICancellationRetentionOffer {
  type: 'downgrade';
  targetPlanKey: RetentionPlanKey;
}

const LOWER_PLAN: Partial<Record<RetentionPlanKey, RetentionPlanKey>> = {
  business: 'pro',
  pro: 'hobby',
  hobby: 'starter',
};

export function resolveCancellationRetentionOffer(
  reason: CancellationReasonKey,
  currentPlanKey: string | null | undefined
): ICancellationRetentionOffer | null {
  if (reason !== 'too_expensive' && reason !== 'not_using_enough') return null;
  if (!currentPlanKey || !(currentPlanKey in LOWER_PLAN)) return null;

  const targetPlanKey = LOWER_PLAN[currentPlanKey as RetentionPlanKey];
  return targetPlanKey ? { type: 'downgrade', targetPlanKey } : null;
}
