import { describe, it, expect } from 'vitest';
import { buildModelInput } from '@server/services/replicate/builders/model-input.builder';
import {
  calculateFinalProviderAwareCredits,
  resolveEffectiveResolution,
} from '@shared/config/subscription.utils';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';

describe('Replicate Builders: New Upscalers', () => {
  const baseInput: IUpscaleInput = {
    imageData:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/png',
    config: {
      qualityTier: 'auto',
      scale: 4,
      additionalOptions: {
        smartAnalysis: false,
        enhance: false,
        enhanceFaces: false,
        preserveText: false,
      },
    },
  };

  describe('ClarityProUpscalerBuilder', () => {
    it('builds correct input schema with scale_factor, creativity, and output_format', () => {
      const input = buildModelInput('clarity-pro-upscaler', baseInput);
      expect(input).toHaveProperty('image');
      expect(input).toHaveProperty('scale_factor', 4);
      expect(input).toHaveProperty('creativity', 0);
      expect(input).toHaveProperty('output_format', 'png');
    });

    it('uses the scale from context', () => {
      const input2x = buildModelInput('clarity-pro-upscaler', {
        ...baseInput,
        config: { ...baseInput.config, scale: 2 },
      });
      expect(input2x).toHaveProperty('scale_factor', 2);

      const input8x = buildModelInput('clarity-pro-upscaler', {
        ...baseInput,
        config: { ...baseInput.config, scale: 8 },
      });
      expect(input8x).toHaveProperty('scale_factor', 8);
    });
  });

  describe('RecraftCrispUpscaleBuilder', () => {
    it('builds correct input schema with only image field', () => {
      const input = buildModelInput('recraft-crisp-upscale', baseInput);
      expect(Object.keys(input)).toHaveLength(1);
      expect(input).toHaveProperty('image');
      expect(input).not.toHaveProperty('scale_factor');
      expect(input).not.toHaveProperty('creativity');
    });
  });

  describe('NanoBanana2Builder', () => {
    it('builds correct input schema with prompt, image_input, resolution, aspect_ratio, and output_format', () => {
      const input = buildModelInput('nano-banana-2', baseInput);
      expect(input).toHaveProperty('prompt');
      expect(input).toHaveProperty('image_input');
      expect(Array.isArray(input.image_input)).toBe(true);
      expect(input).toHaveProperty('resolution');
      expect(input).toHaveProperty('aspect_ratio');
      expect(input).toHaveProperty('output_format');
    });

    it('maps scale 2 to 2K resolution and scale 4 to 4K resolution', () => {
      const input2x = buildModelInput('nano-banana-2', {
        ...baseInput,
        config: { ...baseInput.config, scale: 2 },
      });
      expect(input2x).toHaveProperty('resolution', '2K');

      const input4x = buildModelInput('nano-banana-2', {
        ...baseInput,
        config: { ...baseInput.config, scale: 4 },
      });
      expect(input4x).toHaveProperty('resolution', '4K');
    });
  });

  describe('Nano Banana resolution billing parity', () => {
    it.each([
      ['nano-banana-pro', 'ultra'],
      ['nano-banana-2', 'nano-banana-2'],
    ] as const)(
      'should send the same resolution the biller priced for %s',
      (modelId, qualityTier) => {
        const input = {
          ...baseInput,
          config: {
            ...baseInput.config,
            qualityTier,
            scale: 2 as const,
            nanoBananaProConfig: {
              aspectRatio: 'match_input_image' as const,
              resolution: '4K' as const,
              outputFormat: 'png' as const,
              safetyFilterLevel: 'block_only_high' as const,
            },
          },
        };
        const providerInput = buildModelInput(modelId, input);
        const effectiveResolution = resolveEffectiveResolution(modelId, 2, '4K');
        const billing = calculateFinalProviderAwareCredits({
          modelId,
          qualityTier,
          scale: 2,
          effectiveResolution,
        });

        expect(providerInput).toHaveProperty('resolution', effectiveResolution);
        expect(billing.effectiveResolution).toBe(providerInput.resolution);
      }
    );
  });
});
