import {
  QUALITY_TIER_CONFIG,
  type IUpscaleConfig,
  type QualityTier,
} from '@shared/types/coreflow.types';

const INTERRUPTED_JOB_STORAGE_KEY = 'miu_interrupted_job';
const INTERRUPTED_JOB_VERSION = 1;
const INTERRUPTED_JOB_TTL_MS = 30 * 60 * 1000;
const MAX_INTERRUPTED_ITEMS = 50;

type TInterruptedJobStatus = 'pending' | 'claimed' | 'needs_action';
export type TInterruptedJobActionReason =
  | 'stale'
  | 'missing_inputs'
  | 'credits_unconfirmed'
  | 'resume_failed';

export interface IInterruptedJob {
  version: typeof INTERRUPTED_JOB_VERSION;
  jobId: string;
  status: TInterruptedJobStatus;
  createdAt: number;
  expiresAt: number;
  requiredCredits: number;
  itemIds: string[];
  config: IUpscaleConfig;
  actionReason?: TInterruptedJobActionReason;
  claimedAt?: number;
}

export type TInterruptedJobInspection =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'ready'; job: IInterruptedJob }
  | { status: 'already_claimed'; job: IInterruptedJob }
  | {
      status: 'needs_action';
      job: IInterruptedJob;
      reason: TInterruptedJobActionReason;
    };

export type TInterruptedJobClaim =
  | { status: 'claimed'; job: IInterruptedJob }
  | {
      status: 'missing' | 'invalid' | 'stale' | 'already_claimed' | 'needs_action';
    };

