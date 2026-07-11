import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type {
  IExperimentAssignment,
  IExperimentAssignmentRequest,
  IExperimentArmConfig,
  IExperimentRewardRequest,
  IExperimentCheckoutAttributionInput,
  TExperimentAttributionValidationResult,
  TExperimentRewardOutcome,
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

export async function validateExperimentCheckoutAttribution(
  attribution: IExperimentCheckoutAttributionInput
): Promise<TExperimentAttributionValidationResult> {
  const { data: assignment, error } = await supabaseAdmin
    .from('experiment_assignments')
    .select('arm_id, experiment_key, context_key, assignment_key, surface')
    .eq('experiment_key', attribution.experimentKey)
    .eq('context_key', attribution.contextKey)
    .eq('assignment_key', attribution.assignmentKey)
    .maybeSingle();

  if (error) return { valid: false, reason: 'storage_error' };
  if (!assignment) return { valid: false, reason: 'missing_assignment' };
  if (Number(assignment.arm_id) !== attribution.armId) {
    return { valid: false, reason: 'assignment_mismatch' };
  }

  const arm = await getArmById(attribution.armId);
  if (
    !arm ||
    arm.experiment_key !== attribution.experimentKey ||
    arm.context_key !== attribution.contextKey ||
    arm.arm_key !== attribution.armKey
  ) {
    return { valid: false, reason: 'invalid_arm' };
  }

  return { valid: true, attribution };
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

export async function recordExperimentReward(
  params: IExperimentRewardRequest
): Promise<TExperimentRewardOutcome> {
  const contextKey = params.contextKey || 'global';
  const rewardValue = params.rewardValue ?? 1;
  const revenueCents = params.revenueCents ?? 0;

  if (!params.assignmentKey) return 'missing_assignment';
  if (!params.purchaseId) throw new Error('Experiment purchase reward requires purchaseId');

  const { data, error } = await supabaseAdmin.rpc('record_experiment_purchase_reward', {
    p_experiment_key: params.experimentKey,
    p_context_key: contextKey,
    p_arm_id: params.armId,
    p_assignment_key: params.assignmentKey,
    p_purchase_id: params.purchaseId,
    p_reward_type: params.rewardType,
    p_reward_value: rewardValue,
    p_revenue_cents: revenueCents,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    throw new Error(`Failed to record experiment reward: ${error.message}`);
  }

  if (
    data !== 'recorded' &&
    data !== 'duplicate' &&
    data !== 'missing_assignment' &&
    data !== 'invalid_arm'
  ) {
    throw new Error(`Unexpected experiment reward outcome: ${String(data)}`);
  }

  return data;
}
