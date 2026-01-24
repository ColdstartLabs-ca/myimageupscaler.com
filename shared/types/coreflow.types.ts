export enum ProcessingStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export enum ProcessingStage {
  PREPARING = 'preparing', // File encoding, validation
  ANALYZING = 'analyzing', // Image analysis (auto mode)
  ENHANCING = 'enhancing', // Main AI processing
  FINALIZING = 'finalizing', // Response handling
}

export type QualityTier =
  | 'auto'
  | 'quick'
  | 'face-restore'
  | 'fast-edit'
  | 'budget-edit'
  | 'seedream-edit'
  | 'anime-upscale'
  | 'hd-upscale'
  | 'face-pro'
  | 'ultra';

// Quality tier metadata for UI display
export const QUALITY_TIER_CONFIG: Record<
  QualityTier,
  {
    label: string;
    credits: number | 'variable';
    modelId: ModelId | null; // null for 'auto' - determined by AI
    description: string;
    bestFor: string;
    smartAnalysisAlwaysOn: boolean; // True for 'auto' tier
  }
> = {
  auto: {
    label: 'Auto',
    credits: 'variable',
    modelId: null,
    description: 'AI picks the best option',
    bestFor: 'Optimal results without choosing',
    smartAnalysisAlwaysOn: true,
  },
  quick: {
    label: 'Quick',
    credits: 1,
    modelId: 'real-esrgan',
    description: 'Fast general upscale',
    bestFor: 'Social media, previews',
    smartAnalysisAlwaysOn: false,
  },
  'face-restore': {
    label: 'Face Restore',
    credits: 2,
    modelId: 'gfpgan',
    description: 'Restore faces in old/damaged photos',
    bestFor: 'Old photos, AI-generated faces',
    smartAnalysisAlwaysOn: false,
  },
  'fast-edit': {
    label: 'Fast Edit',
    credits: 2,
    modelId: 'p-image-edit',
    description: 'Sub-second AI image editing',
    bestFor: 'Quick edits, fast turnaround',
    smartAnalysisAlwaysOn: false,
  },
  'budget-edit': {
    label: 'Budget Edit',
    credits: 3,
    modelId: 'qwen-image-edit',
    description: 'AI-powered image editing',
    bestFor: 'General enhancement, budget-friendly',
    smartAnalysisAlwaysOn: false,
  },
  'seedream-edit': {
    label: 'Seedream Edit',
    credits: 4,
    modelId: 'seedream',
    description: 'Advanced AI image editing',
    bestFor: 'Complex edits, high quality output',
    smartAnalysisAlwaysOn: false,
  },
  'anime-upscale': {
    label: 'Anime Upscale',
    credits: 1,
    modelId: 'realesrgan-anime',
    description: 'Upscale anime and illustrations',
    bestFor: 'Anime art, manga, illustrations',
    smartAnalysisAlwaysOn: false,
  },
  'hd-upscale': {
    label: 'HD Upscale',
    credits: 4,
    modelId: 'clarity-upscaler',
    description: 'High detail preservation',
    bestFor: 'Textures, print-ready images',
    smartAnalysisAlwaysOn: false,
  },
  'face-pro': {
    label: 'Face Pro',
    credits: 6,
    modelId: 'flux-2-pro',
    description: 'Premium face enhancement',
    bestFor: 'Professional portraits',
    smartAnalysisAlwaysOn: false,
  },
  ultra: {
    label: 'Ultra',
    credits: 8,
    modelId: 'nano-banana-pro',
    description: 'Maximum quality, 4K/8K output',
    bestFor: 'Large prints, archival',
    smartAnalysisAlwaysOn: false,
  },
};

// Convenience accessors (backward compat)
export const QUALITY_TIER_MODEL_MAP: Record<QualityTier, ModelId | null> = Object.fromEntries(
  Object.entries(QUALITY_TIER_CONFIG).map(([k, v]) => [k, v.modelId])
) as Record<QualityTier, ModelId | null>;

export const QUALITY_TIER_CREDITS: Record<QualityTier, number | 'variable'> = Object.fromEntries(
  Object.entries(QUALITY_TIER_CONFIG).map(([k, v]) => [k, v.credits])
) as Record<QualityTier, number | 'variable'>;

