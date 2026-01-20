/**
 * Model Registry Types
 * Types and interfaces for the multi-model architecture system
 */

export type ModelCapability =
  | 'upscale'
  | 'enhance'
  | 'text-preservation'
  | 'face-restoration'
  | 'denoise'
  | 'damage-repair'
  | '4k-output'
  | '8k-output';

export type ContentType =
  | 'photo' // General photography
  | 'portrait' // Face-focused images
  | 'product' // E-commerce product images
  | 'document' // Text-heavy documents
  | 'vintage' // Old/damaged photos
  | 'unknown';

export type ModelProvider = 'replicate' | 'gemini';

export type SubscriptionTier = 'free' | 'hobby' | 'pro' | 'business';

export type ModelId =
  | 'real-esrgan'
  | 'gfpgan'
  | 'nano-banana'
  | 'nano-banana-pro'
  | 'clarity-upscaler'
  | 'qwen-image-edit'
  | 'seedream'
  | 'realesrgan-anime';

/**
 * Model configuration interface as defined in the PRD
 */
export interface IModelConfig {
  /** Unique identifier */
  id: string;
  /** User-facing name */
  displayName: string;
  /** Provider (replicate) */
  provider: ModelProvider;
  /** Provider-specific model ID */
  modelVersion: string;
  /** Model capabilities */
  capabilities: ModelCapability[];
  /** USD cost per API call */
  costPerRun: number;
  /** Base credit cost multiplier */
  creditMultiplier: number;
  /** 1-10 quality rating */
  qualityScore: number;
  /** Average processing time in milliseconds */
  processingTimeMs: number;
  /** Max input pixels */
  maxInputResolution: number;
  /** Max output pixels */
  maxOutputResolution: number;
  /** Supported scale factors [2, 4, 8] */
  supportedScales: number[];
  /** Model enabled/disabled */
  isEnabled: boolean;
  /** Minimum tier required */
  tierRestriction?: SubscriptionTier;
}

/**
 * Image analysis results for auto model selection
 */
export interface IImageAnalysis {
  /** 0-1: 0=pristine, 1=heavily damaged */
  damageLevel: number;
  /** Number of detected faces */
  faceCount: number;
  /** 0-1: Compression artifacts/noise */
  noiseLevel: number;
  /** Type of content */
  contentType: ContentType;
  /** Image resolution info */
  resolution: {
    width: number;
    height: number;
    megapixels: number;
  };
}

/**
 * Model recommendation for auto mode
 */
export interface IModelRecommendation {
  /** Recommended model ID */
  recommendedModel: string;
  /** Explanation for recommendation */
  reasoning: string;
  /** Credit cost for recommended model */
  creditCost: number;
  /** Alternative models */
  alternatives: string[];
  /** Confidence in recommendation (0-1) */
  confidence: number;
}

/**
 * Model selection criteria
 */
export interface IModelSelectionCriteria {
  /** User's subscription tier */
  userTier: SubscriptionTier;
  /** Processing mode */
  mode: 'upscale' | 'enhance' | 'both' | 'custom';
  /** Scale factor */
  scale: 2 | 4 | 8;
  /** Required capabilities */
  requiredCapabilities: ModelCapability[];
  /** User preferences */
  preferences: {
    /** Enhance faces */
    enhanceFaces: boolean;
    /** Reduce noise */
    denoise: boolean;
    /** Maximum quality vs speed */
    prioritizeQuality: boolean;
  };
  /** Available credits */
  availableCredits: number;
}

/**
 * Model execution result
 */
export interface IModelExecutionResult {
  /** Model that was used */
  modelId: string;
  /** Provider that handled it */
  provider: ModelProvider;
  /** Whether fallback was used */
  usedFallback: boolean;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Credits consumed */
  creditsConsumed: number;
  /** Cost in USD */
  actualCost: number;
}
