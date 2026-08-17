import {
  isGpuContentionError,
  isRateLimitError,
  isTransientUpstreamError,
  withRetry,
} from '@server/utils/retry';
import { serverEnv } from '@shared/config/env';
import { serializeError } from '@shared/utils/errors';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';
import Replicate from 'replicate';
import { calculateCreditCost } from './image-generation.service';
import type {
  IImageProcessor,
  IImageProcessorResult,
  IProcessImageOptions,
} from './image-processor.interface';
import { ModelRegistry } from './model-registry';

// Refactored utilities
import { buildModelInput, type IModelInput } from './replicate/builders';
import { creditManager } from './replicate/utils/credit-manager';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';
import { replicateErrorMapper } from './replicate/utils/error-mapper';
import { ReplicateError } from './replicate/utils/error-mapper';
import { parseReplicateResponse } from './replicate/utils/output-parser';
import { recordProcessingCostTelemetry } from './cost-telemetry.service';

/**
 * Re-export ReplicateError for backward compatibility
 */
export { ReplicateError } from './replicate/utils/error-mapper';

function isMeaningfulImageReference(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') {
    return false;
  }

  if (!normalized.startsWith('data:')) {
    return true;
  }

  const separatorIndex = normalized.indexOf(',');
  if (separatorIndex === -1) {
    return false;
  }

  const payload = normalized.slice(separatorIndex + 1).trim();
  return Boolean(payload && payload !== 'null' && payload !== 'undefined');
}

/**
 * Service for image upscaling via Replicate
 *
 * Refactored to follow SOLID principles:
 * - Single Responsibility: Delegates to specialized utilities
 * - Open/Closed: Extensible through model builders
 * - Dependency Inversion: Depends on abstractions
 *
 * Cost: ~$0.0017/image on T4 GPU
 * Speed: ~1-2 seconds per image
 */

/**
 * Build a per-request retry decision.
 *
 * Rate limits and transient blips fail fast, so they keep the full retry
 * budget. A GPU-contention attempt burns ~16s median of provider time before
 * it dies, so only one retry fits inside the route's 2-minute processing
 * budget - a second would surface as a timeout instead of a clear error.
 *
 * The counter is per request: each call gets its own contention budget.
 */
export function createReplicateRetryPolicy(maxContentionRetries = 1): (message: string) => boolean {
  let contentionRetries = 0;

  return (message: string): boolean => {
    if (isGpuContentionError(message)) {
      contentionRetries += 1;
      return contentionRetries <= maxContentionRetries;
    }

    return isRateLimitError(message) || isTransientUpstreamError(message);
  };
}

export class ReplicateService implements IImageProcessor {
  public readonly providerName = 'Replicate';
  private replicate: Replicate;
  private modelVersion: string;
  private modelId: string;

  constructor(modelId: string = 'real-esrgan') {
    const apiToken = serverEnv.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }

