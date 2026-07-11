import { pathToFileURL } from 'url';
import type Stripe from 'stripe';
import { stripe } from '@server/stripe/config';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { EXPERIMENT_CHECKOUT_METADATA_KEYS } from '@shared/types/experiments.types';

const REPORT_DAYS = 7;

export interface IPaidExperimentCheckout {
  purchase_id: string;
  experiment_key: string;
  context_key: string;
  arm_id: number;
  assignment_key: string;
  paid_at: string;
}

export interface IExperimentRewardHealthRow {
  report_day: string;
  paid_checkouts_with_known_assignment: number;
  attributed_paid_checkouts: number;
  attribution_rate: number | string | null;
  duplicate_reward_count: number;
  healthy: boolean;
}

export function toPaidExperimentCheckout(
  session: Pick<
    Stripe.Checkout.Session,
    'id' | 'created' | 'metadata' | 'payment_status' | 'status'
  >
): IPaidExperimentCheckout | null {
  if (session.status !== 'complete' || session.payment_status !== 'paid') return null;

  const metadata = session.metadata;
  const experimentKey = metadata?.[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentKey]?.trim();
  const contextKey = metadata?.[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentContextKey]?.trim();
  const assignmentKey =
    metadata?.[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentAssignmentKey]?.trim();
  const armId = Number(metadata?.[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentArmId]);

  if (
    !experimentKey ||
    !contextKey ||
    !assignmentKey ||
    !Number.isSafeInteger(armId) ||
    armId <= 0
  ) {
    return null;
  }

  return {
    purchase_id: session.id,
    experiment_key: experimentKey,
    context_key: contextKey,
    arm_id: armId,
    assignment_key: assignmentKey,
    paid_at: new Date(session.created * 1000).toISOString(),
  };
}

export function summarizeExperimentRewardHealth(rows: IExperimentRewardHealthRow[]): {
  healthy: boolean;
  reason: string;
} {
  if (rows.length !== REPORT_DAYS) {
    return {
      healthy: false,
      reason: `expected ${REPORT_DAYS} UTC days with known assigned purchases, found ${rows.length}`,
    };
  }

  const unhealthyDays = rows.filter(row => !row.healthy);
  if (unhealthyDays.length > 0) {
    return {
      healthy: false,
      reason: `${unhealthyDays.length} day(s) missed the 95% attribution / zero-duplicate gate`,
    };
  }

  return { healthy: true, reason: 'seven consecutive UTC days passed the rollout gate' };
}

async function listPaidExperimentCheckouts(since: Date): Promise<IPaidExperimentCheckout[]> {
  const checkouts: IPaidExperimentCheckout[] = [];
  const sessions = stripe.checkout.sessions.list({
    created: { gte: Math.floor(since.getTime() / 1000) },
    limit: 100,
  });

  for await (const session of sessions) {
    const checkout = toPaidExperimentCheckout(session);
    if (checkout) checkouts.push(checkout);
  }

  return checkouts;
}

async function main(): Promise<void> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - REPORT_DAYS);
  const checkouts = await listPaidExperimentCheckouts(since);
  const { data, error } = await supabaseAdmin.rpc('get_experiment_reward_health', {
    p_paid_checkouts: checkouts,
    p_since: since.toISOString(),
  });

  if (error) throw new Error(`Failed to read experiment reward health: ${error.message}`);

  const rows = (data ?? []) as IExperimentRewardHealthRow[];
  console.log('Experiment reward health (read-only; UTC)');
  console.log('day\tknown_paid\tattributed\tattribution_rate\tduplicate_rewards\tgate');
  for (const row of rows) {
    const rate =
      row.attribution_rate === null ? 'n/a' : `${(Number(row.attribution_rate) * 100).toFixed(1)}%`;
    console.log(
      [
        row.report_day,
        row.paid_checkouts_with_known_assignment,
        row.attributed_paid_checkouts,
        rate,
        row.duplicate_reward_count,
        row.healthy ? 'PASS' : 'FAIL',
      ].join('\t')
    );
  }

  const summary = summarizeExperimentRewardHealth(rows);
  console.log(`${summary.healthy ? 'PASS' : 'FAIL'}: ${summary.reason}`);
  if (!summary.healthy) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
