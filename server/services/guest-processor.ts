/**
 * Guest Image Processor
 *
 * Simplified image processing for guest users.
 * No credit management, fixed model and scale.
 */

import { serverEnv } from '@shared/config/env';
import { GUEST_LIMITS } from '@shared/config/guest-limits.config';
import { isRateLimitError, withRetry } from '@server/utils/retry';
import { serializeError } from '@shared/utils/errors';
import Replicate from 'replicate';
import { parseReplicateResponse } from './replicate/utils/output-parser';
import { ModelRegistry } from './model-registry';

export interface IGuestProcessInput {
  imageData: string;
  mimeType: string;
  scale?: number;
  modelId?: string;
}

export interface IGuestProcessResult {
  imageUrl: string;
  mimeType: string;
  expiresAt: number;
}

/**
 * Process an image for a guest user
 * Uses fixed settings: real-esrgan, 2x scale
 */
export async function processGuestImage(input: IGuestProcessInput): Promise<IGuestProcessResult> {
  const apiToken = serverEnv.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is not configured');
  }

  const replicate = new Replicate({ auth: apiToken });

  // Prepare image data - ensure it's a data URL
  let imageDataUrl = input.imageData;
  if (!imageDataUrl.startsWith('data:')) {
    const mimeType = input.mimeType || 'image/jpeg';
    imageDataUrl = `data:${mimeType};base64,${imageDataUrl}`;
  }

  // Get model version from registry
  const modelId = input.modelId || GUEST_LIMITS.MODEL;
  const registry = ModelRegistry.getInstance();
  const model = registry.getModel(modelId);
  const modelVersion = model?.modelVersion || serverEnv.REPLICATE_MODEL_VERSION;

  // Build input for real-esrgan
  const replicateInput = {
    image: imageDataUrl,
    scale: input.scale || GUEST_LIMITS.SCALE,
    face_enhance: false,
  };

  // Run with retry for rate limits
  const output = await withRetry(
    () =>
      replicate.run(modelVersion as `${string}/${string}:${string}`, {
        input: replicateInput,
      }),
    {
      shouldRetry: err => isRateLimitError(serializeError(err)),
      onRetry: (attempt, delayMs) => {
        console.log(
          `[GuestProcessor] Rate limited, retrying in ${delayMs}ms (attempt ${attempt}/3)`
        );
      },
    }
  );

  return parseReplicateResponse(output);
}
