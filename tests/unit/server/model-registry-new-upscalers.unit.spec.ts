import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from '@server/services/model-registry';

describe('Model Registry: New Upscalers', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = ModelRegistry.getInstance();
    registry.reset();
  });

  describe('clarity-pro-upscaler', () => {
    it('registers with correct metadata', () => {
      const model = registry.getModel('clarity-pro-upscaler');
      expect(model).not.toBeNull();
      expect(model!.id).toBe('clarity-pro-upscaler');
      expect(model!.displayName).toBe('Clarity Pro');
      expect(model!.provider).toBe('replicate');
      expect(model!.capabilities).toContain('upscale');
      expect(model!.capabilities).toContain('enhance');
      expect(model!.capabilities).toContain('face-restoration');
      expect(model!.supportedScales).toContain(2);
      expect(model!.supportedScales).toContain(4);
      expect(model!.supportedScales).toContain(8);
      expect(model!.supportedScales).not.toContain(16);
      expect(model!.tierRestriction).toBe('hobby');
    });

    it('uses the correct default version', () => {
      const model = registry.getModel('clarity-pro-upscaler');
      expect(model!.modelVersion).toBe(
        'philz1337x/clarity-pro-upscaler:8e33eb474936d75d3ceaa787f3e66f5ba16f35db0853a7697a4ca4e5fc14b6cd'
      );
    });
  });

  describe('recraft-crisp-upscale', () => {
    it('registers as fixed-scale image-only model', () => {
      const model = registry.getModel('recraft-crisp-upscale');
      expect(model).not.toBeNull();
      expect(model!.id).toBe('recraft-crisp-upscale');
      expect(model!.displayName).toBe('Crisp Upscale');
      expect(model!.provider).toBe('replicate');
      expect(model!.capabilities).toContain('enhance');
      expect(model!.capabilities).toContain('4k-output');
      expect(model!.supportedScales).toHaveLength(0);
      expect(model!.tierRestriction).toBe('hobby');
    });

    it('uses the correct default version', () => {
      const model = registry.getModel('recraft-crisp-upscale');
      expect(model!.modelVersion).toBe(
        'recraft-ai/recraft-crisp-upscale:2177c1e3a177f5a76c632e467c32b413e424c23d84e43f7b036a965e305f6557'
      );
    });
  });
});
