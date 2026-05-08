/**
 * Replicate Provider Adapter
 *
 * Adapter for Replicate AI provider with credit tracking and usage monitoring.
 */

import type {
  IImageProcessor,
  IProcessImageOptions,
} from '@server/services/image-processor.interface';
import type { IProviderConfig } from '@shared/types/provider-adapter.types';
import { AIProvider, ProviderTier } from '@shared/types/provider-adapter.types';
import { BaseProviderAdapter } from './base-provider-adapter';

/**
 * Replicate provider configuration
 */
const REPLICATE_CONFIG: IProviderConfig = {
  provider: AIProvider.REPLICATE,
  tier: ProviderTier.PAID, // Pay-as-you-go, no free tier
  priority: 2, // Lower priority than free providers
  enabled: true,
  supportedModels: [
    'real-esrgan',
    'gfpgan',
    'clarity-upscaler',
    'flux-2-pro',
    'nano-banana-pro',
    'qwen-image-edit',
    'clarity-pro-upscaler',
    'recraft-crisp-upscale',
  ],
  // No fallback needed for paid provider
  freeTier: {
    dailyRequests: 0,
    monthlyCredits: 0,
    hardLimit: false,
    resetTimezone: 'UTC',
  },
};

/**
 * Adapter for Replicate AI provider
 */
export class ReplicateProviderAdapter extends BaseProviderAdapter {
  constructor(processor: IImageProcessor) {
    super(processor, REPLICATE_CONFIG);
  }

  /**
   * Calculate credit cost based on model being used
   * Replicate has different costs per model
   */
  protected override calculateCreditCost(options?: IProcessImageOptions): number {
    // Model-specific credit costs (from credits.config.ts)
    // The actual model is determined by creditCost passed in options
    return options?.creditCost || 1;
  }

  /**
   * Replicate is always available (pay-as-you-go)
   */
  override async isAvailable(): Promise<boolean> {
    // Replicate doesn't have free tier limits
    return this.config.enabled;
  }
}

/**
 * Factory function to create Replicate adapter
 */
export function createReplicateAdapter(processor: IImageProcessor): ReplicateProviderAdapter {
  return new ReplicateProviderAdapter(processor);
}
