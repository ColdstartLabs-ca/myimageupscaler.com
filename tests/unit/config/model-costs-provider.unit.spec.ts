import { describe, expect, it } from 'vitest';
import { MODEL_COSTS } from '@shared/config/model-costs.config';

describe('provider model costs', () => {
  it('should use the current Nano Banana Pro 1K/2K output price', () => {
    expect(MODEL_COSTS.NANO_BANANA_PRO_COST).toBe(0.15);
  });
});