// Available scales per quality tier (based on actual model support)
export const QUALITY_TIER_SCALES: Record<QualityTier, (2 | 4 | 8)[]> = {
  auto: [2, 4, 8], // Auto can select any model
  quick: [2, 4], // real-esrgan only supports 2x and 4x
  'face-restore': [2, 4], // gfpgan only supports 2x and 4x
  'fast-edit': [], // p-image-edit is enhancement-only (no upscale)
  'budget-edit': [], // qwen-image-edit is enhancement-only (no upscale)
  'seedream-edit': [], // seedream is enhancement-only (no upscale)
  'anime-upscale': [2, 4], // realesrgan-anime supports 2x and 4x
  'hd-upscale': [2, 4, 8], // clarity-upscaler supports up to 16x natively
  'face-pro': [], // flux-2-pro is enhancement-only (no upscale)
  ultra: [2, 4], // nano-banana-pro is resolution-based (1K/2K/4K), not true 8x scale
};

// Additional options (replaces mode + toggles)
export interface IAdditionalOptions {
  smartAnalysis: boolean; // AI suggests enhancements (hidden when tier='auto')
  enhance: boolean; // Enable enhancement processing (expands sub-options)
  enhanceFaces: boolean; // Face restoration - user opt-in
  preserveText: boolean; // Text preservation - user opt-in
  customInstructions?: string; // Custom LLM prompt (opens modal when enabled)
  enhancement?: IEnhancementSettings; // Detailed enhancement settings
}

// Enhancement aspects - fine-tuned options for what to enhance
export type EnhancementAspect =
  | 'clarity' // Sharpen edges and improve overall clarity
  | 'color' // Color correction and saturation balance
  | 'lighting' // Exposure and lighting adjustments
  | 'denoise' // Remove sensor noise and grain
  | 'artifacts' // Remove JPEG compression artifacts
  | 'details'; // Enhance fine details and textures

export interface IEnhancementSettings {
  clarity: boolean;
  color: boolean;
  lighting: boolean;
  denoise: boolean;
  artifacts: boolean;
  details: boolean;
}

// Default enhancement settings - most common use case
export const DEFAULT_ENHANCEMENT_SETTINGS: IEnhancementSettings = {
  clarity: true,
  color: true,
  lighting: false,
  denoise: true,
  artifacts: true,
  details: false,
};

// Default additional options for new UI
export const DEFAULT_ADDITIONAL_OPTIONS: IAdditionalOptions = {
  smartAnalysis: false,
  enhance: true,
  enhanceFaces: false,
  preserveText: false,
  customInstructions: undefined,
  enhancement: DEFAULT_ENHANCEMENT_SETTINGS,
};

// Multi-Model Architecture Types

export type SubscriptionTier = 'free' | 'hobby' | 'pro' | 'business';

export type ModelId =
  | 'real-esrgan'
  | 'gfpgan'
  | 'nano-banana'
  | 'nano-banana-pro'
  | 'clarity-upscaler'
  | 'flux-2-pro'
  | 'qwen-image-edit'
  | 'seedream'
  | 'realesrgan-anime'
  | 'p-image-edit'
  | 'flux-kontext-fast';

export type ModelCapability =
  | 'upscale'
  | 'enhance'
  | 'text-preservation'
  | 'face-restoration'
  | 'denoise'
  | 'damage-repair'
  | '4k-output'
  | '8k-output';

export type ContentType = 'photo' | 'portrait' | 'product' | 'document' | 'vintage' | 'unknown';

export interface IModelConfig {
  id: string;
  displayName: string;
  provider: 'replicate' | 'gemini';
  modelVersion: string;
  capabilities: ModelCapability[];
  costPerRun: number;
  creditMultiplier: number;
  qualityScore: number;
  processingTimeMs: number;
  maxInputResolution: number;
  maxOutputResolution: number;
  supportedScales: number[];
  isEnabled: boolean;
  tierRestriction?: SubscriptionTier;
}

export interface IImageAnalysis {
  damageLevel: number;
  faceCount: number;
  textCoverage: number;
  noiseLevel: number;
  contentType: ContentType;
  resolution: {
    width: number;
    height: number;
    megapixels: number;
  };
}

