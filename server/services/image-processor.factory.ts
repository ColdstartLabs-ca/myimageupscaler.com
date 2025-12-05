import { serverEnv } from '@shared/config/env';
import type { IImageProcessor } from './image-processor.interface';
import { ReplicateService } from './replicate.service';
import { ImageGenerationService } from './image-generation.service';
import type { ProcessingMode } from '@shared/types/pixelperfect';

/**
 * Factory for creating image processor instances
 *
 * Design Pattern: Factory + Strategy
 * - Factory: Creates the appropriate provider instance
 * - Strategy: Providers implement common IImageProcessor interface
 *
 * Provider Selection Logic (Priority Order):
 * 1. **Replicate (Default)** - Fast, cheap, deterministic upscaling
 *    - Used for: 'upscale' and 'both' modes
 *    - Cost: $0.0017/image (76x cheaper than Gemini)
 *    - Fallback: Gemini if Replicate unavailable
 *
 * 2. **Gemini (Fallback/Creative)** - Creative enhancement, custom prompts
 *    - Used for: 'enhance' and 'custom' modes
 *    - Cost: $0.13/image
 *    - Fallback: None (required for creative modes)
 */
export class ImageProcessorFactory {
  private static replicateInstance: ReplicateService | null = null;
  private static geminiInstance: ImageGenerationService | null = null;

  /**
   * Get or create a Replicate service instance (singleton)
   */
  private static getReplicateService(): ReplicateService {
    if (!this.replicateInstance) {
      this.replicateInstance = new ReplicateService();
    }
    return this.replicateInstance;
  }

  /**
   * Get or create a Gemini service instance (singleton)
   */
  private static getGeminiService(): ImageGenerationService {
    if (!this.geminiInstance) {
      this.geminiInstance = new ImageGenerationService();
    }
    return this.geminiInstance;
  }

  /**
   * Create the appropriate image processor for the given mode
   *
   * Selection Logic:
   * - upscale/both → Replicate (default), fallback to Gemini
   * - enhance/custom → Gemini only
   *
   * @param mode - The processing mode
   * @returns An image processor instance
   * @throws Error if no suitable provider is available
   */
  static createProcessor(mode: ProcessingMode): IImageProcessor {
    // Try Replicate first for upscale/both modes (default, fast, cheap)
    if (['upscale', 'both'].includes(mode) && serverEnv.REPLICATE_API_TOKEN) {
      try {
        return this.getReplicateService();
      } catch (error) {
        console.warn('Replicate unavailable, falling back to Gemini:', error);
        // Fall through to Gemini
      }
    }

    // Use Gemini for enhance/custom modes or as fallback
    if (serverEnv.GEMINI_API_KEY) {
      return this.getGeminiService();
    }

    // No providers available
    throw new Error(
      'No image processing providers configured. Set REPLICATE_API_TOKEN or GEMINI_API_KEY.'
    );
  }

  /**
   * Get the best available processor with automatic fallback
   *
   * This method attempts to use the most cost-effective provider
   * and gracefully falls back if unavailable.
   *
   * @param mode - The processing mode
   * @returns An image processor instance with fallback capability
   */
  static createProcessorWithFallback(mode: ProcessingMode): {
    primary: IImageProcessor;
    fallback: IImageProcessor | null;
  } {
    let primary: IImageProcessor;
    let fallback: IImageProcessor | null = null;

    // For upscale/both: try Replicate first, Gemini as fallback
    if (['upscale', 'both'].includes(mode)) {
      if (serverEnv.REPLICATE_API_TOKEN) {
        try {
          primary = this.getReplicateService();
          // Set Gemini as fallback if available
          if (serverEnv.GEMINI_API_KEY) {
            fallback = this.getGeminiService();
          }
          return { primary, fallback };
        } catch (error) {
          console.warn('Replicate initialization failed:', error);
          // Fall through to Gemini
        }
      }
    }

    // For enhance/custom or fallback: use Gemini
    if (serverEnv.GEMINI_API_KEY) {
      primary = this.getGeminiService();
      return { primary, fallback: null }; // No fallback for Gemini
    }

    throw new Error('No image processing providers available');
  }

  /**
   * Check if a specific provider is available
   */
  static isProviderAvailable(providerName: 'Replicate' | 'Gemini'): boolean {
    switch (providerName) {
      case 'Replicate':
        return Boolean(serverEnv.REPLICATE_API_TOKEN);
      case 'Gemini':
        return Boolean(serverEnv.GEMINI_API_KEY);
      default:
        return false;
    }
  }

  /**
   * Get information about available providers
   */
  static getAvailableProviders(): Array<{ name: string; available: boolean; modes: string[] }> {
    return [
      {
        name: 'Replicate',
        available: this.isProviderAvailable('Replicate'),
        modes: ['upscale', 'both'],
      },
      {
        name: 'Gemini',
        available: this.isProviderAvailable('Gemini'),
        modes: ['upscale', 'enhance', 'both', 'custom'],
      },
    ];
  }
}
