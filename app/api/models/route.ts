import { NextRequest, NextResponse } from 'next/server';
import { ModelRegistry } from '@server/services/model-registry';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import { createLogger } from '@server/monitoring/logger';
import { serverEnv } from '@shared/config/env';
import type { SubscriptionTier } from '@server/services/model-registry.types';

/**
 * GET /api/models
 * Returns available models for the user's tier
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'models-api');

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

    // Handle test mode - return mock profile for mock users
    let userTier: SubscriptionTier = 'free';

    // Check if we're in test mode with a mock user
    const isTestMode = serverEnv.ENV === 'test' && userId.startsWith('mock_user_');

    if (isTestMode) {
      // Extract tier from mock user token if present
      // Free tier format: test_token_mock_user_{userId}
      // Paid tier format: test_token_mock_user_{userId}_sub_{subscription}_{tier}
      const authHeader = req.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const tierMatch = token.match(/_sub_(.+)_(.+)$/);
        if (tierMatch) {
          const [, , tier] = tierMatch;
          userTier = tier as SubscriptionTier;
        } else {
          // If no subscription info, assume free tier
          userTier = 'free';
        }
      }
    } else {
      // Get user's subscription tier from database
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('subscription_status, subscription_tier')
        .eq('id', userId)
        .single();

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
      if (profile.subscription_status === 'active' && profile.subscription_tier) {
        userTier = profile.subscription_tier as SubscriptionTier;
      }
    }

    // Get models from registry
    const modelRegistry = ModelRegistry.getInstance();
    const eligibleModels = modelRegistry.getModelsByTier(userTier);
    const allModels = modelRegistry.getEnabledModels();

    // Format models for response
    const models = eligibleModels.map(model => ({
      id: model.id,
      displayName: model.displayName,
      description: getModelDescription(model.id),
      creditCost: model.creditMultiplier,
      capabilities: model.capabilities,
      qualityScore: model.qualityScore,
      processingTime: `~${Math.round(model.processingTimeMs / 1000)}s`,
      available: true,
      tierRestriction: model.tierRestriction || null,
    }));

    // Add unavailable models with tier restrictions
    const unavailableModels = allModels
      .filter(model => !eligibleModels.includes(model))
      .map(model => ({
        id: model.id,
        displayName: model.displayName,
        description: getModelDescription(model.id),
        creditCost: model.creditMultiplier,
        capabilities: model.capabilities,
        qualityScore: model.qualityScore,
        processingTime: `~${Math.round(model.processingTimeMs / 1000)}s`,
        available: false,
        requiresTier: model.tierRestriction || 'pro',
      }));

    const response = {
      models: [...models, ...unavailableModels],
      defaultModel: 'real-esrgan',
      userTier,
    };

    logger.info('Models retrieved', {
      userId,
      userTier,
      availableCount: models.length,
      totalCount: models.length + unavailableModels.length,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to fetch models', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const { body, status } = createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to fetch available models',
      500
    );
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}

/**
 * Get human-readable description for a model
 */
function getModelDescription(modelId: string): string {
  const descriptions: Record<string, string> = {
    'real-esrgan': 'Fast, reliable upscaling for general images',
    gfpgan: 'Face enhancement + old photo restoration',
    'nano-banana': 'Text and logo preservation for documents and graphics',
    'clarity-upscaler': 'Higher quality upscaling with better details',
    'nano-banana-pro': 'Premium restoration for heavily damaged photos, 4K output',
  };
  return descriptions[modelId] || 'AI-powered image enhancement';
}
