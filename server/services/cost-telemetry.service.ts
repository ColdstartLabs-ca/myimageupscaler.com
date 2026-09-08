import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export type ProcessingAttemptStatus = 'succeeded' | 'failed';

export interface IProcessingAttemptAttribution {
  modelId: string;
  modelVersion: string;
  predictionId?: string;
  status: ProcessingAttemptStatus;
  providerCostUsd: number;
  failureCode?: string;
}

export interface IProcessingCostAttribution {
  modelId: string;
  qualityTier: string;
  scale: number;
  effectiveResolution?: string;
  providerCostUsd: number;
  creditsCharged: number;
  /** The originally quoted customer charge when a provider run is refunded. */
  quotedCredits?: number;
  pricingModel: string;
  /** Safe provider metadata for every inference attempt; never includes payloads or URLs. */
  attempts?: readonly IProcessingAttemptAttribution[];
}

interface IProcessingCostTelemetryParams {
  userId: string;
  jobId: string;
  outputImagePath?: string;
  status?: 'completed' | 'failed';
  failureReason?: string;
  attribution: IProcessingCostAttribution;
}

/**
 * Record cost attribution without affecting the user's successful provider run.
 */
export async function recordProcessingCostTelemetry(
  params: IProcessingCostTelemetryParams
): Promise<void> {
  try {
    const status = params.status ?? 'completed';
    const isCompleted = status === 'completed';
    const attempts = params.attribution.attempts;

    const { error } = await supabaseAdmin.from('processing_jobs').insert({
      user_id: params.userId,
      status,
      input_image_path: 'inline://redacted',
      output_image_path: isCompleted ? (params.outputImagePath ?? null) : null,
      credits_used: isCompleted ? params.attribution.creditsCharged : 0,
      processing_mode: 'standard',
      settings: {
        provider_job_id: params.jobId,
        pricing_model: params.attribution.pricingModel,
        ...(params.attribution.quotedCredits !== undefined
          ? { quoted_credits: params.attribution.quotedCredits }
          : {}),
        ...(attempts && attempts.length > 0 ? { attempt_count: attempts.length, attempts } : {}),
      },
      completed_at: isCompleted ? new Date().toISOString() : null,
      model_id: params.attribution.modelId,
      quality_tier: params.attribution.qualityTier,
      scale: params.attribution.scale,
      effective_resolution: params.attribution.effectiveResolution ?? null,
      provider_cost_usd: params.attribution.providerCostUsd,
      credits_charged: isCompleted ? params.attribution.creditsCharged : 0,
      error_message: isCompleted ? null : (params.failureReason ?? 'provider_processing_failed'),
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Failed to record processing cost telemetry:', error);
  }
}
