/**
 * AI Model costs configuration
 * Centralized constants for all model cost-related magic numbers (in USD)
 */

export const MODEL_COSTS = {
  // Cost per run for each model (USD)
  REAL_ESRGAN_COST: 0.0017,
  GFPGAN_COST: 0.0025,
  NANO_BANANA_COST: 0.0, // Google Gemini free tier (500 req/day)
  CLARITY_UPSCALER_COST: 0.017,
  FLUX_2_PRO_COST: 0.05, // black-forest-labs/flux-2-pro - premium face restoration
  NANO_BANANA_PRO_COST: 0.13,

  // Cost calculation thresholds
  COST_CENT_MULTIPLIER: 100, // Convert dollars to cents
  MIN_COST_THRESHOLD: 0.001, // Minimum cost for tracking

  // Quality scores (used for cost/quality tradeoffs)
  QUALITY_THRESHOLD_BASIC: 7.0,
  QUALITY_THRESHOLD_GOOD: 8.0,
  QUALITY_THRESHOLD_PREMIUM: 9.0,
  QUALITY_THRESHOLD_ULTRA: 9.5,

  // Resolution limits (pixels)
  MAX_INPUT_RESOLUTION: 2048 * 2048,
  MAX_OUTPUT_RESOLUTION: 4096 * 4096,
  MAX_OUTPUT_RESOLUTION_ULTRA: 8192 * 8192,

  // Supported scale factors
  DEFAULT_SCALE: 2,
  MAX_SCALE_STANDARD: 4,
  MAX_SCALE_PREMIUM: 8,

  // Model tier restrictions
  FREE_MODELS: ['real-esrgan'],
  HOBBY_MODELS: ['real-esrgan', 'gfpgan', 'nano-banana'],
  PRO_MODELS: ['real-esrgan', 'gfpgan', 'nano-banana', 'clarity-upscaler'],
  BUSINESS_MODELS: ['real-esrgan', 'gfpgan', 'nano-banana', 'clarity-upscaler', 'nano-banana-pro'],

  // Processing time estimates (ms)
  PROCESSING_TIME_FAST: 2000,
  PROCESSING_TIME_MEDIUM: 5000,
  PROCESSING_TIME_SLOW: 15000,
  PROCESSING_TIME_ULTRA: 30000,

  // Feature detection thresholds
  DAMAGE_THRESHOLD_HIGH: 0.7,
  DAMAGE_THRESHOLD_MEDIUM: 0.4,
  TEXT_THRESHOLD_HIGH: 0.15,
  TEXT_THRESHOLD_LOW: 0.05,
  NOISE_THRESHOLD_HIGH: 0.5,
  NOISE_THRESHOLD_MEDIUM: 0.3,
  FACE_DETECTION_THRESHOLD: 0.8,

  // Credit efficiency calculations
  CREDIT_COST_PER_DOLLAR: 1000, // Approximate credits per dollar of model cost
  EFFICIENCY_FACTOR_REAL_ESRGAN: 1.0,
  EFFICIENCY_FACTOR_GFPGAN: 0.68,
  EFFICIENCY_FACTOR_NANO_BANANA: 0.0, // Free tier
  EFFICIENCY_FACTOR_CLARITY_UPSCALER: 0.24,
  EFFICIENCY_FACTOR_NANO_BANANA_PRO: 0.06,

  // Confidence scores for recommendations
  RECOMMENDATION_CONFIDENCE_HIGH: 0.8,
  RECOMMENDATION_CONFIDENCE_MEDIUM: 0.6,
  RECOMMENDATION_CONFIDENCE_LOW: 0.4,
  RECOMMENDATION_CONFIDENCE_DEFAULT: 0.7,

  // Batch processing limits
  MAX_BATCH_SIZE_FREE: 1,
  MAX_BATCH_SIZE_HOBBY: 4,
  MAX_BATCH_SIZE_PRO: 8,
  MAX_BATCH_SIZE_BUSINESS: 16,

  // Cost optimization
  AUTO_SELECT_THRESHOLD: 0.7, // Confidence threshold for auto-model selection
  BUDGET_FACTOR: 0.1, // Fraction of user credits to consider for model selection
  QUALITY_WEIGHT: 0.6, // Weight for quality in model selection
  SPEED_WEIGHT: 0.4, // Weight for speed in model selection
} as const;

