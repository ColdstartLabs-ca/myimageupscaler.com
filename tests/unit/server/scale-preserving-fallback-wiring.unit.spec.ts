import { describe, expect, it } from 'vitest';
import { buildModelInput } from '@server/services/replicate/builders/model-input.builder';
import { modelInputBuilderOrchestrator } from '@server/services/replicate/builders/model-input.builder';
import { ModelRegistry } from '@server/services/model-registry';
import { SCALE_PRESERVING_FALLBACK_CANDIDATES } from '@server/services/scale-preserving-model';
import { MODEL_MAX_INPUT_PIXELS } from '@shared/config/model-costs.config';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';

/**
 * The scale-preserving fallback runs without any user-facing model picker, so
 * every link in its chain has to be wired: builder, provider support and a
 * pinned model version. A missing link only surfaces as a production failure.
 */
describe('scale-preserving fallback wiring', () => {
  const fallbackId = SCALE_PRESERVING_FALLBACK_CANDIDATES[0];

  const baseInput: IUpscaleInput = {
    imageData:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/png',
    config: {
      qualityTier: 'auto',
      scale: 2,
      additionalOptions: {
        smartAnalysis: false,
        enhance: false,
        enhanceFaces: false,
        preserveText: false,
      },
    },
  };

  it('registers an input builder for every fallback candidate', () => {
    for (const candidateId of SCALE_PRESERVING_FALLBACK_CANDIDATES) {
      expect(modelInputBuilderOrchestrator.hasBuilder(candidateId)).toBe(true);
    }
  });

  it('builds the unguarded build input with its own upscale parameter', () => {
    const input = buildModelInput(fallbackId, baseInput);

    expect(input).toHaveProperty('image');
    expect(input).toHaveProperty('upscale', 2);
    expect(input).not.toHaveProperty('scale');
  });

  it('keeps the client-side accept band identical to the server fallback band', () => {
    const clientBand = MODEL_MAX_INPUT_PIXELS['real-esrgan-large'];
    const serverBand = ModelRegistry.getInstance().getModel(fallbackId)?.maxInputPixels;

    // A client band above the server band uploads files the route then rejects.
    expect(clientBand).toBe(serverBand);
  });

  it('pins a Replicate version for the fallback model', () => {
    const modelVersion = ModelRegistry.getInstance().getModel(fallbackId)?.modelVersion ?? '';

    expect(modelVersion).toMatch(/^[\w.-]+\/[\w.-]+:[0-9a-f]{64}$/);
  });
});
