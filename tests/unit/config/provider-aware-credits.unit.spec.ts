import { describe, it, expect } from 'vitest';
import {
  calculateBatchProviderAwareCreditCost,
  calculateFinalProviderAwareCredits,
  calculateProviderAwareCredits,
  CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS,
  getCreditDisplayForTier,
  getCreditDisplayForTierAtScale,
  modelIdToTier,
} from '@shared/config/subscription.utils';
import { MAXIMUM_CREDITS_PER_OPERATION } from '@shared/config/subscription.config';
import { MODEL_CONFIG } from '@shared/config/model-costs.config';

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

    it('should throw when clarity-pro is billed without input dimensions', () => {
      expect(() =>
        calculateProviderAwareCredits({
          modelId: 'clarity-pro-upscaler',
          qualityTier: 'clarity-pro',
          scale: 4,
        })
      ).toThrow(/Input dimensions are required/);
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

    it('should apply the cap to output-megapixel pricing', () => {
      const result = calculateFinalProviderAwareCredits({
        modelId: 'clarity-pro-upscaler',
        qualityTier: 'clarity-pro',
        scale: 8,
        inputWidth: 4000,
        inputHeight: 4000,
        smartAnalysis: true,
      });

      expect(result.finalCredits).toBeLessThanOrEqual(MAXIMUM_CREDITS_PER_OPERATION);
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

  describe('Flux 2 Pro', () => {
    it('should charge 12 credits for a 4MP flux-2-pro run', () => {
      const result = calculateFinalProviderAwareCredits({
        modelId: 'flux-2-pro',
        qualityTier: 'face-pro',
        scale: 2,
        inputWidth: 2000,
        inputHeight: 2000,
      });

      expect(result.providerCostUsd).toBeCloseTo(0.135);
      expect(result.finalCredits).toBe(12);
      expect(result.pricingModel).toBe('output-megapixel');
    });

    it('should hold flux-2-pro margin above 55% at the max input bound', () => {
      const result = calculateFinalProviderAwareCredits({
        modelId: 'flux-2-pro',
        qualityTier: 'face-pro',
        scale: 2,
        inputWidth: 2000,
        inputHeight: 2000,
      });
      const revenue = result.finalCredits * 0.0298;
      const margin = (revenue - result.providerCostUsd) / revenue;

      expect(margin).toBeGreaterThan(0.55);
    });
  });

  it('should map every configured model id to its own tier', () => {
    for (const modelId of Object.keys(MODEL_CONFIG)) {
      const tier = modelIdToTier(modelId);

      if (
        modelId === 'real-esrgan' ||
        modelId === 'nano-banana' ||
        modelId === 'flux-kontext-fast'
      ) {
        expect(tier).toBe('quick');
      } else {
        expect(tier, modelId).not.toBe('quick');
      }
    }
  });

  describe('Legacy flat-priced models', () => {
    it('applies the configured multiplier to shared-tier Nano Banana pricing', () => {
      const result = calculateFinalProviderAwareCredits({
        modelId: 'nano-banana',
        qualityTier: 'quick',
        scale: 2,
      });

      expect(result.pricingModel).toBe('flat');
      expect(result.credits).toBe(2);
      expect(result.finalCredits).toBe(2);
    });

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