export const MODEL_CONFIG = {
  'real-esrgan': {
    cost: MODEL_COSTS.REAL_ESRGAN_COST,
    multiplier: 1,
    qualityScore: 8.5,
    processingTime: MODEL_COSTS.PROCESSING_TIME_FAST,
    maxInputResolution: MODEL_COSTS.MAX_INPUT_RESOLUTION,
    maxOutputResolution: MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
    supportedScales: [MODEL_COSTS.DEFAULT_SCALE, MODEL_COSTS.MAX_SCALE_STANDARD],
    tierRestriction: null,
  },
  gfpgan: {
    cost: MODEL_COSTS.GFPGAN_COST,
    multiplier: 2,
    qualityScore: 9.0,
    processingTime: MODEL_COSTS.PROCESSING_TIME_MEDIUM,
    maxInputResolution: MODEL_COSTS.MAX_INPUT_RESOLUTION,
    maxOutputResolution: MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
    supportedScales: [MODEL_COSTS.DEFAULT_SCALE, MODEL_COSTS.MAX_SCALE_STANDARD],
    tierRestriction: null,
  },
  'nano-banana': {
    cost: MODEL_COSTS.NANO_BANANA_COST,
    multiplier: 2,
    qualityScore: 8.0,
    processingTime: 3000,
    maxInputResolution: MODEL_COSTS.MAX_INPUT_RESOLUTION,
    maxOutputResolution: MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
    supportedScales: [
      MODEL_COSTS.DEFAULT_SCALE,
      MODEL_COSTS.MAX_SCALE_STANDARD,
      MODEL_COSTS.MAX_SCALE_PREMIUM,
    ],
    tierRestriction: null,
  },
  'clarity-upscaler': {
    cost: MODEL_COSTS.CLARITY_UPSCALER_COST,
    multiplier: 4,
    qualityScore: 9.5,
    processingTime: MODEL_COSTS.PROCESSING_TIME_SLOW,
    maxInputResolution: MODEL_COSTS.MAX_INPUT_RESOLUTION,
    maxOutputResolution: MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
    supportedScales: [
      MODEL_COSTS.DEFAULT_SCALE,
      MODEL_COSTS.MAX_SCALE_STANDARD,
      MODEL_COSTS.MAX_SCALE_PREMIUM,
    ],
    tierRestriction: 'hobby',
  },
  'flux-2-pro': {
    cost: MODEL_COSTS.FLUX_2_PRO_COST,
    multiplier: 6,
    qualityScore: 9.6,
    processingTime: MODEL_COSTS.PROCESSING_TIME_SLOW,
    maxInputResolution: MODEL_COSTS.MAX_INPUT_RESOLUTION,
    maxOutputResolution: MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
    supportedScales: [
      MODEL_COSTS.DEFAULT_SCALE,
      MODEL_COSTS.MAX_SCALE_STANDARD,
      MODEL_COSTS.MAX_SCALE_PREMIUM,
    ],
    tierRestriction: 'hobby',
  },
  'nano-banana-pro': {
    cost: MODEL_COSTS.NANO_BANANA_PRO_COST,
    multiplier: 8,
    qualityScore: 9.8,
    processingTime: MODEL_COSTS.PROCESSING_TIME_ULTRA,
    maxInputResolution: MODEL_COSTS.MAX_INPUT_RESOLUTION,
    maxOutputResolution: MODEL_COSTS.MAX_OUTPUT_RESOLUTION_ULTRA,
    supportedScales: [
      MODEL_COSTS.DEFAULT_SCALE,
      MODEL_COSTS.MAX_SCALE_STANDARD,
      MODEL_COSTS.MAX_SCALE_PREMIUM,
    ],
    tierRestriction: 'hobby',
  },
} as const;

export type ModelCostConfig = typeof MODEL_COSTS;
export type ModelConfig = typeof MODEL_CONFIG;
