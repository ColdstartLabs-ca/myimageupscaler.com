import { describe, expect, it } from 'vitest';

import { createModelInputContext } from '@server/services/replicate/builders/model-input.types';
import { DEFAULT_ENHANCEMENT_SETTINGS } from '@shared/types/coreflow.types';

describe('Replicate storage URL input', () => {
  it('preserves an HTTPS image reference instead of wrapping it as base64', () => {
    const signedUrl =
      'https://example.supabase.co/storage/v1/object/sign/upscale-inputs/user/image.png?token=signed';

    const context = createModelInputContext({
      imageData: signedUrl,
      mimeType: 'image/png',
      config: {
        qualityTier: 'quick',
        scale: 2,
        additionalOptions: DEFAULT_ENHANCEMENT_SETTINGS,
      },
    });

    expect(context.imageDataUrl).toBe(signedUrl);
  });
});
