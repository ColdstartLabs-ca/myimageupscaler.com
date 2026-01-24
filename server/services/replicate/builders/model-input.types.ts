import type { IUpscaleInput } from '@shared/validation/upscale.schema';
import { decodeImageDimensions } from '@shared/validation/upscale.schema';
import type { INanoBananaProConfig, IEnhancementSettings } from '@shared/types/coreflow.types';
import { DEFAULT_ENHANCEMENT_SETTINGS } from '@shared/types/coreflow.types';

/**
 * Default enhancement settings for when none are provided
 */
const DEFAULT_ENHANCEMENT = DEFAULT_ENHANCEMENT_SETTINGS;

/**
 * Context for building model inputs
 */
export interface IModelInputContext {
  imageDataUrl: string;
  scale: number;
  enhance: boolean;
  enhanceFaces: boolean;
  preserveText: boolean;
  enhancementSettings: IEnhancementSettings;
  customPrompt?: string;
  nanoBananaProConfig?: INanoBananaProConfig;
  /** Original image width in pixels (decoded from image data) */
  originalWidth?: number;
  /** Original image height in pixels (decoded from image data) */
  originalHeight?: number;
}

/**
 * Base interface for model input builders
 */
export interface IModelInputBuilder<T = unknown> {
  /**
   * The model ID this builder handles
   */
  readonly modelId: string;

  /**
   * Build the input for this model
   *
   * @param context - The build context
   * @returns The model-specific input
   */
  build(context: IModelInputContext): T;
}

/**
 * Model input type union
 */
export type IModelInput =
  | IRealEsrganInput
  | IGfpganInput
  | IClarityUpscalerInput
  | IFluxKontextInput
  | IFlux2ProInput
  | INanoBananaProInput
  | IQwenImageEditInput
  | ISeedreamInput
  | IRealEsrganAnimeInput
  | IPImageEditInput
  | IFluxKontextFastInput;

/**
 * Real-ESRGAN input
 */
export interface IRealEsrganInput {
  image: string;
  scale: 2 | 4;
  face_enhance: boolean;
}

/**
 * GFPGAN input
 */
export interface IGfpganInput {
  img: string;
  scale: 2 | 4;
  version: 'v1.2' | 'v1.3' | 'v1.4' | 'RestoreFormer';
}

/**
 * Clarity Upscaler input
 */
export interface IClarityUpscalerInput {
  image: string;
  prompt: string;
  scale_factor: number;
  output_format: string;
}

/**
 * Flux Kontext Pro input
 */
export interface IFluxKontextInput {
  prompt: string;
  input_image: string;
  aspect_ratio: string;
  output_format: string;
}

/**
 * Flux-2-Pro input
 */
export interface IFlux2ProInput {
  prompt: string;
  input_images: string[];
  aspect_ratio: string;
  output_format: string;
  safety_tolerance: number;
  prompt_upsampling: boolean;
}

/**
 * Nano Banana Pro input
 */
export interface INanoBananaProInput {
  prompt: string;
  image_input: string[];
  aspect_ratio: string;
  resolution: '1K' | '2K' | '4K';
  output_format: string;
  safety_filter_level: string;
}

/**
 * Qwen Image Edit input
 */
export interface IQwenImageEditInput {
  prompt: string;
  image: string[];
  aspect_ratio: string;
  output_format: string;
  output_quality: number;
  go_fast: boolean;
}

/**
 * Seedream input
 *
 * API supports:
 * - size: '2K' (2048px), '4K' (4096px), or 'custom' for specific dimensions
 * - width/height: Only used when size='custom' (range: 1024-4096px)
 * - aspect_ratio: 'match_input_image' preserves original proportions
 */
export interface ISeedreamInput {
  prompt: string;
  image_input: string[];
  size: '2K' | '4K' | 'custom';
  aspect_ratio?: string;
  width?: number;
  height?: number;
}

/**
 * Real-ESRGAN Anime input
 */
export interface IRealEsrganAnimeInput {
  img: string;
  scale: 2 | 4;
  version: string;
  face_enhance: boolean;
}

/**
 * P-Image-Edit input
 */
export interface IPImageEditInput {
  prompt: string;
  images: string[];
  aspect_ratio: string;
  turbo: boolean;
}

/**
 * Flux-Kontext-Fast input
 * Ultra fast flux kontext endpoint for image editing
 * Based on Replicate API schema for prunaai/flux-kontext-fast
 */
export interface IFluxKontextFastInput {
  prompt: string;
  img_cond_path: string;
  guidance?: number;
  speed_mode?: string;
  image_size?: number;
  aspect_ratio?: string;
  output_format?: string;
  output_quality?: number;
  num_inference_steps?: number;
}

/**
 * Create model input context from upscale input
 */
export function createModelInputContext(input: IUpscaleInput): IModelInputContext {
  const { imageData, mimeType, config } = input;
  const { scale, additionalOptions, nanoBananaProConfig } = config;
  const { enhance, enhanceFaces, preserveText, enhancement, customInstructions } =
    additionalOptions;

  // Ensure image is a data URL
  let imageDataUrl = imageData;
  if (!imageData.startsWith('data:')) {
    imageDataUrl = `data:${mimeType || 'image/jpeg'};base64,${imageData}`;
  }

  // Decode original image dimensions for models that need them
  const dimensions = decodeImageDimensions(imageDataUrl);

  return {
    imageDataUrl,
    scale,
    enhance: enhance ?? false,
    enhanceFaces: enhanceFaces ?? false,
    preserveText: preserveText ?? false,
    enhancementSettings: enhancement ?? DEFAULT_ENHANCEMENT,
    customPrompt: customInstructions,
    nanoBananaProConfig,
    originalWidth: dimensions?.width,
    originalHeight: dimensions?.height,
  };
}
