import type { ModelCapability } from '@/shared/types/coreflow.types';
import { createLogger } from '@server/monitoring/logger';
import {
  getAutoEligibleModels,
  isAutoModelCompatible,
  resolveAutoModel,
} from '@server/services/auto-model-selection';
import { ModelRegistry } from '@server/services/model-registry';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import {
  FACE_ENHANCEMENT_MODEL_ID,
  evaluateFaceEnhancementPolicy,
  getFaceEnhancementEntitlement,
  validateClarityProDimensions,
} from '@shared/config/face-enhancement-policy';
import {
  calculateFinalProviderAwareCredits,
  getModelForTier,
  modelIdToTier,
  resolveEffectiveResolution,
} from '@shared/config/subscription.utils';
import { decodeImageDimensions } from '@shared/validation/upscale.schema';
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
    // Free mock credits are promotional subscription-pool credits. They are
    // spendable but do not grant paid face/model access.
    subscription_credits_balance: 100,
    purchased_credits_balance: 0,
  };
}

// Request validation schema
const creditEstimateSchema = z.object({
  imageData: z.string().optional(),
  mimeType: z.string().optional(),
  config: z.object({
    mode: z.enum(['upscale', 'enhance', 'both', 'custom']).default('both'),
    scale: z.union([z.literal(2), z.literal(4), z.literal(8)]),
    qualityLevel: z.enum(['standard', 'enhanced', 'premium']).default('standard'),
    preserveText: z.boolean().default(false),
    enhanceFaces: z.boolean().default(false),
    denoise: z.boolean().default(false),
    autoModelSelection: z.boolean().default(true),
    preferredModel: z.string().optional(),
    targetResolution: z.enum(['2k', '4k', '8k']).optional(),
    nanoBananaProConfig: z
      .object({
        resolution: z.enum(['1K', '2K', '4K']).default('2K'),
      })
      .passthrough()
      .optional(),
    qualityTier: z
      .enum([
        'auto',
        'quick',
        'face-restore',
        'fast-edit',
        'budget-edit',
        'budget-old-photo',
        'seedream-edit',
        'anime-upscale',
        'hd-upscale',
        'face-pro',
        'ultra',
        'lighting-fix',
        'resume-photo',
        'photo-repair',
        'clarity-pro',
        'crisp-upscale',
        'nano-banana-2',
      ])
      .optional(),
    additionalOptions: z.object({ smartAnalysis: z.boolean().optional() }).passthrough().optional(),
    selectedModel: z
      .enum([
        'auto',
        'real-esrgan',
        'gfpgan',
        'nano-banana',
        'clarity-upscaler',
        'flux-2-pro',
        'nano-banana-pro',
        'qwen-image-edit',
        'seedream',
        'realesrgan-anime',
        'p-image-edit',
        'flux-kontext-fast',
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

    // Get the same subscription and dual credit pools used by /api/upscale.
    let profile: {
      subscription_status: string | null;
      subscription_tier: string | null;
      subscription_credits_balance: number | null;
      purchased_credits_balance: number | null;
    } | null;
    let profileError: {
      message: string;
      details?: unknown;
    } | null;

    // Handle mock users in test environment
    if (serverEnv.ENV === 'test' && userId.startsWith('mock_user_')) {
      // Mock users without a database profile use the same dual-pool shape as
      // the upscale route. UUID-shaped IDs still use the mocked profile query.
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
        .select(
          'subscription_status, subscription_tier, subscription_credits_balance, purchased_credits_balance'
        )
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

    const faceEntitlement = getFaceEnhancementEntitlement({
      subscriptionStatus: profile.subscription_status,
      subscriptionTier: profile.subscription_tier,
      subscriptionCreditsBalance: profile.subscription_credits_balance,
      purchasedCreditsBalance: profile.purchased_credits_balance,
    });
    const userTier = faceEntitlement.effectiveTier;

    const facePolicy = evaluateFaceEnhancementPolicy({
      request: {
        qualityTier: validatedInput.config.qualityTier,
        selectedModel: validatedInput.config.selectedModel,
        enhanceFaces:
          validatedInput.config.enhanceFaces === true ||
          validatedInput.config.additionalOptions?.enhanceFaces === true,
      },
      entitlement: faceEntitlement,
    });
    if (facePolicy.faceEnhancementRequested && !facePolicy.isPaidUser) {
      logger.warn('Face enhancement requires paid access', {
        userId,
        accessClass: facePolicy.accessClass,
      });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.FORBIDDEN,
        'Face enhancement requires paid access. Please upgrade or choose Quick without face enhancement.',
        403,
        { requiresPaidAccess: true, faceEnhancement: true }
      );
      return NextResponse.json(errorBody, { status });
    }

    if (facePolicy.invalidModelSelection || facePolicy.requiresReselection) {
      logger.warn('Face enhancement selection requires reselection', {
        userId,
        accessClass: facePolicy.accessClass,
        invalidModelSelection: facePolicy.invalidModelSelection,
      });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Please select Clarity Pro or another paid face tier before requesting a quote.',
        400,
        {
          requiresReselection: facePolicy.requiresReselection,
          recommendedQualityTier: 'clarity-pro',
          faceEnhancement: true,
        }
      );
      return NextResponse.json(errorBody, { status });
    }

    const modelRegistry = ModelRegistry.getInstance();

    // Determine which model will be used
    const requestedAuto =
      validatedInput.config.qualityTier === 'auto' ||
      (!validatedInput.config.qualityTier && validatedInput.config.selectedModel === 'auto');
    const tierModel = validatedInput.config.qualityTier
      ? getModelForTier(validatedInput.config.qualityTier)
      : null;
    let modelToUse: string = requestedAuto
      ? 'auto'
      : (tierModel ?? validatedInput.config.selectedModel);

    if (modelToUse === 'auto' || !modelToUse) {
      // Use analysis hint to recommend model
      if (validatedInput.analysisHint) {
        const recommendation = modelRegistry.recommendModel(
          validatedInput.analysisHint,
          userTier,
          validatedInput.config.mode as 'upscale' | 'enhance' | 'both',
          validatedInput.config.scale
        );
        modelToUse =
          resolveAutoModel(
            modelRegistry.getModelsByTier(userTier),
            validatedInput.config.scale,
            recommendation.recommendedModel
          )?.id ?? '';
      } else {
        // Choose model based on required features
        const requiredCapabilities: ModelCapability[] = [];
        if (validatedInput.config.enhanceFaces)
          requiredCapabilities.push('face-restoration' as ModelCapability);
        if (validatedInput.config.denoise) requiredCapabilities.push('denoise' as ModelCapability);

        // Get models that support all required capabilities
        const availableModels = modelRegistry.getModelsByTier(userTier);
        const suitableModels = getAutoEligibleModels(
          availableModels,
          validatedInput.config.scale
        ).filter(model => requiredCapabilities.every(cap => model.capabilities.includes(cap)));

        if (suitableModels.length > 0) {
          // Choose the model with the lowest credit multiplier that supports all features
          modelToUse = suitableModels.sort((a, b) => a.creditMultiplier - b.creditMultiplier)[0].id;
        } else {
          modelToUse = resolveAutoModel(availableModels, validatedInput.config.scale)?.id ?? '';
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
    if (!isAutoModelCompatible(model, validatedInput.config.scale)) {
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
    const decodedDimensions = validatedInput.imageData
      ? decodeImageDimensions(validatedInput.imageData)
      : null;
    const inputWidth = decodedDimensions?.width ?? validatedInput.config.inputWidth;
    const inputHeight = decodedDimensions?.height ?? validatedInput.config.inputHeight;

    if (modelToUse === FACE_ENHANCEMENT_MODEL_ID && facePolicy.faceEnhancementRequested) {
      const clarityDimensions = validateClarityProDimensions({
        inputWidth,
        inputHeight,
        scale: validatedInput.config.scale,
      });
      if (!clarityDimensions.valid) {
        logger.warn('Clarity Pro estimate dimensions rejected', {
          userId,
          reason: clarityDimensions.reason,
          inputWidth,
          inputHeight,
          outputMegapixels: clarityDimensions.outputMegapixels,
        });
        const message =
          clarityDimensions.reason === 'output-cap'
            ? 'The selected Clarity Pro scale would exceed its 64 MP output limit. Choose a smaller scale or image.'
            : 'Clarity Pro pricing requires valid input dimensions. Please provide the original image dimensions.';
        const { body: errorBody, status } = createErrorResponse(
          ErrorCodes.VALIDATION_ERROR,
          message,
          400,
          {
            modelId: modelToUse,
            reason: clarityDimensions.reason,
            ...(clarityDimensions.outputMegapixels !== undefined
              ? { outputMegapixels: clarityDimensions.outputMegapixels }
              : {}),
          }
        );
        return NextResponse.json(errorBody, { status });
      }
    }

    // Use provider-aware pricing for new models, fallback to legacy tier-based for others
    const providerAware = calculateFinalProviderAwareCredits({
      modelId: modelToUse,
      qualityTier: tier,
      scale: validatedInput.config.scale,
      inputWidth,
      inputHeight,
      smartAnalysis:
        !requestedAuto && (validatedInput.config.additionalOptions?.smartAnalysis ?? false),
      targetResolution: validatedInput.config.targetResolution,
      effectiveResolution: resolveEffectiveResolution(
        modelToUse,
        validatedInput.config.scale,
        validatedInput.config.nanoBananaProConfig?.resolution
      ),
    });

    const totalCredits = providerAware.finalCredits;

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
        tierCredits: providerAware.credits,
        scaleMultiplier: providerAware.scaleMultiplier,
        resolutionMultiplier: providerAware.resolutionMultiplier,
        totalCredits,
        pricingModel: providerAware.pricingModel,
        ...(providerAware.outputMegapixels !== undefined
          ? { outputMegapixels: providerAware.outputMegapixels }
          : {}),
      },
      modelToBe: modelToUse,
      modelDisplayName: model.displayName,
      estimatedProcessingTime: estimatedTime,
      userCredits: faceEntitlement.spendableCredits,
      canAfford: faceEntitlement.spendableCredits >= totalCredits,
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
