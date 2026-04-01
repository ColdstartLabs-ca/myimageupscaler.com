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
  | 'budget-old-photo'
  | 'seedream-edit'
  | 'anime-upscale'
  | 'hd-upscale'
  | 'face-pro'
  | 'ultra'
  | 'bg-removal'
  | 'lighting-fix'
  | 'resume-photo'
  | 'photo-repair';

// Preview images for model gallery (before/after comparison)
export interface IPreviewImages {
  before: string;
  after: string;
  objectPosition?: string; // CSS object-position for crop focus (e.g., 'top', 'center 30%')
  displayMode?: 'slider' | 'flip' | 'static'; // 'slider' (default): drag comparison; 'flip': show after, reveal before on hover; 'static': single image, no interaction
}

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
    useCases: string[]; // Searchable tags for model gallery filtering
    previewImages: IPreviewImages | null; // Before/after thumbnails for gallery
    customPrompt?: string; // Optional tier-specific prompt (overrides model default, but user customInstructions still win)
    genericPromptOverride?: boolean; // When true, customPrompt replaces the entire prompt (no generic modifiers appended). When false/unset, customPrompt is used as base and merged with generic modifiers.
    badge?: 'popular' | 'recommended' | null; // Optional badge displayed on model card (top-right corner)
    popularity?: number; // 1-100 for sorting within sections, higher = more popular
  }
