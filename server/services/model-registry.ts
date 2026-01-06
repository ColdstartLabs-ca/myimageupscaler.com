import { serverEnv } from '@shared/config/env';
import { CREDIT_COSTS } from '@shared/config/credits.config';
import { TIMEOUTS } from '@shared/config/timeouts.config';
import { MODEL_COSTS as CONFIG_MODEL_COSTS } from '@shared/config/model-costs.config';
import type {
  IModelConfig,
  ModelCapability,
  ContentType,
  SubscriptionTier,
  IModelSelectionCriteria,
  IModelRecommendation,
  ModelProvider,
} from './model-registry.types';

/**
 * Default model versions - used when no override is provided
 *
 * Models:
 * - real-esrgan: Default upscale (fast, reliable)
 * - gfpgan: Face restore / old photos
 * - nano-banana: Text/logo preservation (Google Gemini free tier)
 * - clarity-upscaler: Upscale Plus (higher quality)
 * - nano-banana-pro: Upscale Ultra (premium, heavy damage repair)
 */
const DEFAULT_MODEL_VERSIONS: Record<string, string> = {
  'real-esrgan': 'nightmareai/real-esrgan',
  gfpgan: 'tencentarc/gfpgan:0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c',
  'nano-banana': 'gemini-2.5-flash-image',
  'clarity-upscaler':
    'philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
  'flux-2-pro': 'black-forest-labs/flux-2-pro',
  'nano-banana-pro': 'google/nano-banana-pro',
  'qwen-image-edit': 'qwen/qwen-image-edit-2511',
};

/**
 * Model costs per run (USD) - now using centralized config
 */
const MODEL_COSTS: Record<string, number> = {
  'real-esrgan': CONFIG_MODEL_COSTS.REAL_ESRGAN_COST,
  gfpgan: CONFIG_MODEL_COSTS.GFPGAN_COST,
  'nano-banana': CONFIG_MODEL_COSTS.NANO_BANANA_COST, // Google Gemini free tier (500 req/day)
  'clarity-upscaler': CONFIG_MODEL_COSTS.CLARITY_UPSCALER_COST,
  'flux-2-pro': CONFIG_MODEL_COSTS.FLUX_2_PRO_COST,
  'nano-banana-pro': CONFIG_MODEL_COSTS.NANO_BANANA_PRO_COST,
  'qwen-image-edit': CONFIG_MODEL_COSTS.QWEN_IMAGE_EDIT_COST,
};

/**
 * Model credit multipliers - using centralized config
 */
const MODEL_CREDIT_MULTIPLIERS: Record<string, number> = {
  'real-esrgan': CREDIT_COSTS.REAL_ESRGAN_MULTIPLIER,
  gfpgan: CREDIT_COSTS.GFPGAN_MULTIPLIER,
  'nano-banana': CREDIT_COSTS.NANO_BANANA_MULTIPLIER,
  'clarity-upscaler': CREDIT_COSTS.CLARITY_UPSCALER_MULTIPLIER,
  'flux-2-pro': CREDIT_COSTS.FLUX_2_PRO_MULTIPLIER,
  'nano-banana-pro': CREDIT_COSTS.NANO_BANANA_PRO_MULTIPLIER,
  'qwen-image-edit': CREDIT_COSTS.QWEN_IMAGE_EDIT_MULTIPLIER,
};

/**
 * Model Registry Service
 *
 * Manages model configurations, selection logic, and credit cost calculations
 * for the multi-model architecture system.
 *
 * Features:
 * - Use-case based model assignment via env vars
 * - Feature flags for quick toggles
 * - Tier restriction validation
 * - Credit cost calculation
 * - Model recommendation engine
 */
export class ModelRegistry {
  private static instance: ModelRegistry | null = null;
  private models: Map<string, IModelConfig> = new Map();
  private useCaseAssignments: Record<string, string> = {};

