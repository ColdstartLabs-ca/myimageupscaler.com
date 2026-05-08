import { describe, it, expect } from 'vitest';
import {
  calculateProviderAwareCredits,
  CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS,
  PROVIDER_COST_PER_CREDIT_TARGET_USD,
} from '@shared/config/subscription.utils';

describe('Provider-Aware Credits', () => {
  describe('Recraft Crisp Upscale', () => {
    it('charges 2 credits for any dimensions', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'recraft-crisp-upscale',
        qualityTier: 'crisp-upscale',
        scale: 4,
        inputWidth: 2000,
        inputHeight: 2000,
      });
      expect(result.credits).toBe(2);
      expect(result.pricingModel).toBe('per-image');
      expect(result.providerCostUsd).toBe(0.006);
    });

    it('charges 3 credits with smart analysis', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'recraft-crisp-upscale',
        qualityTier: 'crisp-upscale',
        scale: 2,
        smartAnalysis: true,
      });
      expect(result.credits).toBe(3);
    });
  });

  describe('Clarity Pro Upscaler', () => {
    it('charges 6 credits for minimum cost (tiny output)', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 2,
        inputWidth: 100,
        inputHeight: 100,
      });
      expect(result.credits).toBe(6);
      expect(result.pricingModel).toBe('output-megapixel');
      expect(result.providerCostUsd).toBe(0.03);
    });

    it('charges 24 credits for 1MP input at 2x (4MP output)', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 2,
        inputWidth: 1000,
        inputHeight: 1000,
      });
      // outputMP = (2000*2000)/1M = 4
      // providerCost = max(0.03, 4*0.03) = 0.12
      // credits = ceil(0.12/0.005) = 24
      expect(result.credits).toBe(24);
      expect(result.providerCostUsd).toBe(0.12);
      expect(result.outputMegapixels).toBe(4);
    });

    it('charges 96 credits for 1MP input at 4x (16MP output)', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 4,
        inputWidth: 1000,
        inputHeight: 1000,
      });
      // outputMP = (4000*4000)/1M = 16
      // providerCost = max(0.03, 16*0.03) = 0.48
      // credits = ceil(0.48/0.005) = 96
      expect(result.credits).toBe(96);
      expect(result.providerCostUsd).toBe(0.48);
      expect(result.outputMegapixels).toBe(16);
    });

    it('caps output cost at 64MP', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 8,
        inputWidth: 4000,
        inputHeight: 4000,
      });
      // outputMP without cap = (32000*32000)/1M = 1024
      // capped at 64
      // providerCost = max(0.03, 64*0.03) = 1.92
      // credits = ceil(1.92/0.005) = 384
      expect(result.outputMegapixels).toBe(CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS);
      expect(result.credits).toBe(384);
      expect(result.providerCostUsd).toBe(1.92);
    });

    it('adds smart analysis cost', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 2,
        inputWidth: 1000,
        inputHeight: 1000,
        smartAnalysis: true,
      });
      expect(result.credits).toBe(25); // 24 + 1
    });

    it('returns minimum credits when dimensions are missing', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 4,
      });
      // Without dimensions, outputMegapixels = 0
      // providerCost = max(0.03, 0) = 0.03
      // credits = ceil(0.03/0.005) = 6
      expect(result.credits).toBe(6);
      expect(result.outputMegapixels).toBeUndefined();
    });
  });

  describe('Legacy flat-priced models', () => {
    it('uses tier-based scale multiplier for clarity-upscaler', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-upscaler',
        qualityTier: 'hd-upscale',
        scale: 4,
      });
      expect(result.pricingModel).toBe('flat');
      // hd-upscale credits = 4, scale multiplier for 4x = 2.0
      // credits = ceil(4 * 2.0) = 8
      expect(result.credits).toBe(8);
    });

    it('uses tier-based scale multiplier for real-esrgan', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'real-esrgan',
        qualityTier: 'quick',
        scale: 2,
      });
      expect(result.pricingModel).toBe('flat');
      // quick credits = 1, no scale multiplier
      expect(result.credits).toBe(1);
    });
  });
});
