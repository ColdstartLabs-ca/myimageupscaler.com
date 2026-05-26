export type TExperimentAssignmentScope = 'session' | 'user';

export interface IExperimentArmConfig {
  [key: string]: unknown;
}

export interface IExperimentAssignmentRequest {
  experimentKey: string;
  contextKey?: string;
  assignmentKey: string;
  assignmentScope: TExperimentAssignmentScope;
  surface: string;
  metadata?: Record<string, unknown>;
}

export interface IExperimentAssignment {
  experimentKey: string;
  contextKey: string;
  armId: number;
  armKey: string;
  armConfig: IExperimentArmConfig;
  assignmentKey: string;
  surface: string;
}

export interface IExperimentRewardRequest {
  experimentKey: string;
  contextKey?: string;
  armId: number;
  assignmentKey?: string;
  rewardType: string;
  rewardValue?: number;
  revenueCents?: number;
  sourceEvent?: string;
  metadata?: Record<string, unknown>;
}

export interface IExperimentCheckoutMetadata {
  experimentKey: string;
  experimentContextKey: string;
  experimentArmId: number;
  experimentArmKey: string;
  experimentAssignmentKey?: string;
}

export const EXPERIMENT_CHECKOUT_METADATA_KEYS = {
  experimentKey: 'exp_key',
  experimentContextKey: 'exp_ctx',
  experimentArmId: 'exp_arm_id',
  experimentArmKey: 'exp_arm_key',
  experimentAssignmentKey: 'exp_assign_key',
} as const;
