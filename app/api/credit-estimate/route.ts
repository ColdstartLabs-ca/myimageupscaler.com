import type { ModelCapability } from '@/shared/types/coreflow.types';
import { createLogger } from '@server/monitoring/logger';
import { ModelRegistry } from '@server/services/model-registry';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { MODEL_SCALE_CREDIT_MULTIPLIERS } from '@shared/config/model-costs.config';
import {
  calculateProviderAwareCredits,
  getCreditsForTier,
  getCreditsForTierAtScale,
  modelIdToTier,
} from '@shared/config/subscription.utils';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';

/**
 * Mock user profile for testing in test environment
 */
function getMockUserProfile(userId: string) {
  // Extract tier information from user ID if available
  const isProUser = userId.includes('_sub_') && userId.includes('pro');
  const isBusinessUser = userId.includes('_sub_') && userId.includes('business');
  const isHobbyUser = userId.includes('_sub_') && userId.includes('hobby');

  let userTier: 'free' | 'hobby' | 'pro' | 'business' = 'free';
  if (isBusinessUser) userTier = 'business';
  else if (isProUser) userTier = 'pro';
  else if (isHobbyUser) userTier = 'hobby';

  return {
    subscription_status: isBusinessUser || isProUser || isHobbyUser ? 'active' : null,
    subscription_tier: userTier !== 'free' ? userTier : null,
    credits_balance: 100, // Default test credits
  };
}

// Request validation schema
const creditEstimateSchema = z.object({
  config: z.object({
    mode: z.enum(['upscale', 'enhance', 'both', 'custom']),
    scale: z.union([z.literal(2), z.literal(4), z.literal(8)]),
    qualityLevel: z.enum(['standard', 'enhanced', 'premium']).default('standard'),
    preserveText: z.boolean().default(false),
    enhanceFaces: z.boolean().default(false),
    denoise: z.boolean().default(false),
    autoModelSelection: z.boolean().default(true),
    preferredModel: z.string().optional(),
    targetResolution: z.enum(['2k', '4k', '8k']).optional(),
    selectedModel: z
      .enum([
        'auto',
        'real-esrgan',
        'gfpgan',
        'nano-banana',
        'clarity-upscaler',
        'nano-banana-pro',
        'clarity-pro-upscaler',
        'recraft-crisp-upscale',
        'nano-banana-2',
      ])
      .default('auto'),
    inputWidth: z.number().int().positive().optional(),
    inputHeight: z.number().int().positive().optional(),
  }),
  analysisHint: z
    .object({
      damageLevel: z.number().min(0).max(1).optional(),
      faceCount: z.number().min(0).optional(),
      textCoverage: z.number().min(0).max(1).optional(),
      contentType: z
        .enum(['photo', 'portrait', 'product', 'document', 'vintage', 'unknown'])
        .optional(),
    })
    .optional(),
});

const RESOLUTION_CREDIT_MULTIPLIERS: Record<string, number> = {
  '2k': 1.0,
  '4k': 1.5,
  '8k': 2.0,
};