export interface IModelRecommendation {
  recommendedModel: string;
  reasoning: string;
  creditCost: number;
  alternatives: string[];
}

// Nano Banana Pro specific configuration (Upscale Ultra)
export type NanoBananaProAspectRatio =
  | 'match_input_image'
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';

export type NanoBananaProResolution = '1K' | '2K' | '4K';
export type NanoBananaProOutputFormat = 'jpg' | 'png';
export type NanoBananaProSafetyLevel =
  | 'block_low_and_above'
  | 'block_medium_and_above'
  | 'block_only_high';

export interface INanoBananaProConfig {
  aspectRatio: NanoBananaProAspectRatio;
  resolution: NanoBananaProResolution;
  outputFormat: NanoBananaProOutputFormat;
  safetyFilterLevel: NanoBananaProSafetyLevel;
}

export const DEFAULT_NANO_BANANA_PRO_CONFIG: INanoBananaProConfig = {
  aspectRatio: 'match_input_image',
  resolution: '2K',
  outputFormat: 'png',
  safetyFilterLevel: 'block_only_high',
};

export interface IUpscaleConfig {
  qualityTier: QualityTier;
  scale: 2 | 4 | 8;
  additionalOptions: IAdditionalOptions;
  // Studio tier specific (only for 'studio' tier)
  nanoBananaProConfig?: INanoBananaProConfig;
}

export interface IBatchItem {
  id: string;
  file: File;
  previewUrl: string;
  processedUrl: string | null;
  status: ProcessingStatus;
  progress: number;
  stage?: ProcessingStage; // NEW
  error?: string;
}

export interface IProcessedImage {
  originalUrl: string;
  processedUrl: string | null;
  originalSize: number; // bytes
  processedSize?: number; // bytes
  width: number;
  height: number;
  status: ProcessingStatus;
  progress: number;
  error?: string;
}

export interface IPricingTier {
  name: string;
  price: string;
  credits: number;
  features: string[];
  recommended?: boolean;
}

// Additional multi-model types for UI components

export interface IProcessingOptions {
  selectedModel: 'auto' | ModelId;
  scale: 2 | 4 | 8;
  preserveText: boolean;
  enhanceFaces: boolean;
  denoise: boolean;
  targetResolution?: '2k' | '4k' | '8k';
}

export interface IModelInfo {
  id: ModelId | 'auto';
  displayName: string;
  description: string;
  creditCost: number;
  capabilities: ModelCapability[];
  qualityScore: number;
  processingTime: string;
  available: boolean;
  requiresTier?: SubscriptionTier;
  badge?: string;
  icon?: string;
}

export interface ICreditEstimate {
  breakdown: {
    baseCredits: number;
    featureCredits: {
      preserveText?: number;
      enhanceFaces?: number;
      denoise?: number;
    };
    scaleMultiplier: number;
    totalCredits: number;
  };
  modelToBe: string;
  estimatedProcessingTime: string;
}

export interface IModelApiResponse {
  models: IModelInfo[];
  defaultModel: string;
}

export interface IAnalyzeImageResponse {
  analysis: IImageAnalysis;
  recommendation: IModelRecommendation;
}

// Dimension information for upscaling results
export interface IDimensionsInfo {
  input: { width: number; height: number };
  output: { width: number; height: number };
  actualScale: number; // Computed: output / input
}

export interface IUpscaleResponse {
  success: boolean;
  imageData?: string; // Legacy base64 data URL (deprecated for Workers)
  imageUrl?: string; // Direct URL to result image (Cloudflare Workers optimized)
  expiresAt?: number; // Timestamp when imageUrl expires
  mimeType: string;
  processing: {
    modelUsed: string;
    modelDisplayName: string;
    processingTimeMs: number;
    creditsUsed: number;
    creditsRemaining: number;
  };
  // New field for Auto tier to show what was actually used
  usedTier?: QualityTier;
  analysis?: {
    damageLevel?: number;
    contentType?: string;
    modelRecommendation?: string;
  };
  // Dimension reporting for verification
  dimensions?: IDimensionsInfo;
}