function createJobId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `ij_${crypto.randomUUID().replaceAll('-', '')}`;
  }

  return `ij_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function copyMinimalConfig(config: IUpscaleConfig): IUpscaleConfig {
  const enhancement = config.additionalOptions.enhancement;
  const nanoBananaProConfig = config.nanoBananaProConfig;

  return {
    qualityTier: config.qualityTier,
    scale: config.scale,
    additionalOptions: {
      smartAnalysis: config.additionalOptions.smartAnalysis,
      enhance: config.additionalOptions.enhance,
      enhanceFaces: config.additionalOptions.enhanceFaces,
      preserveText: config.additionalOptions.preserveText,
      ...(config.additionalOptions.customInstructions !== undefined && {
        customInstructions: config.additionalOptions.customInstructions,
      }),
      ...(enhancement && {
        enhancement: {
          clarity: enhancement.clarity,
          color: enhancement.color,
          lighting: enhancement.lighting,
          denoise: enhancement.denoise,
          artifacts: enhancement.artifacts,
          details: enhancement.details,
        },
      }),
    },
    ...(nanoBananaProConfig && {
      nanoBananaProConfig: {
        aspectRatio: nanoBananaProConfig.aspectRatio,
        resolution: nanoBananaProConfig.resolution,
        outputFormat: nanoBananaProConfig.outputFormat,
        safetyFilterLevel: nanoBananaProConfig.safetyFilterLevel,
      },
    }),
  };
}

function isValidConfig(value: unknown): value is IUpscaleConfig {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<IUpscaleConfig>;
  const options = candidate.additionalOptions;
  return (
    typeof candidate.qualityTier === 'string' &&
    Object.prototype.hasOwnProperty.call(
      QUALITY_TIER_CONFIG,
      candidate.qualityTier as QualityTier
    ) &&
    (candidate.scale === 2 || candidate.scale === 4 || candidate.scale === 8) &&
    Boolean(options) &&
    typeof options === 'object' &&
    typeof options.smartAnalysis === 'boolean' &&
    typeof options.enhance === 'boolean' &&
    typeof options.enhanceFaces === 'boolean' &&
    typeof options.preserveText === 'boolean' &&
    (options.customInstructions === undefined || typeof options.customInstructions === 'string')
  );
}

function isValidJob(value: unknown): value is IInterruptedJob {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<IInterruptedJob>;
  const itemIds = candidate.itemIds;
  return (
    candidate.version === INTERRUPTED_JOB_VERSION &&
    typeof candidate.jobId === 'string' &&
    candidate.jobId.startsWith('ij_') &&
    (candidate.status === 'pending' ||
      candidate.status === 'claimed' ||
      candidate.status === 'needs_action') &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    typeof candidate.expiresAt === 'number' &&
    candidate.expiresAt > candidate.createdAt &&
    typeof candidate.requiredCredits === 'number' &&
    Number.isSafeInteger(candidate.requiredCredits) &&
    candidate.requiredCredits > 0 &&
    Array.isArray(itemIds) &&
    itemIds.length > 0 &&
    itemIds.length <= MAX_INTERRUPTED_ITEMS &&
    itemIds.every(
      itemId => typeof itemId === 'string' && itemId.length > 0 && itemId.length <= 100
    ) &&
    new Set(itemIds).size === itemIds.length &&
    isValidConfig(candidate.config)
  );
}

function readStoredJob(): IInterruptedJob | null | 'invalid' {
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(INTERRUPTED_JOB_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return isValidJob(parsed) ? parsed : 'invalid';
  } catch {
    return 'invalid';
  }
}

function writeStoredJob(job: IInterruptedJob): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(INTERRUPTED_JOB_STORAGE_KEY, JSON.stringify(job));
  } catch {
    // Storage denial must never block the purchase flow.
  }
}

function samePendingJob(
  job: IInterruptedJob,
  input: {
    config: IUpscaleConfig;
    itemIds: string[];
    requiredCredits: number;
  }
): boolean {
  return (
    job.status === 'pending' &&
    job.requiredCredits === input.requiredCredits &&
    JSON.stringify(job.itemIds) === JSON.stringify(input.itemIds) &&
    JSON.stringify(job.config) === JSON.stringify(input.config)
  );
}

export function saveInterruptedJob(input: {
  config: IUpscaleConfig;
  itemIds: string[];
  requiredCredits: number;
}): IInterruptedJob {
  const minimalConfig = copyMinimalConfig(input.config);
  const existing = readStoredJob();
  if (
    existing !== null &&
    existing !== 'invalid' &&
    samePendingJob(existing, { ...input, config: minimalConfig })
  ) {
    return existing;
  }

  const createdAt = Date.now();
  const job: IInterruptedJob = {
    version: INTERRUPTED_JOB_VERSION,
    jobId: createJobId(),
    status: 'pending',
    createdAt,
    expiresAt: createdAt + INTERRUPTED_JOB_TTL_MS,
    requiredCredits: input.requiredCredits,
    itemIds: [...input.itemIds],
    config: minimalConfig,
  };

  if (!isValidJob(job)) {
    throw new Error('Invalid interrupted job');
  }

  writeStoredJob(job);
  return job;
}

export function inspectInterruptedJob(now = Date.now()): TInterruptedJobInspection {
  const job = readStoredJob();
  if (job === null) return { status: 'missing' };
  if (job === 'invalid') return { status: 'invalid' };

  if (now > job.expiresAt && job.actionReason !== 'stale') {
    const staleJob: IInterruptedJob = {
      ...job,
      status: 'needs_action',
      actionReason: 'stale',
    };
    writeStoredJob(staleJob);
    return { status: 'needs_action', job: staleJob, reason: 'stale' };
  }

  if (job.status === 'claimed') return { status: 'already_claimed', job };
  if (job.status === 'needs_action') {
    return {
      status: 'needs_action',
      job,
      reason: job.actionReason || 'resume_failed',
    };
  }

  return { status: 'ready', job };
}

export function claimInterruptedJob(jobId: string, now = Date.now()): TInterruptedJobClaim {
  const inspection = inspectInterruptedJob(now);
  if (inspection.status === 'missing' || inspection.status === 'invalid') {
    return { status: inspection.status };
  }
  if (inspection.status === 'already_claimed') return { status: 'already_claimed' };
  if (inspection.status === 'needs_action') {
    return { status: inspection.reason === 'stale' ? 'stale' : 'needs_action' };
  }
  if (inspection.job.jobId !== jobId) return { status: 'missing' };

  const claimedJob: IInterruptedJob = {
    ...inspection.job,
    status: 'claimed',
    claimedAt: now,
  };
  writeStoredJob(claimedJob);
  return { status: 'claimed', job: claimedJob };
}

export function markInterruptedJobNeedsAction(
  jobId: string,
  reason: TInterruptedJobActionReason
): void {
  const job = readStoredJob();
  if (job === null || job === 'invalid' || job.jobId !== jobId) return;

  writeStoredJob({
    ...job,
    status: 'needs_action',
    actionReason: reason,
  });
}

export function clearInterruptedJob(jobId: string): void {
  if (typeof sessionStorage === 'undefined') return;

  const job = readStoredJob();
  if (job === null || job === 'invalid' || job.jobId !== jobId) return;
  try {
    sessionStorage.removeItem(INTERRUPTED_JOB_STORAGE_KEY);
  } catch {
    // A completed job remains claimed, so storage denial still cannot duplicate it.
  }
}