/**
 * POST /api/credit-estimate
 * Pre-calculates credit cost for a processing job
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'credit-estimate-api');

  try {
    // Extract authenticated user ID from middleware header
    const userId = req.headers.get('X-User-Id');
    if (!userId) {
      logger.warn('Unauthorized request - no user ID');
      const { body, status } = createErrorResponse(
        ErrorCodes.UNAUTHORIZED,
        'Authentication required',
        401
      );
      return NextResponse.json(body, { status });
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedInput = creditEstimateSchema.parse(body);

    // Get user's subscription tier
    let profile: {
      subscription_status: string | null;
      subscription_tier: string | null;
      credits_balance: number;
    } | null;
    let profileError: {
      message: string;
      details?: unknown;
    } | null;

    // Handle mock users in test environment
    if (serverEnv.ENV === 'test' && (userId.startsWith('mock_user_') || userId.length === 36)) {
      // Mock users have UUIDs in test mode or start with mock_user_
      profile = getMockUserProfile(userId);
      profileError = null;
      logger.info('Using mock user profile for test environment', {
        userId,
        tier: profile.subscription_tier,
      });
    } else {
      // Fetch real user profile from database
      const result = await supabaseAdmin
        .from('profiles')
        .select('subscription_status, subscription_tier, credits_balance')
        .eq('id', userId)
        .single();

      profile = result.data;
      profileError = result.error;
    }

    if (profileError || !profile) {
      logger.error('Failed to fetch user profile', { userId, error: profileError });
      const { body, status } = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to fetch user profile',
        500
      );
      return NextResponse.json(body, { status });
    }

    // Determine user tier
    // Active subscriptions without tier default to 'hobby' (lowest paid tier)
    // to avoid blocking paying users who have missing tier data
    let userTier: 'free' | 'hobby' | 'pro' | 'business' = 'free';
    if (profile.subscription_status === 'active') {
      userTier = (profile.subscription_tier as 'hobby' | 'pro' | 'business') || 'hobby';
    }

    const modelRegistry = ModelRegistry.getInstance();

    // Determine which model will be used
    let modelToUse: string = validatedInput.config.selectedModel;

    if (modelToUse === 'auto' || !modelToUse) {
      // Use analysis hint to recommend model
      if (validatedInput.analysisHint) {
        const recommendation = modelRegistry.recommendModel(
          validatedInput.analysisHint,
          userTier,
          validatedInput.config.mode as 'upscale' | 'enhance' | 'both',
          validatedInput.config.scale
        );
        modelToUse = recommendation.recommendedModel;
      } else {
        // Choose model based on required features
        const requiredCapabilities: ModelCapability[] = [];
        if (validatedInput.config.enhanceFaces)
          requiredCapabilities.push('face-restoration' as ModelCapability);
        if (validatedInput.config.denoise) requiredCapabilities.push('denoise' as ModelCapability);

        // Get models that support all required capabilities
        const availableModels = modelRegistry.getModelsByTier(userTier);
        const suitableModels = availableModels.filter(
          model =>
            requiredCapabilities.every(cap => model.capabilities.includes(cap)) &&
            model.supportedScales.includes(validatedInput.config.scale)
        );

        if (suitableModels.length > 0) {
          // Choose the model with the lowest credit multiplier that supports all features
          modelToUse = suitableModels.sort((a, b) => a.creditMultiplier - b.creditMultiplier)[0].id;
        } else {
          // Fallback to default model if no suitable model found
          modelToUse = 'real-esrgan';
        }
      }
    }

    // Validate model is available for user tier
    const model = modelRegistry.getModel(modelToUse);
    if (!model) {
      logger.warn('Model not found', { userId, modelId: modelToUse });
      const { body, status } = createErrorResponse(
        ErrorCodes.MODEL_NOT_FOUND,
        `Model ${modelToUse} not found`,
        400
      );
      return NextResponse.json(body, { status });
    }

    if (!model.isEnabled) {
      logger.warn('Model not enabled', { userId, modelId: modelToUse });
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `Model ${modelToUse} is not available`,
        400
      );
      return NextResponse.json(body, { status });
    }

    // Check if model supports the requested scale
    const hasNoSupportedScales = model.supportedScales.length === 0;
    if (!hasNoSupportedScales && !model.supportedScales.includes(validatedInput.config.scale)) {
      logger.warn('Model does not support scale', {
        userId,
        modelId: modelToUse,
        requestedScale: validatedInput.config.scale,
        supportedScales: model.supportedScales,
      });
      const { body, status } = createErrorResponse(
        ErrorCodes.MODEL_NOT_SUPPORTED,
        `Model ${modelToUse} does not support ${validatedInput.config.scale}x scaling`,
        400
      );
      return NextResponse.json(body, { status });
    }

    // Check tier restrictions
    if (model.tierRestriction) {
      const tierLevels = { free: 0, hobby: 1, pro: 2, business: 3 };
      const modelLevel = tierLevels[model.tierRestriction];
      const userLevel = tierLevels[userTier];

      if (userLevel < modelLevel) {
        logger.warn('Model requires higher tier', {
          userId,
          modelId: modelToUse,
          requiredTier: model.tierRestriction,
          userTier,
        });
        const { body, status } = createErrorResponse(
          ErrorCodes.TIER_RESTRICTED,
          `Model ${modelToUse} requires ${model.tierRestriction} tier or higher`,
          403
        );
        return NextResponse.json(body, { status });
      }
    }

    // Map resolved model to quality tier for tier-based credit calculation.
    const tier = modelIdToTier(modelToUse);

    // Use provider-aware pricing for new models, fallback to legacy tier-based for others
    const providerAware = calculateProviderAwareCredits({
      modelId: modelToUse,
      qualityTier: tier,
      scale: validatedInput.config.scale,
      inputWidth: validatedInput.config.inputWidth,
      inputHeight: validatedInput.config.inputHeight,
    });

    let totalCredits = providerAware.credits;
    const resolutionMultiplier =
      providerAware.pricingModel === 'flat' && validatedInput.config.targetResolution
        ? RESOLUTION_CREDIT_MULTIPLIERS[validatedInput.config.targetResolution] || 1.0
        : 1.0;

    // Scale multiplier retained for breakdown transparency (legacy only)
    const scaleMultiplier =
      MODEL_SCALE_CREDIT_MULTIPLIERS[modelToUse]?.[validatedInput.config.scale] ?? 1.0;

    // For legacy flat-priced models, avoid double rounding by applying all
    // multipliers to the raw tier cost before the final ceil.
    if (providerAware.pricingModel === 'flat') {
      totalCredits = Math.ceil(getCreditsForTier(tier) * scaleMultiplier * resolutionMultiplier);
    }

    // Calculate estimated processing time (scale can still affect processing time)
    const scaleTimeMultipliers: Record<2 | 4 | 8, number> = { 2: 1.0, 4: 1.5, 8: 2.0 };
    const estimatedMs = model.processingTimeMs * scaleTimeMultipliers[validatedInput.config.scale];
    const estimatedTime =
      estimatedMs < 60000
        ? `~${Math.round(estimatedMs / 1000)}s`
        : `~${Math.round(estimatedMs / 60000)}m`;

    const response = {
      breakdown: {
        tier,
        tierCredits:
          providerAware.pricingModel === 'flat'
            ? getCreditsForTierAtScale(tier, validatedInput.config.scale)
            : providerAware.credits,
        scaleMultiplier,
        resolutionMultiplier,
        totalCredits,
        pricingModel: providerAware.pricingModel,
        ...(providerAware.outputMegapixels !== undefined
          ? { outputMegapixels: providerAware.outputMegapixels }
          : {}),
      },
      modelToBe: modelToUse,
      modelDisplayName: model.displayName,
      estimatedProcessingTime: estimatedTime,
      userCredits: profile.credits_balance || 0,
      canAfford: (profile.credits_balance || 0) >= totalCredits,
    };

    logger.info('Credit estimate calculated', {
      userId,
      model: modelToUse,
      credits: totalCredits,
      canAfford: response.canAfford,
    });

    return NextResponse.json(response);
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      logger.warn('Validation error', { errors: error.errors });
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid request data',
        400,
        { validationErrors: error.errors }
      );
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    const { body, status } = createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to calculate credit estimate',
      500
    );
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}
