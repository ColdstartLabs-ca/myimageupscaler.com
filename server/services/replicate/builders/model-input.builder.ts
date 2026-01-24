import type { IModelInputBuilder } from './model-input.types';
import type { IModelInput } from './model-input.types';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';
import { createModelInputContext } from './model-input.types';
import {
  RealEsrganBuilder,
  GfpganBuilder,
  ClarityUpscalerBuilder,
  FluxKontextBuilder,
  Flux2ProBuilder,
  NanoBananaProBuilder,
  QwenImageEditBuilder,
  SeedreamBuilder,
  RealEsrganAnimeBuilder,
  PImageEditBuilder,
  FluxKontextFastBuilder,
} from './models';

/**
 * Model Input Builder Orchestrator
 *
 * Manages all model-specific input builders and provides
 * a unified interface for building model inputs.
 */
export class ModelInputBuilderOrchestrator {
  private builders: Map<string, IModelInputBuilder<IModelInput>>;

  constructor() {
    this.builders = new Map<string, IModelInputBuilder<IModelInput>>();
    this.registerDefaultBuilders();
  }

  /**
   * Register default model builders
   */
  private registerDefaultBuilders(): void {
    this.register(new RealEsrganBuilder());
    this.register(new GfpganBuilder());
    this.register(new ClarityUpscalerBuilder());
    this.register(new FluxKontextBuilder());
    this.register(new Flux2ProBuilder());
    this.register(new NanoBananaProBuilder());
    this.register(new QwenImageEditBuilder());
    this.register(new SeedreamBuilder());
    this.register(new RealEsrganAnimeBuilder());
    this.register(new PImageEditBuilder());
    this.register(new FluxKontextFastBuilder());
  }

  /**
   * Register a custom model builder
   */
  register(builder: IModelInputBuilder<IModelInput>): void {
    this.builders.set(builder.modelId, builder);
  }

  /**
   * Build input for a specific model
   *
   * @param modelId - The model ID
   * @param input - The upscale input
   * @returns The model-specific input
   */
  build(modelId: string, input: IUpscaleInput): IModelInput {
    const builder = this.builders.get(modelId);

    if (!builder) {
      throw new Error(`No builder registered for model: ${modelId}`);
    }

    const context = createModelInputContext(input);
    return builder.build(context);
  }

  /**
   * Get builder for a model
   */
  getBuilder(modelId: string): IModelInputBuilder<IModelInput> | undefined {
    return this.builders.get(modelId);
  }

  /**
   * Check if a model has a registered builder
   */
  hasBuilder(modelId: string): boolean {
    return this.builders.has(modelId);
  }

  /**
   * Get all registered model IDs
   */
  getModelIds(): string[] {
    return Array.from(this.builders.keys());
  }
}

/**
 * Singleton instance for convenience
 */
export const modelInputBuilderOrchestrator = new ModelInputBuilderOrchestrator();

/**
 * Convenience function to build model input
 */
export function buildModelInput(modelId: string, input: IUpscaleInput): IModelInput {
  return modelInputBuilderOrchestrator.build(modelId, input);
}
