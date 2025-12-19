import type { IUpscaleResponse, ModelId, QualityTier } from '@/shared/types/coreflow.types';
import { trackServerEvent } from '@server/analytics';
import { createLogger } from '@server/monitoring/logger';
import { upscaleRateLimit } from '@server/rateLimit';
import { batchLimitCheck } from '@server/services/batch-limit.service';
import {
  AIGenerationError,
  InsufficientCreditsError,
} from '@server/services/image-generation.service';
import { ImageProcessorFactory } from '@server/services/image-processor.factory';
import { LLMImageAnalyzer } from '@server/services/llm-image-analyzer';
import { ModelRegistry } from '@server/services/model-registry';
import type { SubscriptionTier } from '@server/services/model-registry.types';
import { ReplicateError } from '@server/services/replicate.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { getCreditsForTier, getModelForTier } from '@shared/config/subscription.utils';
import { ErrorCodes, createErrorResponse, serializeError } from '@shared/utils/errors';
import { upscaleSchema, validateImageSizeForTier } from '@shared/validation/upscale.schema';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

// Delay between AI analysis and image processing to avoid Replicate rate limits
// Replicate enforces 1 req/sec for low-credit accounts, with ~30s reset on 429
const RATE_LIMIT_DELAY_MS = 5000;

/**
 * Delay helper to avoid Replicate rate limits when using smart analysis
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPaidSubscriptionStatus(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing';
}

function normalizePaidTier(tier: string | null | undefined): SubscriptionTier {
  if (tier === 'hobby' || tier === 'pro' || tier === 'business') return tier;
  return 'hobby';
}

/**
 * Directly call LLM analyzer for image analysis
 * Returns AI analysis result with tier and enhancement suggestions
 */
async function analyzeImageForProcessing(
  imageData: string,
  options: { suggestTier: boolean; userTier: SubscriptionTier; mimeType?: string }
): Promise<{
  recommendedTier?: QualityTier;
  suggestedEnhancements: {
    enhanceFaces: boolean;
    preserveText: boolean;
    enhance: boolean;
  };
  enhancementPrompt?: string;
}> {
  try {
    // Get eligible models based on user's subscription tier
    const modelRegistry = ModelRegistry.getInstance();
    let eligibleModels = modelRegistry.getModelsByTier(options.userTier);

    // Filter out expensive models (8+ credits) for auto selection
    eligibleModels = eligibleModels.filter(m => m.creditMultiplier < 8);
    const eligibleModelIds = eligibleModels.map(m => m.id as ModelId);

    if (eligibleModelIds.length === 0) {
      // Fallback if no eligible models
      return {
        suggestedEnhancements: {
          enhanceFaces: false,
          preserveText: false,
          enhance: false,
        },
      };
    }

    // Extract base64 data (remove data URL prefix if present)
    const base64Data = imageData.startsWith('data:') ? imageData.split(',')[1] : imageData;
    const mimeType = options.mimeType || 'image/jpeg';

    // Call LLM analyzer directly
    const llmAnalyzer = new LLMImageAnalyzer();
    const analysisResult = await llmAnalyzer.analyze(base64Data, mimeType, eligibleModelIds);

    // Map analysis to tier if suggestTier is true
    const recommendedTier = options.suggestTier
      ? modelIdToTier(analysisResult.recommendedModel)
      : undefined;

    // Determine suggested enhancements from analysis issues
    const hasFaces = analysisResult.issues.some(i => i.type === 'faces');
    const hasText = analysisResult.issues.some(i => i.type === 'text' && i.severity !== 'low');
    const hasDamageOrNoise = analysisResult.issues.some(
      i => (i.type === 'damage' || i.type === 'noise' || i.type === 'blur') && i.severity !== 'low'
    );

    return {
      recommendedTier,
      suggestedEnhancements: {
        enhanceFaces: hasFaces,
        preserveText: hasText,
        enhance: hasDamageOrNoise,
      },
      enhancementPrompt: analysisResult.enhancementPrompt,
    };
  } catch (error) {
    console.error('[analyzeImageForProcessing] LLM analysis failed:', error);
    // If analysis fails, return defaults
    return {
      suggestedEnhancements: {
        enhanceFaces: false,
        preserveText: false,
        enhance: false,
      },
    };
  }
}

