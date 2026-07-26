import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export interface IProcessingCostAttribution {
  modelId: string;
  qualityTier: string;
  scale: number;
  effectiveResolution?: string;
  providerCostUsd: number;
  creditsCharged: number;
  pricingModel: string;
}

interface IProcessingCostTelemetryParams {
  userId: string;
  jobId: string;
  outputImagePath?: string;
  attribution: IProcessingCostAttribution;
}

/**
 * Record cost attribution without affecting the user's successful provider run.
 */
export async function recordProcessingCostTelemetry(
  params: IProcessingCostTelemetryParams
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('processing_jobs').insert({
      user_id: params.userId,
      status: 'completed',
      input_image_path: 'inline://redacted',
      output_image_path: params.outputImagePath ?? null,
      credits_used: params.attribution.creditsCharged,
      processing_mode: 'standard',
      settings: {
        provider_job_id: params.jobId,
        pricing_model: params.attribution.pricingModel,
      },
      completed_at: new Date().toISOString(),
      model_id: params.attribution.modelId,
      quality_tier: params.attribution.qualityTier,
      scale: params.attribution.scale,
      effective_resolution: params.attribution.effectiveResolution ?? null,
      provider_cost_usd: params.attribution.providerCostUsd,
      credits_charged: params.attribution.creditsCharged,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Failed to record processing cost telemetry:', error);
  }
}
