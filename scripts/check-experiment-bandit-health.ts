import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

interface IExperimentArmHealthRow {
  experiment_key: string;
  context_key: string;
  arm_key: string;
  impressions: number;
  rewards: number;
  revenue_cents: number;
  guardrail_failures: number;
  is_active: boolean;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('experiment_arms')
    .select(
      'experiment_key, context_key, arm_key, impressions, rewards, revenue_cents, guardrail_failures, is_active'
    )
    .order('experiment_key', { ascending: true })
    .order('context_key', { ascending: true })
    .order('arm_key', { ascending: true });

  if (error) {
    throw new Error(`Failed to read experiment arms: ${error.message}`);
  }

  const rows = (data ?? []) as IExperimentArmHealthRow[];
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