/**
 * Helper function to map model ID to quality tier
 */
function modelIdToTier(modelId: string): QualityTier {
  switch (modelId) {
    case 'real-esrgan':
      return 'quick';
    case 'gfpgan':
      return 'face-restore';
    case 'clarity-upscaler':
      return 'hd-upscale';
    case 'flux-2-pro':
      return 'face-pro';
    case 'nano-banana-pro':
      return 'ultra';
    default:
      return 'quick';
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'upscale-api');
  const startTime = Date.now();
  let creditCost = 1; // Default, will be updated after validation

  try {
    // 1. Extract authenticated user ID from middleware header
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

    // 2. Apply stricter rate limit for image processing (5 req/min)
    const { success: rateLimitOk, remaining, reset } = await upscaleRateLimit.limit(userId);
    if (!rateLimitOk) {
      logger.warn('Upscale rate limit exceeded', { userId });
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      const { body, status } = createErrorResponse(
        ErrorCodes.RATE_LIMITED,
        'Too many image processing requests. Please wait before trying again.',
        429,
        { retryAfter }
      );
      return NextResponse.json(body, {
        status,
        headers: {
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': new Date(reset).toISOString(),
          'Retry-After': retryAfter.toString(),
        },
      });
    }

    logger.info('Processing upscale request', { userId });

    // 3. Get user's subscription status and tier to determine limits
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('subscription_status, subscription_tier')
      .eq('id', userId)
      .single();

    const subscriptionStatus = profile?.subscription_status ?? null;
    const isPaidUser = isPaidSubscriptionStatus(subscriptionStatus);
    const userTier = isPaidUser ? normalizePaidTier(profile?.subscription_tier) : null;

    // 4. Check batch limit (after rate limit, before processing)
    const batchCheck = batchLimitCheck.check(userId, userTier);
    if (!batchCheck.allowed) {
      logger.warn('Batch limit exceeded', {
        userId,
        tier: userTier,
        current: batchCheck.current,
        limit: batchCheck.limit,
      });
      const { body, status } = createErrorResponse(
        ErrorCodes.BATCH_LIMIT_EXCEEDED,
        `Batch limit exceeded. Your plan allows ${batchCheck.limit} images per hour. ` +
          `You've processed ${batchCheck.current}. Upgrade for higher limits.`,
        429,
        {
          current: batchCheck.current,
          limit: batchCheck.limit,
          resetAt: batchCheck.resetAt.toISOString(),
          upgradeUrl: '/pricing',
        }
      );
      return NextResponse.json(body, {
        status,
        headers: {
          'X-Batch-Limit': batchCheck.limit.toString(),
          'X-Batch-Current': batchCheck.current.toString(),
          'X-Batch-Reset': batchCheck.resetAt.toISOString(),
        },
      });
    }

    // 5. Parse and validate request body
    const body = await req.json();
    const validatedInput = upscaleSchema.parse(body);

    // 6. Additional validation: Check if image data is valid base64
    try {
      const imageData = validatedInput.imageData;
      const base64Data = imageData.startsWith('data:') ? imageData.split(',')[1] : imageData;
      if (!base64Data) {
        const { body: errorBody, status } = createErrorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid image data format - missing base64 data',
          400
        );
        return NextResponse.json(errorBody, { status });
      }

      // Simple base64 validation using web-compatible approach
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(base64Data)) {
        const { body: errorBody, status } = createErrorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid image data format - not valid base64',
          400
        );
        return NextResponse.json(errorBody, { status });
      }
    } catch {
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid image data format',
        400
      );
      return NextResponse.json(errorBody, { status });
    }

    // Note: User tier validation now happens in the 3-branch logic section

    // 8. Validate image size based on user tier (BEFORE charging credits)
    const sizeValidation = validateImageSizeForTier(validatedInput.imageData, isPaidUser);
    if (!sizeValidation.valid) {
      logger.warn('Image size validation failed', {
        userId,
        isPaidUser,
        error: sizeValidation.error,
      });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        sizeValidation.error || 'Image size validation failed',
        400
      );
      return NextResponse.json(errorBody, { status });
    }

    // 9. Validate premium tier restrictions for free users
    const config = validatedInput.config;
    const premiumTiers = MODEL_COSTS.PREMIUM_QUALITY_TIERS as readonly QualityTier[];

    // Block free users from premium tiers
    if (!isPaidUser && premiumTiers.includes(config.qualityTier)) {
      logger.warn('Free user attempted premium tier', {
        userId,
        tier: config.qualityTier,
      });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.FORBIDDEN,
        `Quality tier "${config.qualityTier}" requires a paid subscription. Please upgrade or select Quick or Face Restore tier.`,
        403
      );
      return NextResponse.json(errorBody, { status });
    }

    // Block free users from Smart AI Analysis
    if (
      !isPaidUser &&
      MODEL_COSTS.SMART_ANALYSIS_REQUIRES_PAID &&
      config.additionalOptions.smartAnalysis
    ) {
      logger.warn('Free user attempted Smart Analysis', { userId });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.FORBIDDEN,
        'Smart AI Analysis requires a paid subscription. Please upgrade or disable this feature.',
        403
      );
      return NextResponse.json(errorBody, { status });
    }

    // 10. New 3-branch logic for quality tier processing
    let resolvedTier: QualityTier;
    let resolvedModelId: ModelId;
    let resolvedEnhancements = config.additionalOptions;
    let didRunAIAnalysis = false;

    if (config.qualityTier === 'auto') {
      // Branch A: Auto tier - Always run AI analysis for tier + enhancements
      logger.info('Auto tier selected, running AI analysis', { userId });
      const analysis = await analyzeImageForProcessing(validatedInput.imageData, {
        suggestTier: true,
        userTier: userTier || 'free',
        mimeType: validatedInput.mimeType,
      });
      resolvedTier = analysis.recommendedTier || 'quick';
      resolvedModelId = (getModelForTier(resolvedTier) || 'real-esrgan') as ModelId;
      resolvedEnhancements = {
        ...config.additionalOptions,
        // For Auto tier, smartAnalysis is always true (inherent to auto mode)
        smartAnalysis: true,
        // Apply AI suggestions
        enhance: analysis.suggestedEnhancements.enhance || config.additionalOptions.enhance,
        enhanceFaces:
          analysis.suggestedEnhancements.enhanceFaces || config.additionalOptions.enhanceFaces,
        preserveText:
          analysis.suggestedEnhancements.preserveText || config.additionalOptions.preserveText,
        customInstructions:
          analysis.enhancementPrompt || config.additionalOptions.customInstructions,
      };
      didRunAIAnalysis = true;
      logger.info('AI analysis completed for Auto tier', {
        userId,
        recommendedTier: resolvedTier,
        resolvedModelId,
        enhancements: resolvedEnhancements,
      });
    } else if (config.additionalOptions.smartAnalysis) {
      // Branch B: Explicit tier + Smart Analysis - AI suggests enhancements only
      logger.info('Explicit tier with Smart Analysis', {
        userId,
        tier: config.qualityTier,
      });
      const analysis = await analyzeImageForProcessing(validatedInput.imageData, {
        suggestTier: false,
        userTier: userTier || 'free',
        mimeType: validatedInput.mimeType,
      });
      resolvedTier = config.qualityTier;
      resolvedModelId = (getModelForTier(resolvedTier) || 'real-esrgan') as ModelId;
      resolvedEnhancements = {
        ...config.additionalOptions,
        // Apply AI suggestions for enhancements only
        enhance: analysis.suggestedEnhancements.enhance || config.additionalOptions.enhance,
        enhanceFaces:
          analysis.suggestedEnhancements.enhanceFaces || config.additionalOptions.enhanceFaces,
        preserveText:
          analysis.suggestedEnhancements.preserveText || config.additionalOptions.preserveText,
        customInstructions:
          analysis.enhancementPrompt || config.additionalOptions.customInstructions,
      };
      didRunAIAnalysis = true;
      logger.info('AI analysis completed for enhancements', {
        userId,
        tier: resolvedTier,
        resolvedModelId,
        enhancements: resolvedEnhancements,
      });
    } else {
      // Branch C: Explicit tier, no Smart Analysis - Use user's exact settings
      logger.info('Explicit tier without Smart Analysis', {
        userId,
        tier: config.qualityTier,
      });
      resolvedTier = config.qualityTier;
      resolvedModelId = (getModelForTier(resolvedTier) || 'real-esrgan') as ModelId;
      // Use user's exact settings from additionalOptions
      logger.info("Using user's exact settings", {
        userId,
        tier: resolvedTier,
        resolvedModelId,
        enhancements: resolvedEnhancements,
      });
    }

    // Validate model is available for user's subscription tier
    const modelRegistry = ModelRegistry.getInstance();
    const selectedModel = modelRegistry.getModel(resolvedModelId);
    if (!selectedModel || !selectedModel.isEnabled) {
      logger.error('Resolved model not available', { modelId: resolvedModelId, userId });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Unable to process image with selected quality tier. Please try again.',
        500
      );
      return NextResponse.json(errorBody, { status });
    }

    // Check if model requires higher subscription tier
    if (selectedModel.tierRestriction) {
      const minRequiredTier = normalizePaidTier(selectedModel.tierRestriction);
      const userTierForModels = isPaidUser ? userTier : 'free';

      // Tier hierarchy: free < hobby < pro < business
      const tierLevels: Record<string, number> = { free: 0, hobby: 1, pro: 2, business: 3 };
      const userLevel = tierLevels[userTierForModels || 'free'] ?? 0;
      const requiredLevel = tierLevels[minRequiredTier] ?? 0;

      if (userLevel < requiredLevel) {
        logger.warn('Model requires higher tier', {
          userId,
          modelId: resolvedModelId,
          userTier: userTierForModels,
          requiredTier: minRequiredTier,
        });
        const { body: errorBody, status } = createErrorResponse(
          ErrorCodes.FORBIDDEN,
          `Quality tier "${resolvedTier}" requires ${minRequiredTier} subscription or higher. Please upgrade your subscription or select a different tier.`,
          403
        );
        return NextResponse.json(errorBody, { status });
      }
    }

    // Calculate credit cost using new quality tier system
    const baseCost = getCreditsForTier(resolvedTier);

    // Get scale multiplier from existing config
    const { creditCosts } = getSubscriptionConfig();
    const scaleKey = `${config.scale}x` as '2x' | '4x' | '8x';
    const scaleMultiplier = creditCosts.scaleMultipliers[scaleKey] ?? 1.0;

    // Smart analysis cost: +1 credit when enabled on explicit tier (not auto)
    // Auto tier already includes smart analysis in its variable cost
    const smartAnalysisCost =
      config.qualityTier !== 'auto' && config.additionalOptions.smartAnalysis ? 1 : 0;

    // Apply scale multiplier and bounds, then add smart analysis cost
    creditCost = Math.ceil(baseCost * scaleMultiplier) + smartAnalysisCost;
    creditCost = Math.max(creditCost, creditCosts.minimumCost);
    creditCost = Math.min(creditCost, creditCosts.maximumCost);

    // 11. Process image with resolved model and settings
    let processor;
    try {
      processor = ImageProcessorFactory.createProcessorForModel(resolvedModelId);
    } catch {
      // Fallback to legacy processor selection if model-specific fails
      logger.warn('Model-specific processor failed, using fallback', { modelId: resolvedModelId });
      processor = ImageProcessorFactory.createProcessor('both');
    }

    logger.info('Using image processor', {
      provider: processor.providerName,
      resolvedTier,
      resolvedModelId,
      resolvedEnhancements,
      creditCost,
    });

    // Add delay between AI analysis and image processing to avoid Replicate rate limits
    // Both the analysis (Qwen VL) and processing (upscale models) use Replicate API
    if (didRunAIAnalysis) {
      logger.info('Adding rate limit delay after AI analysis', { delayMs: RATE_LIMIT_DELAY_MS });
      await delay(RATE_LIMIT_DELAY_MS);
    }

    // Create legacy-compatible input for the processor
    // Map new quality tier system to legacy format that processors understand
    const legacyInputForProcessor = {
      imageData: validatedInput.imageData,
      mimeType: validatedInput.mimeType,
      enhancementPrompt: validatedInput.enhancementPrompt,
      config: {
        // New quality tier system - required by calculateCreditCost
        qualityTier: resolvedTier,
        scale: config.scale,
        additionalOptions: resolvedEnhancements,
        nanoBananaProConfig: config.nanoBananaProConfig,
      },
    };

    // Pass pre-calculated creditCost to ensure consistent billing
    const result = await processor.processImage(userId, legacyInputForProcessor as never, {
      creditCost,
    });

    const durationMs = Date.now() - startTime;

    // Track successful upscale event
    await trackServerEvent(
      'image_upscaled',
      {
        scaleFactor: config.scale,
        qualityTier: resolvedTier,
        mode: 'both', // Always upscale + enhance in new system
        durationMs,
        creditsUsed: creditCost,
        creditsRemaining: result.creditsRemaining,
        smartAnalysis: config.additionalOptions.smartAnalysis,
        autoTier: config.qualityTier === 'auto',
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
    );

    logger.info('Upscale completed', {
      userId,
      durationMs,
      creditsUsed: creditCost,
      originalTier: config.qualityTier,
      usedTier: resolvedTier,
      modelUsed: resolvedModelId,
      smartAnalysis: config.additionalOptions.smartAnalysis,
    });

    // Return successful response with enhanced information
    // Get the actual model config for display name
    const modelConfig = modelRegistry.getModel(resolvedModelId);
    const modelDisplayName = modelConfig?.displayName || resolvedModelId;

    const response: IUpscaleResponse = {
      success: true,
      imageData: result.imageData, // Legacy base64 support (may be undefined)
      imageUrl: result.imageUrl, // New URL-based result (Cloudflare Workers optimized)
      expiresAt: result.expiresAt, // Expiry timestamp for URL
      mimeType: result.mimeType || 'image/png',
      processing: {
        modelUsed: resolvedModelId,
        modelDisplayName,
        processingTimeMs: durationMs,
        creditsUsed: creditCost,
        creditsRemaining: result.creditsRemaining,
      },
      // Include usedTier for Auto tier responses so UI can show what was actually used
      usedTier: config.qualityTier === 'auto' ? resolvedTier : undefined,
      analysis: {
        contentType: undefined, // Would be populated if analyze-image was called first
        modelRecommendation: config.qualityTier === 'auto' ? undefined : resolvedModelId,
      },
    };

    // Increment batch counter after successful processing
    batchLimitCheck.increment(userId);

    // Get updated batch usage to include in response headers
    const batchUsage = batchLimitCheck.getUsage(userId, userTier);

    // 12. Return successful response with enhanced information and batch headers
    return NextResponse.json(response, {
      headers: {
        'X-Batch-Limit': batchUsage.limit.toString(),
        'X-Batch-Current': batchUsage.current.toString(),
        'X-Batch-Reset': batchCheck.resetAt.toISOString(),
      },
    });
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

    // Handle insufficient credits
    if (error instanceof InsufficientCreditsError) {
      logger.info('Insufficient credits', { required: creditCost });
      const { body, status } = createErrorResponse(
        ErrorCodes.INSUFFICIENT_CREDITS,
        `You have insufficient credits. This operation requires ${creditCost} credit${creditCost > 1 ? 's' : ''}.`,
        402,
        { required: creditCost }
      );
      return NextResponse.json(body, { status });
    }

    // Handle Replicate errors
    if (error instanceof ReplicateError) {
      const statusCode = error.code === 'RATE_LIMITED' ? 429 : error.code === 'SAFETY' ? 422 : 503;
      const errorCode =
        error.code === 'RATE_LIMITED'
          ? ErrorCodes.RATE_LIMITED
          : error.code === 'SAFETY'
            ? ErrorCodes.INVALID_REQUEST
            : ErrorCodes.AI_UNAVAILABLE;
      logger.error('Replicate error', {
        message: error.message,
        code: error.code,
      });
      const { body, status } = createErrorResponse(errorCode, error.message, statusCode, {
        replicateCode: error.code,
      });
      return NextResponse.json(body, { status });
    }

    // Handle AI generation errors
    if (error instanceof AIGenerationError) {
      const statusCode = error.finishReason === 'SAFETY' ? 422 : 500;
      const errorCode =
        error.finishReason === 'SAFETY' ? ErrorCodes.INVALID_REQUEST : ErrorCodes.PROCESSING_FAILED;
      logger.error('AI generation error', {
        message: error.message,
        finishReason: error.finishReason,
      });
      const { body, status } = createErrorResponse(errorCode, error.message, statusCode, {
        finishReason: error.finishReason,
      });
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    const errorMessage = serializeError(error);
    logger.error('Unexpected error', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    const { body, status } = createErrorResponse(ErrorCodes.INTERNAL_ERROR, errorMessage, 500);
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}
