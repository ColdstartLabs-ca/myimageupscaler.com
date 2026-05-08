import { describe, it, expect } from 'vitest';
import { buildModelInput } from '@server/services/replicate/builders/model-input.builder';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';

describe('Replicate Builders: New Upscalers', () => {
  const baseInput: IUpscaleInput = {
    imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
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
});