    this.replicate = new Replicate({ auth: apiToken });
    this.modelVersion = serverEnv.REPLICATE_MODEL_VERSION;
    this.modelId = modelId;
  }

  /**
   * Check if Replicate supports the given processing mode
   */
  supportsMode(mode: string): boolean {
    return ['upscale', 'both'].includes(mode);
  }

  /**
   * Process an image upscale request via Replicate
   */
  async processImage(
    userId: string,
    input: IUpscaleInput,
    options?: IProcessImageOptions
  ): Promise<IImageProcessorResult> {
    const creditCost = options?.creditCost ?? calculateCreditCost(input.config);

    // Reject malformed image payloads before any credit-consuming operation.
    this.ensureInputImageDataPresent(input);

    // Step 1: Deduct credits atomically using CreditManager
    const deduction = await creditManager.deductCredits(userId, creditCost, this.providerName);
    options?.onCreditsDeducted?.(deduction);

    try {
      // Step 2: Call Replicate API
      const result = await this.callReplicate(input);
      await this.recordLifecycleActivation(userId);
      if (options?.costAttribution) {
        await recordProcessingCostTelemetry({
          userId,
          jobId: deduction.jobId,
          outputImagePath: result.imageUrl,
          attribution: options.costAttribution,
        });
      }

      return {
        ...result,
        creditsRemaining: deduction.newBalance,
      };
    } catch (error) {
      // Step 3: Refund on failure
      await creditManager.refundCredits(
        userId,
        deduction,
        'Credit refund for failed Replicate processing'
      );
      throw error;
    }
  }

  private async recordLifecycleActivation(userId: string): Promise<void> {
    try {
      const lifecycleService = getEmailLifecycleService();
      await lifecycleService.cancelPendingForUser(userId, 'user_processed_image', [
        'signup-no-upload-2h',
        'signup-no-upload-24h',
        'signup-no-upload-3d-blog',
        'winback-never-uploaded-14d',
      ]);
      await lifecycleService.queueFirstResultFollowup(userId);
    } catch (error) {
      console.error('Failed to record lifecycle activation:', error);
    }
  }

  /**
   * Get the model version for a given model ID from the registry
   */
  private getModelVersionForId(modelId: string): string {
    const registry = ModelRegistry.getInstance();
    const model = registry.getModel(modelId);

    if (model && model.modelVersion) {
      return model.modelVersion;
    }

    return this.modelVersion;
  }

  /**
   * Build model input for testing purposes
   *
   * Exposes the builder system for testing while keeping the main implementation private
   *
   * @param modelId - The model ID
   * @param imageDataUrl - The image data URL
   * @param input - The upscale input
   * @returns The model-specific input
   */
  public buildModelInputForTest(
    modelId: string,
    imageDataUrl: string,
    input: IUpscaleInput
  ): IModelInput {
    const inputWithUrl = {
      ...input,
      imageData: imageDataUrl,
    };
    return buildModelInput(modelId, inputWithUrl);
  }

  /**
   * Build model input using the orchestrator (private method)
   *
   * This is now a simple delegation to the builder system
   */
  private buildModelInput(
    modelId: string,
    imageDataUrl: string,
    input: IUpscaleInput
  ): IModelInput {
    // For image URL consistency, ensure we use the passed imageDataUrl
    const inputWithUrl = {
      ...input,
      imageData: imageDataUrl,
    };
    return buildModelInput(modelId, inputWithUrl);
  }

  private extractImageReferences(replicateInput: IModelInput): unknown[] {
    const fields = [
      'image',
      'img',
      'input_image',
      'img_cond_path',
      'input_images',
      'image_input',
      'images',
    ] as const;
    const inputRecord = replicateInput as Partial<Record<(typeof fields)[number], unknown>>;

    return fields.flatMap(field => {
      const value = inputRecord[field];
      if (typeof value === 'undefined') {
        return [];
      }

      return Array.isArray(value) ? value : [value];
    });
  }

  private ensureImageInputPresent(replicateInput: IModelInput): void {
    const hasValidImageReference = this.extractImageReferences(replicateInput).some(
      isMeaningfulImageReference
    );

    if (!hasValidImageReference) {
      throw new ReplicateError(
        'Image input is missing or empty before the Replicate call.',
        'INVALID_INPUT'
      );
    }
  }

  private ensureInputImageDataPresent(input: IUpscaleInput): void {
    if (!isMeaningfulImageReference(input.imageData)) {
      throw new ReplicateError(
        'Image input is missing or empty before the Replicate call.',
        'INVALID_INPUT'
      );
    }
  }

  /**
   * Call the Replicate model (supports multiple models from registry)
   */
  private async callReplicate(input: IUpscaleInput): Promise<{
    imageUrl: string;
    mimeType: string;
    expiresAt: number;
  }> {
    // Prepare image data - ensure it's a data URL
    this.ensureInputImageDataPresent(input);

    let imageDataUrl = input.imageData.trim();
    if (!imageDataUrl.startsWith('data:')) {
      const mimeType = input.mimeType || 'image/jpeg';
      imageDataUrl = `data:${mimeType};base64,${imageDataUrl}`;
    }

    // Use the instance's modelId
    const selectedModel = this.modelId;
    const modelVersion =
      selectedModel !== 'auto' ? this.getModelVersionForId(selectedModel) : this.modelVersion;

    // Prepare Replicate input using the builder system
    const replicateInput = this.buildModelInput(selectedModel, imageDataUrl, input);
    this.ensureImageInputPresent(replicateInput);

    const shouldRetryReplicateError = createReplicateRetryPolicy();

    try {
      // Run with retry for rate limits and transient provider/output failures.
      return await withRetry(
        async () => {
          const output = await this.replicate.run(modelVersion as `${string}/${string}:${string}`, {
            input: replicateInput,
          });

          return parseReplicateResponse(output);
        },
        {
          shouldRetry: err => shouldRetryReplicateError(serializeError(err)),
          onRetry: (attempt, delayMs, err) => {
            console.log(
              `[Replicate] Retrying in ${delayMs}ms (attempt ${attempt}/3): ${serializeError(err)}`
            );
          },
        }
      );
    } catch (error) {
      // Map errors using error mapper
      throw replicateErrorMapper.mapError(error);
    }
  }
}

// Export factory function for model-specific instances
export function createReplicateService(modelId: string): ReplicateService {
  return new ReplicateService(modelId);
}

// Export singleton for backward compatibility (default model)
let replicateServiceInstance: ReplicateService | null = null;

export function getReplicateService(): ReplicateService {
  if (!replicateServiceInstance) {
    replicateServiceInstance = new ReplicateService();
  }
  return replicateServiceInstance;
}
