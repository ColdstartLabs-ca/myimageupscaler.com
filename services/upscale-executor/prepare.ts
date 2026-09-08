import { z } from 'zod';
import { serverEnv } from '@shared/config/env';
import { ModelRegistry } from '@server/services/model-registry';
import {
  getAutoEligibleModels,
  isAutoModelCompatible,
  resolveAutoModel,
} from '@server/services/auto-model-selection';
import {
  getScalePreservingFallbackCandidates,
  resolveScalePreservingModel,
} from '@server/services/scale-preserving-model';
import { buildAnalysisPrompt } from '@server/services/internal/prompt-builder';
import {
  calculateFinalProviderAwareCredits,
  modelIdToTier,
  resolveEffectiveResolution,
} from '@shared/config/subscription.utils';
import { upscaleSchema } from '@shared/validation/upscale.schema';
import type { IUpscaleConfig, ModelId } from '@shared/types/coreflow.types';
import type { IExecutorDatabase } from './index';
import type { IExecutorExecution, IExecutorInputResolver, IExecutorRpc } from './advance';

const instructionSchema = z.object({
  userTier: z.enum(['free', 'hobby', 'pro', 'business']),
  isPaidUser: z.boolean(),
  allowedModelIds: z.array(z.string().max(100)).max(32),
  reservedMaximumCredits: z.number().int().positive(),
});
const analysisSchema = z.object({
  recommendedModel: z.string().max(100).optional(),
  enhancementPrompt: z.string().max(2000).optional(),
});
export type IDeferredAnalysis = z.infer<typeof analysisSchema>;
export interface IResolvedDeferredPlan {
  modelId: string;
  provider: string;
  modelVersion: string | null;
  charge: number;
  config: IUpscaleConfig & Record<string, unknown>;
}

function inputs(execution: IExecutorExecution) {
  const raw = execution.config as Record<string, unknown>;
  const instruction = instructionSchema.parse(raw.executionPlan);
  const config = upscaleSchema.parse({
    storagePath: execution.input_storage_path,
    jobId: execution.job_id,
    mimeType: execution.input_mime_type,
    config: raw,
  }).config;
  return { raw, instruction, config };
}

/** Resolve only within the server-authorized admission policy and price ceiling. */
export function resolveDeferredPlan(
  execution: IExecutorExecution,
  analysis: IDeferredAnalysis
): IResolvedDeferredPlan {
  const { raw, instruction, config } = inputs(execution);
  const registry = ModelRegistry.getInstance();
  const isAuto = config.qualityTier === 'auto';
  const allowed = getAutoEligibleModels(
    registry.getModelsByTier(instruction.isPaidUser ? instruction.userTier : 'free'),
    config.scale
  ).filter(model => instruction.allowedModelIds.includes(model.id));
  const width = execution.input_width;
  const height = execution.input_height;
  if (!width || !height) throw new Error('Deferred plan input dimensions missing');
  const processingModel = (id: string): string => {
    const fallback = resolveScalePreservingModel({
      modelId: id as ModelId,
      width,
      height,
      scale: config.scale,
    });
    return fallback.usedFallback
      ? (getScalePreservingFallbackCandidates(instruction.isPaidUser).find(
          candidate => registry.getModel(candidate)?.isEnabled
        ) ?? id)
      : id;
  };
  const safeCandidates = allowed.filter(model => {
    const target = registry.getModel(processingModel(model.id));
    return (
      target?.isEnabled &&
      isAutoModelCompatible(target, config.scale) &&
      width * height <= (target.maxInputPixels ?? Number.MAX_SAFE_INTEGER)
    );
  });
  const selected = isAuto
    ? resolveAutoModel(safeCandidates, config.scale, analysis.recommendedModel)
    : registry.getModel(execution.resolved_model_id);
  if (!selected?.isEnabled) throw new Error('Deferred plan model unavailable');
  const modelId = isAuto ? processingModel(selected.id) : execution.resolved_model_id;
  const target = registry.getModel(modelId)!;
  if (
    !isAutoModelCompatible(target, config.scale) ||
    width * height > (target.maxInputPixels ?? Number.MAX_SAFE_INTEGER)
  )
    throw new Error('Deferred plan exceeds model limits');
  const billingModelId = isAuto ? selected.id : execution.billing_model_id;
  const qualityTier = isAuto ? modelIdToTier(billingModelId) : config.qualityTier;
  const charge = calculateFinalProviderAwareCredits({
    modelId: billingModelId,
    qualityTier,
    scale: config.scale,
    inputWidth: width,
    inputHeight: height,
    smartAnalysis: !isAuto && config.additionalOptions.smartAnalysis,
    targetResolution: config.targetResolution,
    effectiveResolution: resolveEffectiveResolution(
      billingModelId,
      config.scale,
      config.nanoBananaProConfig?.resolution
    ),
  }).finalCredits;
  if (charge > Math.min(execution.credits_reserved ?? 0, instruction.reservedMaximumCredits))
    throw new Error('Deferred plan exceeds authorized reservation');
  const enhancementPrompt =
    analysis.enhancementPrompt ??
    (typeof raw.enhancementPrompt === 'string' ? raw.enhancementPrompt : undefined);
  return {
    modelId,
    provider: target.provider,
    modelVersion: isAuto ? (target.modelVersion ?? null) : execution.model_version,
    charge,
    config: {
      ...config,
      qualityTier,
      enhancementPrompt,
      requestedQualityTier: raw.requestedQualityTier ?? config.qualityTier,
      additionalOptions: {
        ...config.additionalOptions,
        ...(!config.additionalOptions.customInstructions && enhancementPrompt
          ? { customInstructions: enhancementPrompt }
          : {}),
      },
      executionPlan: { ...instruction, deferredAnalysis: false, billingModelId },
    },
  };
}

