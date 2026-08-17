import { describe, expect, it } from 'vitest';
import { buildModelInput } from '@server/services/replicate/builders/model-input.builder';
import { ModelRegistry } from '@server/services/model-registry';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';

/**
 * xinntao/realesrgan processes the image and then fails on every run with
 * "Cog: Got error trying to upload output files" - reproduced 5/5 at 1.2MP
 * with the production parameters, at both 2x and 4x. The Anime Upscale tier
 * has zero successful predictions on the account because of it.
 */
const BROKEN_ANIME_MODEL = 'xinntao/realesrgan';

describe('anime upscale model', () => {
  const modelVersion = ModelRegistry.getInstance().getModel('realesrgan-anime')?.modelVersion ?? '';

  const baseInput: IUpscaleInput = {
    imageData:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/png',
    config: {
      qualityTier: 'anime-upscale',
      scale: 2,
      additionalOptions: {
        smartAnalysis: false,
        enhance: false,
        enhanceFaces: false,
        preserveText: false,
      },
    },
  };

  it('does not point the anime tier at the model that cannot return its output', () => {
    expect(modelVersion.startsWith(`${BROKEN_ANIME_MODEL}:`)).toBe(false);
  });

  it('pins a Replicate version for the anime model', () => {
    expect(modelVersion).toMatch(/^[\w.-]+\/[\w.-]+:[0-9a-f]{64}$/);
  });

  it('keeps the anime6B input schema the replacement expects', () => {
    const input = buildModelInput('realesrgan-anime', baseInput);

    expect(input).toHaveProperty('img');
    expect(input).toHaveProperty('scale', 2);
    expect(input).toHaveProperty('version', 'Anime - anime6B');
    expect(input).toHaveProperty('face_enhance', false);
  });

  it('caps the anime scale at 4x', () => {
    const input = buildModelInput('realesrgan-anime', {
      ...baseInput,
      config: { ...baseInput.config, scale: 8 },
    });

    expect(input).toHaveProperty('scale', 4);
  });
});
