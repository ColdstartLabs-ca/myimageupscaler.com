/**
 * Unit tests for tier restriction logic
 * Tests that users can access models based on their subscription tier
 */

import { beforeEach, describe, it, expect } from 'vitest';

import { ModelRegistry } from '@server/services/model-registry';
import {
  getEffectiveModelAccessTier,
  isTierAtLeast,
  modelIdToTier,
} from '@shared/config/subscription.utils';
import { MODEL_CONFIG, MODEL_COSTS } from '@shared/config/model-costs.config';

describe('Tier Restriction Logic', () => {
  function canAccessModel(userTier: string, requiredTier: string): boolean {
    return isTierAtLeast(userTier, requiredTier);
  }

  describe('Business tier access', () => {
    it('should access free tier models', () => {
      expect(canAccessModel('business', 'free')).toBe(true);
    });

    it('should access hobby tier models', () => {
      expect(canAccessModel('business', 'hobby')).toBe(true);
    });

    it('should access pro tier models', () => {
      expect(canAccessModel('business', 'pro')).toBe(true);
    });

    it('should access business tier models', () => {
      expect(canAccessModel('business', 'business')).toBe(true);
    });
  });

  describe('Pro tier access', () => {
    it('should access free tier models', () => {
      expect(canAccessModel('pro', 'free')).toBe(true);
    });

    it('should access hobby tier models', () => {
      expect(canAccessModel('pro', 'hobby')).toBe(true);
    });

    it('should access pro tier models', () => {
      expect(canAccessModel('pro', 'pro')).toBe(true);
    });

    it('should NOT access business tier models', () => {
      expect(canAccessModel('pro', 'business')).toBe(false);
    });
  });

  describe('Hobby tier access', () => {
    it('should access free tier models', () => {
      expect(canAccessModel('hobby', 'free')).toBe(true);
    });

    it('should access hobby tier models', () => {
      expect(canAccessModel('hobby', 'hobby')).toBe(true);
    });

    it('should NOT access pro tier models', () => {
      expect(canAccessModel('hobby', 'pro')).toBe(false);
    });

    it('should NOT access business tier models', () => {
      expect(canAccessModel('hobby', 'business')).toBe(false);
    });
  });

  describe('Free tier access', () => {
    it('should access free tier models', () => {
      expect(canAccessModel('free', 'free')).toBe(true);
    });

    it('should NOT access hobby tier models', () => {
      expect(canAccessModel('free', 'hobby')).toBe(false);
    });

    it('should NOT access pro tier models', () => {
      expect(canAccessModel('free', 'pro')).toBe(false);
    });

    it('should NOT access business tier models', () => {
      expect(canAccessModel('free', 'business')).toBe(false);
    });
  });

  describe('Model-specific tier restrictions', () => {
    // Model tier requirements
    const modelRestrictions = {
      'real-esrgan': null, // No restriction (free tier)
      gfpgan: 'hobby', // Paid face restoration
      'clarity-upscaler': 'hobby',
      'flux-2-pro': 'hobby',
      'nano-banana-pro': 'hobby',
    };

    it('business user can access flux-2-pro', () => {
      const required = modelRestrictions['flux-2-pro'];
      expect(canAccessModel('business', required || 'free')).toBe(true);
    });

    it('pro user can access flux-2-pro', () => {
      const required = modelRestrictions['flux-2-pro'];
      expect(canAccessModel('pro', required || 'free')).toBe(true);
    });

    it('hobby user can access flux-2-pro', () => {
      const required = modelRestrictions['flux-2-pro'];
      expect(canAccessModel('hobby', required || 'free')).toBe(true);
    });

    it('free user CANNOT access flux-2-pro', () => {
      const required = modelRestrictions['flux-2-pro'];
      expect(canAccessModel('free', required || 'free')).toBe(false);
    });

    it('business user can access nano-banana-pro', () => {
      const required = modelRestrictions['nano-banana-pro'];
      expect(canAccessModel('business', required || 'free')).toBe(true);
    });

    it('free user can access real-esrgan', () => {
      const required = modelRestrictions['real-esrgan'];
      expect(canAccessModel('free', required || 'free')).toBe(true);
    });

    it('free user CANNOT access gfpgan', () => {
      const required = modelRestrictions['gfpgan'];
      expect(canAccessModel('free', required || 'free')).toBe(false);
    });
  });

  describe('Model catalog and Auto selection', () => {
    let registry: ModelRegistry;

    beforeEach(() => {
      registry = ModelRegistry.getInstance();
      registry.reset();
    });

    it('keeps Quick free while preserving GFPGAN Face Restore pricing and purpose', () => {
      expect(MODEL_COSTS.FREE_MODELS).toContain('real-esrgan');
      expect(MODEL_COSTS.FREE_MODELS).not.toContain('gfpgan');
      expect(MODEL_COSTS.HOBBY_MODELS).toContain('gfpgan');
      expect(MODEL_COSTS.PRO_MODELS).toContain('gfpgan');
      expect(MODEL_COSTS.BUSINESS_MODELS).toContain('gfpgan');
      expect(MODEL_CONFIG['real-esrgan'].tierRestriction).toBeNull();
      expect(MODEL_CONFIG.gfpgan.tierRestriction).toBe('hobby');
      expect(modelIdToTier('gfpgan')).toBe('face-restore');

      const gfpgan = registry.getModel('gfpgan');
      expect(gfpgan).toMatchObject({
        displayName: 'Face Restore',
        costPerRun: MODEL_COSTS.GFPGAN_COST,
        tierRestriction: 'hobby',
      });
      expect(gfpgan?.capabilities).toContain('face-restoration');
    });

    it('should exclude face restoration when listing or auto-selecting models for a free user', () => {
      const freeModels = registry.getModelsByTier('free');
      const freeModelIds = freeModels.map(model => model.id);

      expect(freeModelIds).toContain('real-esrgan');
      expect(freeModelIds).not.toContain('gfpgan');
      expect(freeModels.some(model => model.capabilities.includes('face-restoration'))).toBe(false);

      const directFaceSelection = registry.selectBestModel({
        userTier: 'free',
        mode: 'both',
        scale: 2,
        requiredCapabilities: ['face-restoration'],
        preferences: {
          enhanceFaces: true,
          denoise: false,
          prioritizeQuality: true,
        },
        availableCredits: 100,
      });
      expect(directFaceSelection).toBeNull();

      const autoRecommendation = registry.recommendModel(
        { faceCount: 1, contentType: 'portrait' },
        'free',
        'both',
        2
      );
      expect(autoRecommendation.recommendedModel).not.toBe('gfpgan');
      expect(autoRecommendation.alternatives).not.toContain('gfpgan');
      expect(registry.getModel(autoRecommendation.recommendedModel)?.capabilities).not.toContain(
        'face-restoration'
      );
    });

    it('keeps GFPGAN, Clarity Pro, and Portrait Pro paid for direct selection', () => {
      const paidFaceModels = ['gfpgan', 'clarity-pro-upscaler', 'flux-2-pro'] as const;
      const freeModelIds = registry.getModelsByTier('free').map(model => model.id);
      const hobbyModelIds = registry.getModelsByTier('hobby').map(model => model.id);

      for (const modelId of paidFaceModels) {
        expect(MODEL_CONFIG[modelId].tierRestriction).toBe('hobby');
        expect(registry.getModel(modelId)?.tierRestriction).toBe('hobby');
        expect(freeModelIds).not.toContain(modelId);
        expect(hobbyModelIds).toContain(modelId);
        expect(isTierAtLeast('free', registry.getModel(modelId)?.tierRestriction)).toBe(false);
        expect(isTierAtLeast('hobby', registry.getModel(modelId)?.tierRestriction)).toBe(true);
      }

      const directGfpganSelection = registry.selectBestModel({
        userTier: 'hobby',
        mode: 'both',
        scale: 2,
        requiredCapabilities: ['face-restoration'],
        preferences: {
          enhanceFaces: true,
          denoise: false,
          prioritizeQuality: false,
        },
        availableCredits: 100,
      });
      expect(directGfpganSelection?.id).toBe('gfpgan');
    });

    it('grants existing hobby model access to credit-only purchasers', () => {
      const purchaserTier = getEffectiveModelAccessTier({
        subscriptionStatus: null,
        subscriptionTier: null,
        purchasedCreditsBalance: 10,
      });

      expect(purchaserTier).toBe('hobby');
      expect(registry.getModelsByTier(purchaserTier).map(model => model.id)).toContain('gfpgan');
      expect(isTierAtLeast(purchaserTier, 'hobby')).toBe(true);
      expect(
        getEffectiveModelAccessTier({
          subscriptionStatus: 'active',
          subscriptionTier: 'pro',
          purchasedCreditsBalance: 10,
        })
      ).toBe('pro');
      expect(getEffectiveModelAccessTier({ purchasedCreditsBalance: 0 })).toBe('free');
    });
  });

  describe('Credit Purchaser Access', () => {
    // Tests for users who purchased credits but have no subscription
    // They should get 'hobby' tier access for model selection

    it('should grant hobby-tier model access when user has purchased credits but no subscription', () => {
      // User with purchased credits but no subscription gets 'hobby' tier
      const userTier = 'hobby'; // Granted for credit purchasers

      // Can access free models
      expect(canAccessModel(userTier, 'free')).toBe(true);
      // Can access hobby-tier models (the key assertion)
      expect(canAccessModel(userTier, 'hobby')).toBe(true);
    });

    it('should block premium models for users with no subscription AND no purchased credits', () => {
      // User with no subscription and no purchased credits gets 'free' tier
      const userTier = 'free';
      const hasPaidAccess = canAccessModel(userTier, 'hobby');

      expect(hasPaidAccess).toBe(false);
    });

    it('should use subscription tier when both subscription and purchased credits exist', () => {
      // When user has both subscription AND purchased credits,
      // subscription tier takes precedence
      const subscriptionTier = 'pro';
      const hasProAccess = canAccessModel(subscriptionTier, 'pro');
      const hasHobbyAccess = canAccessModel(subscriptionTier, 'hobby');

      // Pro tier should work (subscription tier takes precedence)
      expect(hasProAccess).toBe(true);
      // Should still have access to lower tiers
      expect(hasHobbyAccess).toBe(true);
    });

    it('should allow hobby-tier models for credit-only purchasers (clarity-upscaler)', () => {
      const userTier = 'hobby'; // Credit purchaser gets hobby tier
      const _requiredTier = 'hobby'; // clarity-upscaler requires hobby

      expect(canAccessModel(userTier, 'hobby')).toBe(true);
    });

    it('should allow hobby-tier models for credit-only purchasers (flux-2-pro)', () => {
      const userTier = 'hobby'; // Credit purchaser gets hobby tier
      const requiredTier = 'hobby'; // flux-2-pro requires hobby

      expect(canAccessModel(userTier, requiredTier)).toBe(true);
    });

    it('should block pro-tier models for credit-only purchasers', () => {
      const userTier = 'hobby'; // Credit purchaser gets hobby tier, not pro
      const requiredTier = 'pro';

      expect(canAccessModel(userTier, requiredTier)).toBe(false);
    });

    it('should block business-tier models for credit-only purchasers', () => {
      const userTier = 'hobby'; // Credit purchaser gets hobby tier, not business
      const requiredTier = 'business';

      expect(canAccessModel(userTier, requiredTier)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined user tier as free', () => {
      expect(isTierAtLeast(undefined, 'free')).toBe(true);
      expect(isTierAtLeast(undefined, 'hobby')).toBe(false);
    });

    it('should handle null user tier as free', () => {
      expect(isTierAtLeast(null, 'free')).toBe(true);
      expect(isTierAtLeast(null, 'hobby')).toBe(false);
    });

    it('should normalize tier names and reject invalid requirements', () => {
      expect(isTierAtLeast('Business', 'HOBBY')).toBe(true);
      expect(isTierAtLeast('business', '')).toBe(false);
      expect(isTierAtLeast('business', 'enterprise')).toBe(false);
    });
  });
});
