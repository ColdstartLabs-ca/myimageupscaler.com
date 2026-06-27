import { describe, it, expect } from 'vitest';
import {
  calculateBatchProviderAwareCreditCost,
  calculateFinalProviderAwareCredits,
  calculateProviderAwareCredits,
  CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS,
  getCreditDisplayForTier,
  getCreditDisplayForTierAtScale,
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
    it('charges 3 credits for minimum cost (tiny output)', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 2,
        inputWidth: 100,
        inputHeight: 100,
      });
      expect(result.credits).toBe(3);
      expect(result.pricingModel).toBe('output-megapixel');
      expect(result.providerCostUsd).toBe(0.03);
    });

    it('charges 10 credits for 1MP input at 2x (4MP output)', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 2,
        inputWidth: 1000,
        inputHeight: 1000,
      });
      // outputMP = (2000*2000)/1M = 4
      // providerCost = max(0.03, 4*0.03) = 0.12
      // credits = ceil(0.12 * 2.5 / 0.03) = 10
      expect(result.credits).toBe(10);
      expect(result.providerCostUsd).toBe(0.12);
      expect(result.outputMegapixels).toBe(4);
    });

    it('charges 40 credits for 1MP input at 4x (16MP output)', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 4,
        inputWidth: 1000,
        inputHeight: 1000,
      });
      // outputMP = (4000*4000)/1M = 16
      // providerCost = max(0.03, 16*0.03) = 0.48
      // credits = ceil(0.48 * 2.5 / 0.03) = 40
      expect(result.credits).toBe(40);
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
      // credits = ceil(1.92 * 2.5 / 0.03) = 160
      expect(result.outputMegapixels).toBe(CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS);
      expect(result.credits).toBe(160);
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
      expect(result.credits).toBe(11); // 10 + 1
    });

    it('returns minimum credits when dimensions are missing', () => {
      const result = calculateProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 4,
      });
      // Without dimensions, outputMegapixels = 0
      // providerCost = max(0.03, 0) = 0.03
      // credits = ceil(0.03 * 2.5 / 0.03) = 3
      expect(result.credits).toBe(3);
      expect(result.outputMegapixels).toBeUndefined();
    });

    it('finalized credits preserve dynamic pricing without applying the legacy maximum', () => {
      const result = calculateFinalProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 8,
        inputWidth: 4000,
        inputHeight: 4000,
      });

      expect(result.finalCredits).toBe(160);
      expect(result.pricingModel).toBe('output-megapixel');
    });

    it('batch estimate uses per-image dimensions so Clarity Pro 8x display matches billing', () => {
      const result = calculateBatchProviderAwareCreditCost({
        config: {
          qualityTier: 'clarity-pro',
          scale: 8,
          additionalOptions: {},
        },
        items: [
          {
            inputDimensions: { width: 320, height: 228 },
          },
        ],
      });

      // outputMP = 320 * 228 * 8 * 8 / 1M = 4.66944
      // providerCost = 4.66944 * $0.03 = $0.1400832
      // credits = ceil($0.1400832 * 2.5 / $0.03) = 12
      expect(result.perItemCredits).toEqual([12]);
      expect(result.totalCredits).toBe(12);
    });

    it('static display helpers expose provider-aware bounds without component special cases', () => {
      expect(getCreditDisplayForTier('clarity-pro')).toBe('3-160 credits');
      expect(getCreditDisplayForTier('clarity-pro', 'CR')).toBe('3-160 CR');
      expect(
        getCreditDisplayForTierAtScale({
          tier: 'clarity-pro',
          scale: 8,
          smartAnalysis: true,
          unit: 'CR',
        })
      ).toBe('3-160 CR');
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

    it('finalized credits apply resolution multipliers without double rounding', () => {
      const result = calculateFinalProviderAwareCredits({
        modelId: 'real-esrgan',
        qualityTier: 'quick',
        scale: 2,
        targetResolution: '4k',
      });

      expect(result.pricingModel).toBe('flat');
      expect(result.resolutionMultiplier).toBe(1.5);
      expect(result.finalCredits).toBe(2);
    });
  });
});
