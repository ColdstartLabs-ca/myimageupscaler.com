import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../../server/services/model-registry';
import type { IModelConfig } from '../../server/services/model-registry.types';
import { QUALITY_TIER_CONFIG, QUALITY_TIER_SCALES } from '../../shared/types/coreflow.types';

describe('Model Registry: Accurate Scale Support (PRD: True Image Upscaling)', () => {
  let registry: ModelRegistry;

  beforeAll(() => {
    registry = ModelRegistry.getInstance();
  });

  describe('Phase 1: Model supportedScales Accuracy', () => {
    describe('real-esrgan (Quick tier)', () => {
      let model: IModelConfig | null;

      beforeAll(() => {
        model = registry.getModel('real-esrgan');
      });

      it('should only support 2x and 4x scales', () => {
        expect(model?.supportedScales).toEqual([2, 4]);
        expect(model?.supportedScales).not.toContain(8);
      });

      it('should have upscale capability', () => {
        expect(model?.capabilities).toContain('upscale');
      });
    });

    describe('gfpgan (Face Restore tier)', () => {
      let model: IModelConfig | null;

      beforeAll(() => {
        model = registry.getModel('gfpgan');
      });

      it('should only support 2x and 4x scales', () => {
        expect(model?.supportedScales).toEqual([2, 4]);
        expect(model?.supportedScales).not.toContain(8);
      });

      it('should have upscale capability', () => {
        expect(model?.capabilities).toContain('upscale');
      });
    });

    describe('flux-2-pro (Face Pro tier)', () => {
      let model: IModelConfig | null;

      beforeAll(() => {
        model = registry.getModel('flux-2-pro');
      });

      it('should have empty supportedScales (enhancement-only)', () => {
        expect(model?.supportedScales).toEqual([]);
        expect(model?.supportedScales).not.toContain(2);
        expect(model?.supportedScales).not.toContain(4);
        expect(model?.supportedScales).not.toContain(8);
      });

      it('should NOT have upscale capability', () => {
        expect(model?.capabilities).not.toContain('upscale');
      });

      it('should have enhance capability', () => {
        expect(model?.capabilities).toContain('enhance');
      });

      it('should have face-restoration capability', () => {
        expect(model?.capabilities).toContain('face-restoration');
      });
    });

    describe('qwen-image-edit (Budget Edit tier)', () => {
      let model: IModelConfig | null;

      beforeAll(() => {
        model = registry.getModel('qwen-image-edit');
      });

      it('should have empty supportedScales (enhancement-only)', () => {
        expect(model?.supportedScales).toEqual([]);
        expect(model?.supportedScales).not.toContain(2);
        expect(model?.supportedScales).not.toContain(4);
        expect(model?.supportedScales).not.toContain(8);
      });

      it('should NOT have upscale capability', () => {
        expect(model?.capabilities).not.toContain('upscale');
      });

      it('should have enhance capability', () => {
        expect(model?.capabilities).toContain('enhance');
      });
    });

    describe('p-image-edit (Fast Edit tier)', () => {
      let model: IModelConfig | null;

      beforeAll(() => {
        model = registry.getModel('p-image-edit');
      });

      it('should have empty supportedScales (enhancement-only)', () => {
        expect(model?.supportedScales).toEqual([]);
        expect(model?.supportedScales).not.toContain(2);
        expect(model?.supportedScales).not.toContain(4);
        expect(model?.supportedScales).not.toContain(8);
      });

      it('should NOT have upscale capability', () => {
        expect(model?.capabilities).not.toContain('upscale');
      });

      it('should have enhance capability', () => {
        expect(model?.capabilities).toContain('enhance');
      });
    });

    describe('clarity-upscaler (HD Upscale tier)', () => {
      let model: IModelConfig | null;

      beforeAll(() => {
        model = registry.getModel('clarity-upscaler');
      });

      it('should support 2x, 4x, and 8x scales', () => {
        expect(model?.supportedScales).toEqual([2, 4, 8]);
      });

      it('should have upscale capability', () => {
        expect(model?.capabilities).toContain('upscale');
      });
    });

    describe('nano-banana-pro (Ultra tier)', () => {
      let model: IModelConfig | null;

      beforeAll(() => {
        model = registry.getModel('nano-banana-pro');
      });

      it('should only support 2x and 4x scales (resolution-based, not true 8x)', () => {
        expect(model?.supportedScales).toEqual([2, 4]);
        expect(model?.supportedScales).not.toContain(8);
      });

      it('should have upscale capability', () => {
        expect(model?.capabilities).toContain('upscale');
      });
    });
  });

  describe('Quality Tier to Model Scale Mapping', () => {
    it('should have consistent scales between QUALITY_TIER_SCALES and model supportedScales', () => {
      Object.entries(QUALITY_TIER_CONFIG).forEach(([tier, config]) => {
        if (tier === 'auto') return; // Auto tier is special
        if (!config.modelId) return; // Skip tiers without a model (bg-removal)

        const modelId = config.modelId;
        const model = registry.getModel(modelId);
        const tierScales = QUALITY_TIER_SCALES[tier];

        expect(model).not.toBeNull();
        expect(model?.supportedScales).toEqual(tierScales);
      });
    });
  });
});