  private constructor() {
    this.loadModelsFromEnvironment();
    this.loadUseCaseAssignments();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ModelRegistry {
    if (!this.instance) {
      this.instance = new ModelRegistry();
    }
    return this.instance;
  }

  /**
   * Get model version - use override if provided, otherwise default
   */
  private getModelVersion(modelId: string): string {
    const overrides: Record<string, string | undefined> = {
      'real-esrgan': serverEnv.MODEL_VERSION_REAL_ESRGAN,
      gfpgan: serverEnv.MODEL_VERSION_GFPGAN,
      'nano-banana': serverEnv.MODEL_VERSION_NANO_BANANA,
      'clarity-upscaler': serverEnv.MODEL_VERSION_CLARITY_UPSCALER,
      'flux-2-pro': serverEnv.MODEL_VERSION_FLUX_2_PRO,
      'nano-banana-pro': serverEnv.MODEL_VERSION_NANO_BANANA_PRO,
      'qwen-image-edit': serverEnv.MODEL_VERSION_QWEN_IMAGE_EDIT,
    };
    return overrides[modelId] || DEFAULT_MODEL_VERSIONS[modelId];
  }

  /**
   * Load model configurations
   * Costs and credits are defined in code constants (rarely change)
   * Versions can be overridden via env vars
   */
  private loadModelsFromEnvironment(): void {
    const modelConfigs: IModelConfig[] = [
      // Real-ESRGAN (Default Upscale)
      {
        id: 'real-esrgan',
        displayName: 'Upscale',
        provider: 'replicate',
        modelVersion: this.getModelVersion('real-esrgan'),
        capabilities: ['upscale', 'denoise'],
        costPerRun: MODEL_COSTS['real-esrgan'],
        creditMultiplier: MODEL_CREDIT_MULTIPLIERS['real-esrgan'],
        qualityScore: 8.5,
        processingTimeMs: TIMEOUTS.REAL_ESRGAN_PROCESSING_TIME,
        maxInputResolution: CONFIG_MODEL_COSTS.MAX_INPUT_RESOLUTION,
        maxOutputResolution: CONFIG_MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
        supportedScales: [CONFIG_MODEL_COSTS.DEFAULT_SCALE, CONFIG_MODEL_COSTS.MAX_SCALE_STANDARD], // Real-ESRGAN only supports 2x and 4x
        isEnabled: true, // Always enabled as fallback
      },
      // GFPGAN (Face Restore / Old Photos)
      {
        id: 'gfpgan',
        displayName: 'Face Restore',
        provider: 'replicate',
        modelVersion: this.getModelVersion('gfpgan'),
        capabilities: ['upscale', 'face-restoration', 'denoise', 'damage-repair'],
        costPerRun: MODEL_COSTS['gfpgan'],
        creditMultiplier: MODEL_CREDIT_MULTIPLIERS['gfpgan'],
        qualityScore: 9.0,
        processingTimeMs: TIMEOUTS.GFPGAN_PROCESSING_TIME,
        maxInputResolution: CONFIG_MODEL_COSTS.MAX_INPUT_RESOLUTION,
        maxOutputResolution: CONFIG_MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
        supportedScales: [CONFIG_MODEL_COSTS.DEFAULT_SCALE, CONFIG_MODEL_COSTS.MAX_SCALE_STANDARD], // GFPGAN max scale is 4
        isEnabled: true,
      },
      // Nano Banana (Text/Logo Preservation)
      {
        id: 'nano-banana',
        displayName: 'Text Preserve',
        provider: 'gemini',
        modelVersion: this.getModelVersion('nano-banana'),
        capabilities: ['upscale', 'text-preservation', 'enhance'],
        costPerRun: MODEL_COSTS['nano-banana'],
        creditMultiplier: MODEL_CREDIT_MULTIPLIERS['nano-banana'],
        qualityScore: 8.0,
        processingTimeMs: TIMEOUTS.NANO_BANANA_PROCESSING_TIME,
        maxInputResolution: CONFIG_MODEL_COSTS.MAX_INPUT_RESOLUTION,
        maxOutputResolution: CONFIG_MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
        supportedScales: [
          CONFIG_MODEL_COSTS.DEFAULT_SCALE,
          CONFIG_MODEL_COSTS.MAX_SCALE_STANDARD,
          CONFIG_MODEL_COSTS.MAX_SCALE_PREMIUM,
        ],
        isEnabled: true,
      },
      // Clarity Upscaler (Standard Face Restoration)
      {
        id: 'clarity-upscaler',
        displayName: 'Face Restore',
        provider: 'replicate',
        modelVersion: this.getModelVersion('clarity-upscaler'),
        capabilities: ['upscale', 'denoise', 'enhance', 'face-restoration'],
        costPerRun: MODEL_COSTS['clarity-upscaler'],
        creditMultiplier: MODEL_CREDIT_MULTIPLIERS['clarity-upscaler'],
        qualityScore: 9.5,
        processingTimeMs: TIMEOUTS.CLARITY_UPSCALER_PROCESSING_TIME,
        maxInputResolution: CONFIG_MODEL_COSTS.MAX_INPUT_RESOLUTION,
        maxOutputResolution: CONFIG_MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
        supportedScales: [
          CONFIG_MODEL_COSTS.DEFAULT_SCALE,
          CONFIG_MODEL_COSTS.MAX_SCALE_STANDARD,
          CONFIG_MODEL_COSTS.MAX_SCALE_PREMIUM,
        ],
        isEnabled: serverEnv.ENABLE_PREMIUM_MODELS,
      },
      // Flux-2-Pro (Premium Face Restoration)
      {
        id: 'flux-2-pro',
        displayName: 'Premium Face Restore',
        provider: 'replicate',
        modelVersion: this.getModelVersion('flux-2-pro'),
        capabilities: ['upscale', 'enhance', 'face-restoration', 'denoise'],
        costPerRun: MODEL_COSTS['flux-2-pro'],
        creditMultiplier: MODEL_CREDIT_MULTIPLIERS['flux-2-pro'],
        qualityScore: 9.6,
        processingTimeMs: TIMEOUTS.CLARITY_UPSCALER_PROCESSING_TIME, // Similar processing time
        maxInputResolution: CONFIG_MODEL_COSTS.MAX_INPUT_RESOLUTION,
        maxOutputResolution: CONFIG_MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
        supportedScales: [
          CONFIG_MODEL_COSTS.DEFAULT_SCALE,
          CONFIG_MODEL_COSTS.MAX_SCALE_STANDARD,
          CONFIG_MODEL_COSTS.MAX_SCALE_PREMIUM,
        ],
        isEnabled: serverEnv.ENABLE_PREMIUM_MODELS,
        tierRestriction: 'hobby',
      },
      // Nano Banana Pro (Upscale Ultra - Premium)
      {
        id: 'nano-banana-pro',
        displayName: 'Upscale Ultra',
        provider: 'replicate',
        modelVersion: this.getModelVersion('nano-banana-pro'),
        capabilities: [
          'upscale',
          'enhance',
          'face-restoration',
          'denoise',
          'damage-repair',
          '4k-output',
          '8k-output',
        ],
        costPerRun: MODEL_COSTS['nano-banana-pro'],
        creditMultiplier: MODEL_CREDIT_MULTIPLIERS['nano-banana-pro'],
        qualityScore: 9.8,
        processingTimeMs: TIMEOUTS.NANO_BANANA_PRO_PROCESSING_TIME,
        maxInputResolution: CONFIG_MODEL_COSTS.MAX_INPUT_RESOLUTION,
        maxOutputResolution: CONFIG_MODEL_COSTS.MAX_OUTPUT_RESOLUTION_ULTRA,
        supportedScales: [
          CONFIG_MODEL_COSTS.DEFAULT_SCALE,
          CONFIG_MODEL_COSTS.MAX_SCALE_STANDARD,
          CONFIG_MODEL_COSTS.MAX_SCALE_PREMIUM,
        ],
        isEnabled: serverEnv.ENABLE_PREMIUM_MODELS,
        tierRestriction: 'hobby',
      },
      // Qwen Image Edit (Budget Image Editing - Premium)
      {
        id: 'qwen-image-edit',
        displayName: 'Image Edit',
        provider: 'replicate',
        modelVersion: this.getModelVersion('qwen-image-edit'),
        capabilities: ['upscale', 'enhance', 'denoise', 'damage-repair'],
        costPerRun: MODEL_COSTS['qwen-image-edit'],
        creditMultiplier: MODEL_CREDIT_MULTIPLIERS['qwen-image-edit'],
        qualityScore: 9.2,
        processingTimeMs: TIMEOUTS.CLARITY_UPSCALER_PROCESSING_TIME, // ~4-5 seconds
        maxInputResolution: CONFIG_MODEL_COSTS.MAX_INPUT_RESOLUTION,
        maxOutputResolution: CONFIG_MODEL_COSTS.MAX_OUTPUT_RESOLUTION,
        supportedScales: [
          CONFIG_MODEL_COSTS.DEFAULT_SCALE,
          CONFIG_MODEL_COSTS.MAX_SCALE_STANDARD,
          CONFIG_MODEL_COSTS.MAX_SCALE_PREMIUM,
        ],
        isEnabled: serverEnv.ENABLE_PREMIUM_MODELS,
        tierRestriction: 'hobby',
      },
    ];

    this.models.clear();
    modelConfigs.forEach(config => {
      this.models.set(config.id, config);
    });
  }

  /**
   * Load use-case to model assignments from env
   */
  private loadUseCaseAssignments(): void {
    this.useCaseAssignments = {
      generalUpscale: serverEnv.MODEL_FOR_GENERAL_UPSCALE,
      portraits: serverEnv.MODEL_FOR_PORTRAITS,
      damagedPhotos: serverEnv.MODEL_FOR_DAMAGED_PHOTOS,
      textLogos: serverEnv.MODEL_FOR_TEXT_LOGOS,
      maxQuality: serverEnv.MODEL_FOR_MAX_QUALITY,
    };
  }

  /**
   * Get model for a specific use case
   */
  getModelForUseCase(
    useCase: 'generalUpscale' | 'portraits' | 'damagedPhotos' | 'textLogos' | 'maxQuality'
  ): IModelConfig | null {
    const modelId = this.useCaseAssignments[useCase];
    return this.getModel(modelId);
  }

  /**
   * Check if auto model selection is enabled
   */
  isAutoSelectionEnabled(): boolean {
    return serverEnv.ENABLE_AUTO_MODEL_SELECTION;
  }

  /**
   * Get all enabled models
   */
  getEnabledModels(): IModelConfig[] {
    return Array.from(this.models.values()).filter(model => model.isEnabled);
  }

  /**
   * Get models by capability
   */
  getModelsByCapability(capability: ModelCapability): IModelConfig[] {
    return this.getEnabledModels().filter(model => model.capabilities.includes(capability));
  }

  /**
   * Get models available for a subscription tier
   */
  getModelsByTier(tier: SubscriptionTier): IModelConfig[] {
    return this.getEnabledModels().filter(model => {
      if (!model.tierRestriction) return true;

      // Tier hierarchy: business > pro > hobby > free
      const tierLevels = { free: 0, hobby: 1, pro: 2, business: 3 };
      const modelLevel = tierLevels[model.tierRestriction.toLowerCase() as SubscriptionTier];
      const userLevel = tierLevels[tier.toLowerCase() as SubscriptionTier];

      return userLevel >= modelLevel;
    });
  }

  /**
   * Get a specific model by ID
   */
  getModel(modelId: string): IModelConfig | null {
    return this.models.get(modelId) || null;
  }

  /**
   * Calculate credit cost for a model
   * Credit cost is based only on mode and model - scale does not affect credits
   */
  calculateCreditCost(
    modelId: string,
    _scale: 2 | 4 | 8,
    mode: 'upscale' | 'enhance' | 'both'
  ): number {
    const model = this.getModel(modelId);
    if (!model) return 0;

    // Base credits: from config
    const baseCredits =
      mode === 'upscale' ? CREDIT_COSTS.BASE_UPSCALE_COST : CREDIT_COSTS.BASE_ENHANCE_COST;

    // Final calculation: only base credits × model multiplier
    return Math.ceil(baseCredits * model.creditMultiplier);
  }

  /**
   * Calculate credit cost for a model with scale multiplier (including custom mode)
   */
  calculateCreditCostWithMode(
    modelId: string,
    scale: 2 | 4 | 8,
    mode: 'upscale' | 'enhance' | 'both' | 'custom'
  ): number {
    // Treat 'custom' as 'enhance' for pricing
    const modeForCalc = mode === 'custom' ? 'enhance' : mode;
    return this.calculateCreditCost(modelId, scale, modeForCalc);
  }

  /**
   * Get best model based on criteria
   */
  selectBestModel(criteria: IModelSelectionCriteria): IModelConfig | null {
    // Filter by tier and enabled status
    let candidates = this.getModelsByTier(criteria.userTier);

    // Filter by required capabilities
    candidates = candidates.filter(model =>
      criteria.requiredCapabilities.every(cap => model.capabilities.includes(cap))
    );

    // Filter by scale support
    candidates = candidates.filter(model => model.supportedScales.includes(criteria.scale));

    // Apply user preferences
    if (criteria.preferences.enhanceFaces) {
      // Prefer models with face restoration
      const faceModels = candidates.filter(m => m.capabilities.includes('face-restoration'));
      if (faceModels.length > 0) {
        candidates = faceModels;
      }
    }

    if (criteria.preferences.prioritizeQuality) {
      // Sort by quality score (descending)
      candidates.sort((a, b) => b.qualityScore - a.qualityScore);
    } else {
      // Sort by cost (ascending) for speed
      candidates.sort((a, b) => a.costPerRun - b.costPerRun);
    }

    // Check if user has enough credits for the best model
    for (const model of candidates) {
      const cost = this.calculateCreditCostWithMode(model.id, criteria.scale, criteria.mode);
      if (criteria.availableCredits >= cost) {
        return model;
      }
    }

    // Return cheapest model if none affordable
    return candidates[0] || null;
  }

  /**
   * Get model recommendation based on image analysis (auto mode)
   * Uses use-case assignments from env vars for model selection
   */
  recommendModel(
    analysis: {
      damageLevel?: number;
      faceCount?: number;
      textCoverage?: number;
      noiseLevel?: number;
      contentType?: ContentType;
    },
    userTier: SubscriptionTier,
    mode: 'upscale' | 'enhance' | 'both',
    scale: 2 | 4 | 8
  ): IModelRecommendation {
    // Get eligible models for the user's tier
    const eligibleModels = this.getModelsByTier(userTier).filter(m =>
      m.supportedScales.includes(scale)
    );

    // Default to general upscale model
    let recommended = this.useCaseAssignments.generalUpscale;
    let reasoning = 'Standard upscaling selected.';

    // Apply rule-based recommendation using use-case assignments
    if (analysis.damageLevel && analysis.damageLevel > CONFIG_MODEL_COSTS.DAMAGE_THRESHOLD_HIGH) {
      const damageModel = this.useCaseAssignments.damagedPhotos;
      if (eligibleModels.some(m => m.id === damageModel)) {
        recommended = damageModel;
        reasoning = 'Heavy damage detected. Premium restoration recommended.';
      }
    } else if (
      (analysis.textCoverage && analysis.textCoverage > CONFIG_MODEL_COSTS.TEXT_THRESHOLD_HIGH) ||
      analysis.contentType === 'document'
    ) {
      const textModel = this.useCaseAssignments.textLogos;
      if (eligibleModels.some(m => m.id === textModel)) {
        recommended = textModel;
        reasoning = 'Text or logos detected. Text preservation model selected.';
      }
    } else if (
      (analysis.faceCount && analysis.faceCount > 0) ||
      analysis.contentType === 'portrait' ||
      analysis.contentType === 'vintage'
    ) {
      const portraitModel = this.useCaseAssignments.portraits;
      if (eligibleModels.some(m => m.id === portraitModel)) {
        recommended = portraitModel;
        reasoning = 'Portrait or old photo detected. Face restoration model selected.';
      }
    } else if (
      analysis.noiseLevel &&
      analysis.noiseLevel > CONFIG_MODEL_COSTS.NOISE_THRESHOLD_HIGH
    ) {
      const qualityModel = this.useCaseAssignments.maxQuality;
      if (eligibleModels.some(m => m.id === qualityModel)) {
        recommended = qualityModel;
        reasoning = 'Noise detected. Higher quality upscaler selected.';
      }
    }

    // Fallback if recommended model not eligible
    if (!eligibleModels.some(m => m.id === recommended)) {
      recommended = eligibleModels[0]?.id || this.useCaseAssignments.generalUpscale;
      reasoning = 'Standard upscaling selected (best available for your tier).';
    }

    // Get alternatives (exclude recommended)
    const alternatives = eligibleModels
      .filter(m => m.id !== recommended)
      .slice(0, 2)
      .map(m => m.id);

    const creditCost = this.calculateCreditCostWithMode(
      recommended,
      scale,
      mode as 'upscale' | 'enhance' | 'both'
    );

    return {
      recommendedModel: recommended,
      reasoning,
      creditCost,
      alternatives,
      confidence: CONFIG_MODEL_COSTS.RECOMMENDATION_CONFIDENCE_DEFAULT,
    };
  }

  /**
   * Get provider for a model
   */
  getProviderForModel(modelId: string): { provider: ModelProvider; useFallback: boolean } {
    const model = this.getModel(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    return { provider: model.provider, useFallback: false };
  }

  /**
   * Reset registry (useful for testing)
   */
  reset(): void {
    this.models.clear();
    this.loadModelsFromEnvironment();
    this.loadUseCaseAssignments();
  }

  /**
   * Get use-case assignments (for debugging/testing)
   */
  getUseCaseAssignments(): Record<string, string> {
    return { ...this.useCaseAssignments };
  }
}
