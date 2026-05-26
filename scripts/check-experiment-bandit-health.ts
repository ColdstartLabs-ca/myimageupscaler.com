import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

interface IExperimentArmHealthRow {
  id: number;
  experiment_key: string;
  context_key: string;
  arm_key: string;
  impressions: number;
  rewards: number;
  revenue_cents: number;
  guardrail_failures: number;
  is_active: boolean;
}

interface IExperimentRewardHealthRow {
  arm_id: number;
  reward_type: string;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('experiment_arms')
    .select(
      'id, experiment_key, context_key, arm_key, impressions, rewards, revenue_cents, guardrail_failures, is_active'
    )
    .order('experiment_key', { ascending: true })
    .order('context_key', { ascending: true })
    .order('arm_key', { ascending: true });

  if (error) {
    throw new Error(`Failed to read experiment arms: ${error.message}`);
  }

  const rows = (data ?? []) as IExperimentArmHealthRow[];
  const { data: rewardData, error: rewardError } = await supabaseAdmin
    .from('experiment_rewards')
    .select('arm_id, reward_type');

  if (rewardError) {
    throw new Error(`Failed to read experiment rewards: ${rewardError.message}`);
  }

  const checkoutOpensByArm = new Map<number, number>();
  for (const reward of (rewardData ?? []) as IExperimentRewardHealthRow[]) {
    if (reward.reward_type !== 'checkout_opened') continue;
    checkoutOpensByArm.set(reward.arm_id, (checkoutOpensByArm.get(reward.arm_id) ?? 0) + 1);
  }

  if (rows.length === 0) {
    console.log('No experiment arms found.');
    return;
  }

  console.log('Experiment bandit health');
  console.log(
    [
      'experiment',
      'context',
      'arm',
      'active',
      'impressions',
      'checkout_opens',
      'rewards',
      'revenue',
      'revenue_per_impression',
      'guardrail_failures',
    ].join('\t')
  );

  for (const row of rows) {
    const revenuePerImpression = row.impressions > 0 ? row.revenue_cents / row.impressions : 0;
    console.log(
      [
        row.experiment_key,
        row.context_key,
        row.arm_key,
        row.is_active ? 'yes' : 'no',
        row.impressions,
        checkoutOpensByArm.get(row.id) ?? 0,
        row.rewards,
        formatMoney(row.revenue_cents),
        formatMoney(revenuePerImpression),
        row.guardrail_failures,
      ].join('\t')
    );
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