> = {
  auto: {
    label: 'Auto',
    credits: 'variable',
    modelId: null,
    description: 'AI picks the best option',
    bestFor: 'Optimal results without choosing',
    smartAnalysisAlwaysOn: true,
    useCases: ['smart', 'automatic', 'ai pick', 'easy', 'beginner'],
    previewImages: {
      before: '/before-after/auto/preview.webp',
      after: '/before-after/auto/preview.webp',
      displayMode: 'static',
    },
    popularity: 50,
  },
  quick: {
    label: 'Light Blur Fix',
    credits: 1,
    modelId: 'real-esrgan',
    description: 'Sharpen slightly blurry images',
    bestFor: 'Low-res screenshots, light blur',
    smartAnalysisAlwaysOn: false,
    useCases: ['social media', 'web', 'fast', 'general', 'preview'],
    previewImages: {
      before: '/before-after/quick/before.webp',
      after: '/before-after/quick/after.webp',
    },
    badge: 'popular',
    popularity: 90,
  },
  'budget-edit': {
    label: 'Standard Enhance',
    credits: 3,
    modelId: 'qwen-image-edit',
    description: 'Balanced quality AI enhancement',
    bestFor: 'General enhancement, good results',
    smartAnalysisAlwaysOn: false,
    useCases: ['general enhancement', 'versatile', 'all-purpose', 'balanced'],
    previewImages: {
      before: '/before-after/budget-edit/before.webp',
      after: '/before-after/budget-edit/after.webp',
      objectPosition: 'center 20%',
    },
    popularity: 70,
  },
  'face-pro': {
    label: 'Portrait Pro',
    credits: 6,
    modelId: 'flux-2-pro',
    description: 'Premium portrait enhancement',
    bestFor: 'Professional headshots, skin detail',
    smartAnalysisAlwaysOn: false,
    useCases: ['portrait', 'headshot', 'professional', 'face', 'skin'],
    previewImages: {
      before: '/before-after/face-pro/before.webp',
      after: '/before-after/face-pro/after.webp',
      objectPosition: 'center 25%',
    },
    popularity: 50,
  },
  'seedream-edit': {
    label: 'Creative Edit',
    credits: 4,
    modelId: 'seedream',
    description: 'High-quality AI-powered editing',
    bestFor: 'Complex edits, creative rework',
    smartAnalysisAlwaysOn: false,
    useCases: ['complex edit', 'advanced', 'high quality', 'creative'],
    previewImages: {
      before: '/before-after/seedream-edit/before.webp',
      after: '/before-after/seedream-edit/after.webp',
    },
    popularity: 50,
  },
  'face-restore': {
    label: 'Face Restore',
    credits: 2,
    modelId: 'gfpgan',
    description: 'Fix faces in old or damaged photos',
    bestFor: 'Old photos, AI-generated faces',
    smartAnalysisAlwaysOn: false,
    useCases: ['old photos', 'damaged', 'damaged photos', 'faces', 'restoration', 'vintage'],
    previewImages: {
      before: '/before-after/face-restore/before.webp',
      after: '/before-after/face-restore/after.webp',
    },
    badge: 'recommended',
    popularity: 80,
  },
  'fast-edit': {
    label: 'Quick Enhance',
    credits: 2,
    modelId: 'p-image-edit',
    description: 'Fast general-purpose enhancement',
    bestFor: 'Simple touch-ups, quick fixes',
    smartAnalysisAlwaysOn: false,
    useCases: ['quick edit', 'fast', 'simple', 'touch up'],
    previewImages: {
      before: '/before-after/fast-edit/before.webp',
      after: '/before-after/fast-edit/after.webp',
    },
    popularity: 50,
  },
  'budget-old-photo': {
    label: 'Old Photo Fix',
    credits: 2,
    modelId: 'p-image-edit',
    description: 'Restore old or damaged photos',
    bestFor: 'Faded photos, minor damage, vintage pics',
    smartAnalysisAlwaysOn: false,
    useCases: ['old photo', 'damaged', 'damaged photos', 'vintage', 'faded', 'scratched'],
    previewImages: {
      before: '/before-after/budget-old-photo/before.webp',
      after: '/before-after/budget-old-photo/after.webp',
    },
    popularity: 50,
    customPrompt:
      'Restore this old or damaged photo. Fix fading, color degradation, and minor scratches or blemishes. Recover natural skin tones and colors while preserving the original composition and character of the photograph.',
    genericPromptOverride: true,
  },
  'anime-upscale': {
    label: 'Anime Upscale',
    credits: 1,
    modelId: 'realesrgan-anime',
    description: 'Upscale anime and illustrations',
    bestFor: 'Anime art, manga, illustrations',
    smartAnalysisAlwaysOn: false,
    useCases: ['anime', 'manga', 'illustration', 'art', 'cartoon'],
    previewImages: {
      before: '/before-after/anime-upscale/before.webp',
      after: '/before-after/anime-upscale/after.webp',
    },
    popularity: 50,
  },
  'hd-upscale': {
    label: 'HD Upscale',
    credits: 4,
    modelId: 'clarity-upscaler',
    description: 'High detail preservation',
    bestFor: 'Textures, print-ready images',
    smartAnalysisAlwaysOn: false,
    useCases: ['print', 'textures', 'high detail', 'professional', '4k'],
    previewImages: {
      before: '/before-after/hd-upscale/before.webp',
      after: '/before-after/hd-upscale/after.webp',
    },
    badge: 'popular',
    popularity: 75,
  },
  ultra: {
    label: 'Ultra Upscale',
    credits: 8,
    modelId: 'nano-banana-pro',
    description: 'Maximum quality 4K output',
    bestFor: 'Large prints, archival, posters',
    smartAnalysisAlwaysOn: false,
    useCases: ['8k', 'large print', 'archival', 'maximum quality', 'poster'],
    previewImages: {
      before: '/before-after/ultra/before.webp',
      after: '/before-after/ultra/after.webp',
    },
    popularity: 50,
  },
  'bg-removal': {
    label: 'Background Removal',
    credits: 1,
    modelId: null,
    description: 'Remove image backgrounds',
    bestFor: 'Product photos, profile pics',
    smartAnalysisAlwaysOn: false,
    useCases: ['product photo', 'profile picture', 'transparent', 'e-commerce', 'cutout'],
    previewImages: {
      before: '/before-after/bg-removal/before.webp',
      after: '/before-after/bg-removal/after.webp',
    },
    popularity: 50,
  },
  'lighting-fix': {
    label: 'Lighting Fix',
    credits: 4,
    modelId: 'seedream',
    description: 'Correct lighting and exposure',
    bestFor: 'Underexposed, overexposed, harsh shadows',
    smartAnalysisAlwaysOn: false,
    useCases: ['lighting', 'exposure', 'shadows', 'brightness', 'dark photo'],
    previewImages: {
      before: '/before-after/lighting-fix/before.webp',
      after: '/before-after/lighting-fix/after.webp',
    },
    popularity: 50,
    customPrompt:
      'Fix the lighting in this image. Correct underexposure or overexposure, balance shadows and highlights, and normalize the overall luminance so the subject is clearly visible. Preserve the original colors and composition exactly — only adjust lighting, exposure and artifacts.',
    genericPromptOverride: true,
  },
  'resume-photo': {
    label: 'Resume Photo',
    credits: 4,
    modelId: 'seedream',
    description: 'Professional headshot for resumes',
    bestFor: 'LinkedIn, resumes, corporate bios',
    smartAnalysisAlwaysOn: false,
    useCases: ['resume', 'headshot', 'linkedin', 'professional photo', 'corporate'],
    previewImages: {
      before: '/before-after/resume-photo/before.webp',
      after: '/before-after/resume-photo/after.webp',
      displayMode: 'flip',
    },
    popularity: 50,
    customPrompt:
      'Transform this photo into a professional corporate headshot suitable for a resume or LinkedIn profile. Replace clothes with a suite. Remove any background and place the subject against a solid white background. Ensure even, flattering lighting on the face. Smooth minor skin blemishes while keeping the person looking natural and recognizable. Maintain a sharp focus on the face and upper body. The result should look like a studio-quality professional portrait.',
    genericPromptOverride: true,
  },
  'photo-repair': {
    label: 'Photo Repair',
    credits: 4,
    modelId: 'qwen-image-edit',
    description: 'Repair physically damaged photos',
    bestFor: 'Torn, scratched, or missing pieces',
    smartAnalysisAlwaysOn: false,
    useCases: [
      'damaged photos',
      'torn photo',
      'missing pieces',
      'water damage',
      'physical damage',
      'repair',
    ],
    previewImages: {
      before: '/before-after/photo-repair/before.webp',
      after: '/before-after/photo-repair/after.webp',
    },
    popularity: 50,
    customPrompt:
      'Repair this physically damaged photograph. Preserve original structure and dimensions. Reconstruct any torn, missing, or destroyed areas by intelligently filling in the gaps based on surrounding context. Remove scratches, cracks, water stains, and other physical damage marks. Restore the image to look as if it was never damaged. Preserve the original content, colors, and composition exactly — only repair the physical damage.',
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
  'budget-old-photo': [], // p-image-edit is enhancement-only (no upscale)
  'seedream-edit': [], // seedream is enhancement-only (no upscale)
  'anime-upscale': [2, 4], // realesrgan-anime supports 2x and 4x
  'hd-upscale': [2, 4], // clarity-upscaler capped at 4x (8x costs $0.23+ — 3 chained A100 passes)
  'face-pro': [], // flux-2-pro is enhancement-only (no upscale)
  ultra: [2, 4], // nano-banana-pro is resolution-based (1K/2K/4K), not true 8x scale
  'bg-removal': [], // bg-removal is not an upscale operation (no scale)
  'lighting-fix': [], // seedream is enhancement-only (no upscale)
  'resume-photo': [], // seedream is enhancement-only (no upscale)
  'photo-repair': [], // seedream is enhancement-only (no upscale)
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