/** URL-based analysis stays in Node; the metadata response is capped at 64 KiB. */
export async function analyzeDeferredImage(
  execution: IExecutorExecution,
  inputUrl: string,
  options: { fetch?: typeof fetch; apiKey?: string } = {}
): Promise<IDeferredAnalysis> {
  const apiKey = options.apiKey ?? serverEnv.OPENROUTER_API_KEY;
  if (!apiKey) return {};
  try {
    const { config, instruction } = inputs(execution);
    const response = await (options.fetch ?? fetch)(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(10_000, Date.parse(execution.deadline_at) - Date.now()))
        ),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: serverEnv.OPENROUTER_VL_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: buildAnalysisPrompt(
                    instruction.allowedModelIds as ModelId[],
                    config.qualityTier === 'auto'
                  ),
                },
                { type: 'image_url', image_url: { url: inputUrl } },
              ],
            },
          ],
          max_tokens: 1024,
          temperature: 0.2,
        }),
      }
    );
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return {};
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 64 * 1024) return {};
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const text = JSON.parse(Buffer.concat(chunks).toString()).choices?.[0]?.message?.content;
    if (typeof text !== 'string') return {};
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    return json ? analysisSchema.parse(JSON.parse(json)) : {};
  } catch {
    return {};
  }
}

export function createExecutionPreparer(options: {
  database: IExecutorDatabase;
  rpc: IExecutorRpc;
  inputResolver: IExecutorInputResolver;
  analyze?: typeof analyzeDeferredImage;
}): (execution: IExecutorExecution) => Promise<IExecutorExecution> {
  return async execution => {
    const inputUrl = await options.inputResolver.resolve(execution);
    const analysis = await (options.analyze ?? analyzeDeferredImage)(execution, inputUrl);
    let plan: IResolvedDeferredPlan;
    try {
      plan = resolveDeferredPlan(execution, analysis);
    } catch {
      await options.rpc.settleFailure({
        jobId: execution.job_id,
        failureReason: 'deferred_plan_outside_authorized_limits',
      });
      const failed = await options.rpc.getExecution(execution.job_id);
      if (!failed) throw new Error('Deferred plan settlement unavailable');
      return failed;
    }
    const result = await options.database.rpc('resolve_upscale_execution_plan', {
      p_job_id: execution.job_id,
      p_model_id: plan.modelId,
      p_provider: plan.provider,
      p_model_version: plan.modelVersion,
      p_charge: plan.charge,
      p_config: plan.config,
    });
    if (result.error) throw new Error('Deferred execution plan could not be persisted');
    const current = await options.rpc.getExecution(execution.job_id);
    if (!current || current.provider === 'deferred')
      throw new Error('Deferred execution plan did not become authoritative');
    return current;
  };
}
