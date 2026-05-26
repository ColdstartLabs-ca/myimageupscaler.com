import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type {
  IExperimentAssignment,
  IExperimentAssignmentRequest,
  IExperimentArmConfig,
  IExperimentRewardRequest,
} from '@shared/types/experiments.types';

interface IExperimentArmRow {
  id: number;
  experiment_key: string;
  context_key: string;
  arm_key: string;
  arm_config: IExperimentArmConfig;
  impressions: number;
  rewards: number;
  revenue_cents: number;
}

interface IExperimentAssignmentRow {
  arm_id: number;
  experiment_key: string;
  context_key: string;
  assignment_key: string;
  surface: string;
}

function sampleNormal(): number {
  let u: number, v: number, s: number;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt((-2 * Math.log(s)) / s);
}

function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    let x: number, v: number;
    do {
      x = sampleNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleExperimentBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  if (x + y === 0) return 0.5;
  return x / (x + y);
}

function expectedRevenuePerImpression(arm: IExperimentArmRow): number {
  const failures = Math.max(0, arm.impressions - arm.rewards);
  const rewardSample = sampleExperimentBeta(arm.rewards + 1, failures + 1);
  const averageRevenue = arm.rewards > 0 ? arm.revenue_cents / arm.rewards : 100;
  return rewardSample * averageRevenue;
}

function selectArm(arms: IExperimentArmRow[]): IExperimentArmRow {
  let bestArm = arms[0];
  let bestScore = expectedRevenuePerImpression(bestArm);

  for (let index = 1; index < arms.length; index++) {
    const score = expectedRevenuePerImpression(arms[index]);
    if (score > bestScore) {
      bestArm = arms[index];
      bestScore = score;
    }
  }

  return bestArm;
}

function toAssignment(
  arm: IExperimentArmRow,
  params: IExperimentAssignmentRequest
): IExperimentAssignment {
  return {
    experimentKey: arm.experiment_key,
    contextKey: arm.context_key,
    armId: arm.id,
    armKey: arm.arm_key,
    armConfig: arm.arm_config ?? {},
    assignmentKey: params.assignmentKey,
    surface: params.surface,
  };
}

async function getArmById(armId: number): Promise<IExperimentArmRow | null> {
  const { data, error } = await supabaseAdmin
    .from('experiment_arms')
    .select(
      'id, experiment_key, context_key, arm_key, arm_config, impressions, rewards, revenue_cents'
    )
    .eq('id', armId)
    .single();

  if (error || !data) return null;
  return data as IExperimentArmRow;
}

export async function assignExperimentArm(
  params: IExperimentAssignmentRequest
): Promise<IExperimentAssignment | null> {
  const contextKey = params.contextKey || 'global';

  try {
    const { data: existingAssignment } = await supabaseAdmin
      .from('experiment_assignments')
      .select('arm_id, experiment_key, context_key, assignment_key, surface')
      .eq('experiment_key', params.experimentKey)
      .eq('context_key', contextKey)
      .eq('assignment_key', params.assignmentKey)
      .maybeSingle();

    if (existingAssignment) {
      const assignment = existingAssignment as IExperimentAssignmentRow;
      const arm = await getArmById(assignment.arm_id);
      if (!arm) return null;
      return toAssignment(arm, { ...params, contextKey });
    }

    const { data: arms, error } = await supabaseAdmin
      .from('experiment_arms')
      .select(
        'id, experiment_key, context_key, arm_key, arm_config, impressions, rewards, revenue_cents'
      )
      .eq('experiment_key', params.experimentKey)
      .eq('context_key', contextKey)
      .eq('is_active', true);

    if (error || !arms || arms.length === 0) return null;

    const selectedArm = selectArm(arms as IExperimentArmRow[]);
    const assignedAt = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin.from('experiment_assignments').insert({
      experiment_key: params.experimentKey,
      context_key: contextKey,
      arm_id: selectedArm.id,
      assignment_key: params.assignmentKey,
      surface: params.surface,
      metadata: {
        assignmentScope: params.assignmentScope,
        ...(params.metadata ?? {}),
      },
      assigned_at: assignedAt,
    });

    if (insertError) {
      const { data: racedAssignment } = await supabaseAdmin
        .from('experiment_assignments')
        .select('arm_id, experiment_key, context_key, assignment_key, surface')
        .eq('experiment_key', params.experimentKey)
        .eq('context_key', contextKey)
        .eq('assignment_key', params.assignmentKey)
        .maybeSingle();

      if (racedAssignment) {
        const assignment = racedAssignment as IExperimentAssignmentRow;
        const arm = await getArmById(assignment.arm_id);
        if (!arm) return null;
        return toAssignment(arm, { ...params, contextKey });
      }

      return null;
    }

    await supabaseAdmin
      .from('experiment_arms')
      .update({
        impressions: selectedArm.impressions + 1,
        updated_at: assignedAt,
      })
      .eq('id', selectedArm.id);

    return toAssignment(selectedArm, { ...params, contextKey });
  } catch {
    return null;
  }
}

export async function recordExperimentReward(params: IExperimentRewardRequest): Promise<void> {
  const contextKey = params.contextKey || 'global';
  const rewardValue = params.rewardValue ?? 1;
  const revenueCents = params.revenueCents ?? 0;

  try {
    const { data: arm, error: fetchError } = await supabaseAdmin
      .from('experiment_arms')
      .select('rewards, revenue_cents')
      .eq('id', params.armId)
      .eq('experiment_key', params.experimentKey)
      .eq('context_key', contextKey)
      .single();

    if (fetchError || !arm) return;

    await supabaseAdmin.from('experiment_rewards').insert({
      experiment_key: params.experimentKey,
      context_key: contextKey,
      arm_id: params.armId,
      assignment_key: params.assignmentKey,
      reward_type: params.rewardType,
      reward_value: rewardValue,
      revenue_cents: revenueCents,
      source_event: params.sourceEvent,
      metadata: params.metadata ?? {},
    });

    await supabaseAdmin
      .from('experiment_arms')
      .update({
        rewards: Number(arm.rewards ?? 0) + rewardValue,
        revenue_cents: Number(arm.revenue_cents ?? 0) + revenueCents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.armId);
  } catch {
    return;
  }
}
