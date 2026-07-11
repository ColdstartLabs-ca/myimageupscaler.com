import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export type TRevenueRolloutFeature = 'auto_top_up' | 'repeat_purchase';

interface IRolloutRow {
  auto_top_up_enabled: boolean;
  auto_top_up_percent: number;
  repeat_purchase_enabled: boolean;
  repeat_purchase_percent: number;
}

export function revenueRolloutBucket(userId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index++) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export async function isRevenueFeatureEligible(
  userId: string,
  feature: TRevenueRolloutFeature
): Promise<boolean> {
  const { data: rollout, error: rolloutError } = await supabaseAdmin
    .from('repeat_purchase_rollout')
    .select(
      'auto_top_up_enabled, auto_top_up_percent, repeat_purchase_enabled, repeat_purchase_percent'
    )
    .eq('id', true)
    .maybeSingle<IRolloutRow>();
  if (rolloutError || !rollout) return false;

  const enabled =
    feature === 'auto_top_up' ? rollout.auto_top_up_enabled : rollout.repeat_purchase_enabled;
  if (!enabled) return false;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<{ role: string | null }>();
  if (profileError) return false;
  if (profile?.role === 'admin') return true;

  const { data: purchase, error: purchaseError } = await supabaseAdmin
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'purchase')
    .like('description', 'Credit pack purchase - %')
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (purchaseError || !purchase) return false;

  const percent =
    feature === 'auto_top_up' ? rollout.auto_top_up_percent : rollout.repeat_purchase_percent;
  return revenueRolloutBucket(userId) < percent;
}
