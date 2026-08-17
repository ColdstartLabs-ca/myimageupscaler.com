import { describe, expect, it } from 'vitest';
import { resolveScalePreservingModel } from '@server/services/scale-preserving-model';

describe('resolveScalePreservingModel', () => {
  it('keeps Real-ESRGAN when the original input fits its provider limit', () => {
    expect(
      resolveScalePreservingModel({
        modelId: 'real-esrgan',
        width: 1448,
        height: 1448,
        scale: 2,
      })
    ).toEqual({ modelId: 'real-esrgan', usedFallback: false });
  });

  it('uses the unguarded Real-ESRGAN build for Quick 2x when the default model cannot fit the original', () => {
    expect(
      resolveScalePreservingModel({
        modelId: 'real-esrgan',
        width: 2048,
        height: 2048,
        scale: 2,
      })
    ).toEqual({ modelId: 'real-esrgan-large', usedFallback: true });
  });

  it('does not route unverified extreme aspect ratios through the fallback', () => {
    expect(
      resolveScalePreservingModel({
        modelId: 'real-esrgan',
        width: 8192,
        height: 512,
        scale: 2,
      })
    ).toEqual({ modelId: 'real-esrgan', usedFallback: false });
  });

  it('does not silently substitute an unproven 4x path', () => {
    expect(
      resolveScalePreservingModel({
        modelId: 'real-esrgan',
        width: 2048,
        height: 2048,
        scale: 4,
      })
    ).toEqual({ modelId: 'real-esrgan', usedFallback: false });
  });
});
