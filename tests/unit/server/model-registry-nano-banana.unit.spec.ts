import { beforeEach, describe, expect, it } from 'vitest';

import { ModelRegistry } from '@server/services/model-registry';
import { MODEL_COSTS } from '@shared/config/model-costs.config';

describe('Model Registry: Nano Banana transport', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = ModelRegistry.getInstance();
    registry.reset();
  });

  it('routes Text Preserve through the official Replicate model', () => {
    const model = registry.getModel('nano-banana');

    expect(model).toMatchObject({
      id: 'nano-banana',
      provider: 'replicate',
      modelVersion: 'google/nano-banana',
      displayName: 'Text Preserve',
      isEnabled: true,
      creditMultiplier: 2,
      capabilities: ['text-preservation', 'enhance'],
      supportedScales: [],
    });
  });

  it('attributes the current official per-output provider cost', () => {
    expect(MODEL_COSTS.NANO_BANANA_COST).toBe(0.039);
    expect(registry.getModel('nano-banana')?.costPerRun).toBe(0.039);
  });

  it('includes Nano Banana for document Auto requests at the neutral scale only', () => {
    expect(
      registry.recommendModel({ contentType: 'document' }, 'free', 'both', 2).recommendedModel
    ).toBe('nano-banana');
    expect(
      registry.recommendModel({ contentType: 'document' }, 'free', 'both', 4).recommendedModel
    ).not.toBe('nano-banana');
  });
});
