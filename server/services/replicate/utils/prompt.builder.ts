import type { IEnhancementSettings } from '@/shared/types/coreflow.types';

/**
 * Context for prompt building
 */
interface IPromptBuildContext {
  enhance: boolean;
  enhanceFaces: boolean;
  preserveText: boolean;
  enhancementSettings: IEnhancementSettings;
  scale: number;
  customPrompt?: string;
  tierPrompt?: string;
  tierPromptOverride?: boolean;
}

/**
 * Default prompts by model type
 */
const DEFAULT_PROMPTS = {
  'clarity-upscaler': 'masterpiece, best quality, highres',
  'flux-kontext-pro': 'enhance and upscale this image, improve quality and details',
  'flux-2-pro': 'Restore this image exactly as it would look in higher resolution.',
  'nano-banana-pro': (scale: number) =>
    `Upscale this image to ${scale}x resolution with enhanced sharpness and detail.`,
  'qwen-image-edit': 'Improve this image while maintaining its original quality and sharpness.',
  'p-image-edit': 'Improve this image while maintaining its original quality and sharpness.',
  seedream: 'Improve this image quality while maintaining its original appearance.',
} as const;

/**
 * Generate enhancement instructions from enhancement settings
 *
 * Mirrors the client-side logic in prompt-utils.ts to ensure consistency
 */
export function generateEnhancementInstructions(enhancement: IEnhancementSettings): string {
  const actions: string[] = [];

  if (enhancement.clarity) {
    actions.push('sharpen edges and improve overall clarity');
  }

  if (enhancement.color) {
    actions.push('balance color saturation and correct color casts');
  }

  if (enhancement.lighting) {
    actions.push('optimize exposure and lighting balance');
  }

  if (enhancement.denoise) {
    actions.push('remove sensor noise and grain while preserving details');
  }

  if (enhancement.artifacts) {
    actions.push('eliminate compression artifacts and blocky patterns');
  }

  if (enhancement.details) {
    actions.push('enhance fine textures and subtle details');
  }

  if (actions.length === 0) {
    return '';
  }

  return actions.join(', ') + '. ';
}

/**
 * Build prompt suffixes for specific features
 */
const PROMPT_SUFFIXES = {
  enhanceFaces: 'Enhance facial features naturally without altering identity.',
  enhanceFacesWithPeriod: ' Enhance facial features naturally without altering identity.',
  preserveText: 'Preserve text and logos clearly.',
  preserveTextWithPeriod: 'Preserve and sharpen any text or logos in the image.',
  noCreativeChanges: 'No creative changes.',
} as const;

/**
 * Prompt Builder Utility
 *
 * Centralized prompt building logic for all Replicate models.
 * Eliminates DRY violations in model-specific builders.
 */
export class PromptBuilder {
  /**
   * Build a complete prompt for a model
   *
   * @param modelId - The model identifier
   * @param context - The build context with enhancement settings
   * @param options - Additional options for prompt customization
   * @returns The complete prompt string
   */
  build(
    modelId: string,
    context: IPromptBuildContext,
    options: {
      basePrompt?: string;
      includeNoCreativeChanges?: boolean;
    } = {}
  ): string {
    const { customPrompt, enhance, enhanceFaces, preserveText, enhancementSettings } = context;

    // Use custom prompt if provided (user instructions = full override)
    if (customPrompt) {
      return customPrompt;
    }

    // Use tier-specific prompt if defined
    if (!options.basePrompt && context.tierPrompt) {
      // genericPromptOverride: return as-is (no modifiers appended)
      if (context.tierPromptOverride) {
        return context.tierPrompt;
      }
      // Otherwise, use tier prompt as base and merge with generic modifiers below
    }

    // Get base prompt: explicit override > tier prompt > model default
    const basePrompt =
      options.basePrompt ?? context.tierPrompt ?? this.getDefaultPrompt(modelId, context);

    // Build the prompt with optional modifiers
    return this.buildWithModifiers(basePrompt, {
      enhance,
      enhanceFaces,
      preserveText,
      enhancement: enhancementSettings,
      includeNoCreativeChanges: options.includeNoCreativeChanges,
    });
  }

  /**
   * Get the default prompt for a model
   */
  private getDefaultPrompt(modelId: string, context: IPromptBuildContext): string {
    const defaultPrompt = DEFAULT_PROMPTS[modelId as keyof typeof DEFAULT_PROMPTS];

    if (typeof defaultPrompt === 'function') {
      return defaultPrompt(context.scale);
    }

    return defaultPrompt ?? '';
  }

  /**
   * Build prompt with enhancement and feature modifiers
   */
  private buildWithModifiers(
    basePrompt: string,
    modifiers: {
      enhance: boolean;
      enhanceFaces: boolean;
      preserveText: boolean;
      enhancement: IEnhancementSettings;
      includeNoCreativeChanges?: boolean;
    }
  ): string {
    const {
      enhance,
      enhanceFaces,
      preserveText,
      enhancement: settings,
      includeNoCreativeChanges,
    } = modifiers;
    const parts: string[] = [basePrompt];

    // Add period after base prompt if it doesn't end with one and there are modifiers
    const hasModifiers = enhance || enhanceFaces || preserveText || includeNoCreativeChanges;
    if (hasModifiers && !basePrompt.endsWith('.')) {
      parts.push('.');
    }

    // Add enhancement instructions
    if (enhance) {
      const enhancementInstructions = generateEnhancementInstructions(settings);
      if (enhancementInstructions) {
        parts.push(enhancementInstructions);
      }
    }

    // Add face enhancement instruction
    if (enhanceFaces) {
      parts.push(PROMPT_SUFFIXES.enhanceFacesWithPeriod);
    }

    // Add text preservation instruction
    if (preserveText) {
      parts.push(PROMPT_SUFFIXES.preserveTextWithPeriod);
    }

    // Add no creative changes suffix if requested
    if (includeNoCreativeChanges) {
      parts.push(PROMPT_SUFFIXES.noCreativeChanges);
    }

    return parts.join(' ');
  }

  /**
   * Build a simple prompt with base + suffix (no enhancement)
   */
  buildSimple(
    basePrompt: string,
    suffixes: {
      enhanceFaces?: boolean;
      preserveText?: boolean;
    } = {}
  ): string {
    const parts: string[] = [basePrompt];

    if (suffixes.enhanceFaces) {
      parts.push(PROMPT_SUFFIXES.enhanceFaces);
    }

    if (suffixes.preserveText) {
      parts.push(PROMPT_SUFFIXES.preserveText);
    }

    return parts.join('. ') + (parts.length > 1 ? '.' : '');
  }
}

/**
 * Singleton instance for convenience
 */
export const promptBuilder = new PromptBuilder();

/**
 * Convenience function to build a prompt
 */
export function buildPrompt(
  modelId: string,
  context: IPromptBuildContext,
  options?: { basePrompt?: string; includeNoCreativeChanges?: boolean }
): string {
  return promptBuilder.build(modelId, context, options);
}
