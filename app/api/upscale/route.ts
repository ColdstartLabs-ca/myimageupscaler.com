import { NextRequest, NextResponse } from 'next/server';
import { upscaleSchema, validateImageSizeForTier } from '@shared/validation/upscale.schema';
import {
  InsufficientCreditsError,
  AIGenerationError,
} from '@server/services/image-generation.service';
import { ReplicateError } from '@server/services/replicate.service';
import { ImageProcessorFactory } from '@server/services/image-processor.factory';
import { ModelRegistry } from '@server/services/model-registry';
import { ZodError } from 'zod';
import { createLogger } from '@server/monitoring/logger';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import { ErrorCodes, createErrorResponse, serializeError } from '@shared/utils/errors';
import { upscaleRateLimit } from '@server/rateLimit';
import { batchLimitCheck } from '@server/services/batch-limit.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type { IUpscaleResponse } from '@shared/types/pixelperfect';
import type { SubscriptionTier } from '@server/services/model-registry.types';

function isPaidSubscriptionStatus(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing';
}

function normalizePaidTier(tier: string | null | undefined): SubscriptionTier {
  if (tier === 'hobby' || tier === 'pro' || tier === 'business') return tier;
  return 'hobby';
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

    // Determine user tier for model access validation
    // Active subscriptions without tier default to 'hobby' (lowest paid tier)
    // to avoid blocking paying users who have missing tier data
    let userTierForModels: SubscriptionTier = 'free';
    if (isPaidUser) {
      userTierForModels = userTier ?? 'hobby';
    }

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

    // 9. Model selection and validation
    const modelRegistry = ModelRegistry.getInstance();
    let selectedModelId = validatedInput.config.selectedModel;

    // If auto mode, use preferredModel hint or default
    if (selectedModelId === 'auto') {
      selectedModelId = validatedInput.config.preferredModel || 'real-esrgan';
    }

    // Validate model exists and is enabled
    const selectedModel = modelRegistry.getModel(selectedModelId);
    if (!selectedModel || !selectedModel.isEnabled) {
      logger.warn('Selected model not available', { modelId: selectedModelId, userId });
      // Fall back to default model
      selectedModelId = 'real-esrgan';
    }

    // Validate model is available for user's tier
    const eligibleModels = modelRegistry.getModelsByTier(userTierForModels);
    const isModelEligible = eligibleModels.some(m => m.id === selectedModelId);

    if (!isModelEligible) {
      logger.warn('Model requires higher tier', {
        userId,
        modelId: selectedModelId,
        userTier: userTierForModels,
        requiredTier: selectedModel?.tierRestriction,
      });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.FORBIDDEN,
        `Model ${selectedModelId} requires ${selectedModel?.tierRestriction || 'pro'} tier or higher. Please upgrade your subscription or select a different model.`,
        403
      );
      return NextResponse.json(errorBody, { status });
    }

    // Calculate credit cost based on the model and configuration
    creditCost = modelRegistry.calculateCreditCostWithMode(
      selectedModelId,
      validatedInput.config.scale,
      validatedInput.config.mode
    );

    // 10. Process image with selected model
    let processor;
    try {
      processor = ImageProcessorFactory.createProcessorForModel(selectedModelId);
    } catch {
      // Fallback to legacy processor selection if model-specific fails
      logger.warn('Model-specific processor failed, using fallback', { modelId: selectedModelId });
      const { primary } = ImageProcessorFactory.createProcessorWithFallback(
        validatedInput.config.mode
      );
      processor = primary;
    }

    logger.info('Using image processor', {
      provider: processor.providerName,
      mode: validatedInput.config.mode,
      selectedModel: selectedModelId,
      creditCost,
    });

    // Update the input config with the resolved model for the processor
    // Map enhancementPrompt to customPrompt for processing
    const inputWithResolvedModel = {
      ...validatedInput,
      config: {
        ...validatedInput.config,
        selectedModel: selectedModelId as typeof validatedInput.config.selectedModel,
        // If enhancementPrompt is provided (from LLM analysis), use it as customPrompt
        customPrompt: validatedInput.enhancementPrompt || validatedInput.config.customPrompt,
      },
    };

    let result;

    try {
      result = await processor.processImage(userId, inputWithResolvedModel);
    } catch (error) {
      // Try fallback provider if error is not due to insufficient credits
      if (!(error instanceof InsufficientCreditsError)) {
        const { fallback } = ImageProcessorFactory.createProcessorWithFallback(
          validatedInput.config.mode
        );
        if (fallback && fallback.providerName !== processor.providerName) {
          logger.warn('Primary provider failed, using fallback', {
            primaryProvider: processor.providerName,
            fallbackProvider: fallback.providerName,
            error: serializeError(error),
          });
          result = await fallback.processImage(userId, inputWithResolvedModel);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const durationMs = Date.now() - startTime;

    // Track successful upscale event
    await trackServerEvent(
      'image_upscaled',
      {
        scaleFactor: validatedInput.config.scale,
        mode: validatedInput.config.mode,
        durationMs,
        creditsUsed: creditCost,
        creditsRemaining: result.creditsRemaining,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
    );

    logger.info('Upscale completed', {
      userId,
      durationMs,
      creditsUsed: creditCost,
      modelUsed: selectedModelId,
    });

    // 9. Return successful response with enhanced information
    // Get the actual model config for display name
    const modelConfig = modelRegistry.getModel(selectedModelId);
    const modelDisplayName = modelConfig?.displayName || selectedModelId;

    const response: IUpscaleResponse = {
      success: true,
      imageData: result.imageData, // Legacy base64 support (may be undefined)
      imageUrl: result.imageUrl, // New URL-based result (Cloudflare Workers optimized)
      expiresAt: result.expiresAt, // Expiry timestamp for URL
      mimeType: result.mimeType || 'image/png',
      processing: {
        modelUsed: selectedModelId,
        modelDisplayName,
        processingTimeMs: durationMs,
        creditsUsed: creditCost,
        creditsRemaining: result.creditsRemaining,
      },
    };

    // Include analysis hint if auto mode was originally requested
    if (validatedInput.config.selectedModel === 'auto') {
      response.analysis = {
        modelRecommendation: selectedModelId,
        contentType: undefined, // Would be populated if analyze-image was called first
      };
    }

    // Increment batch counter after successful processing
    batchLimitCheck.increment(userId);

    // Get updated batch usage to include in response headers
    const batchUsage = batchLimitCheck.getUsage(userId, userTier);

    // 11. Return successful response with enhanced information and batch headers
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
