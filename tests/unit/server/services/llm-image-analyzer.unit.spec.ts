import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock OpenRouterService
const mockAnalyzeImage = vi.fn();
vi.mock('@server/services/openrouter.service', () => ({
  OpenRouterService: class {
    analyzeImage = mockAnalyzeImage;
  },
}));

// Mock ModelRegistry
vi.mock('@server/services/model-registry', () => ({
  ModelRegistry: {
    getInstance: () => ({
      getModel: (id: string) => {
        const models: Record<string, { id: string; capabilities: string[]; creditMultiplier: number }> =
          {
            'real-esrgan': {
              id: 'real-esrgan',
              capabilities: ['enhance'],
              creditMultiplier: 1,
            },
            gfpgan: {
              id: 'gfpgan',
              capabilities: ['face-restoration'],
              creditMultiplier: 2,
            },
            'nano-banana': {
              id: 'nano-banana',
              capabilities: ['text-preservation'],
              creditMultiplier: 2,
            },
            'clarity-upscaler': {
              id: 'clarity-upscaler',
              capabilities: ['enhance'],
              creditMultiplier: 4,
            },
            'nano-banana-pro': {
              id: 'nano-banana-pro',
              capabilities: ['damage-repair'],
              creditMultiplier: 8,
            },
          };
        return models[id] || null;
      },
    }),
  },
}));

import { LLMImageAnalyzer } from '@server/services/llm-image-analyzer';
import type { ModelId } from '@/shared/types/coreflow.types';

describe('LLMImageAnalyzer', () => {
  let analyzer: LLMImageAnalyzer;
  const eligibleModels: ModelId[] = ['real-esrgan', 'gfpgan', 'nano-banana'];

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = new LLMImageAnalyzer();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('analyze', () => {
    it('should use OpenRouter for analysis', async () => {
      const mockResponse = JSON.stringify({
        issues: [{ type: 'blur', severity: 'medium', description: 'Image is slightly blurry' }],
        contentType: 'photo',
        recommendedModel: 'real-esrgan',
        reasoning: 'Standard photo needs basic upscaling',
        confidence: 0.85,
        alternatives: ['gfpgan'],
        enhancementPrompt: 'Sharpen and enhance image quality',
      });
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      const result = await analyzer.analyze('base64data', 'image/jpeg', eligibleModels);

      expect(mockAnalyzeImage).toHaveBeenCalled();
      expect(result.provider).toBe('openrouter');
      expect(result.recommendedModel).toBe('real-esrgan');
    });

    it('should support raw base64 and data URLs', async () => {
      const mockResponse = JSON.stringify({
        issues: [],
        contentType: 'photo',
        recommendedModel: 'real-esrgan',
        reasoning: 'Test',
        confidence: 0.8,
        alternatives: [],
        enhancementPrompt: 'Enhance',
      });
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      // Test with raw base64
      await analyzer.analyze('rawbase64', 'image/jpeg', eligibleModels);
      expect(mockAnalyzeImage).toHaveBeenCalledWith(
        'data:image/jpeg;base64,rawbase64',
        expect.any(String)
      );

      // Test with data URL
      mockAnalyzeImage.mockClear();
      await analyzer.analyze('data:image/png;base64,alreadydataurl', 'image/png', eligibleModels);
      expect(mockAnalyzeImage).toHaveBeenCalledWith(
        'data:image/png;base64,alreadydataurl',
        expect.any(String)
      );
    });

    it('should fallback on OpenRouter error', async () => {
      mockAnalyzeImage.mockRejectedValue(new Error('API error'));

      const result = await analyzer.analyze('base64data', 'image/jpeg', eligibleModels);

      expect(result.provider).toBe('fallback');
      expect(result.recommendedModel).toBe(eligibleModels[0]);
      expect(result.reasoning).toContain('analysis unavailable');
    });

    it('should include processing time in result', async () => {
      const mockResponse = JSON.stringify({
        issues: [],
        contentType: 'photo',
        recommendedModel: 'real-esrgan',
        reasoning: 'Test',
        confidence: 0.8,
        alternatives: [],
        enhancementPrompt: 'Enhance',
      });
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      const result = await analyzer.analyze('base64data', 'image/jpeg', eligibleModels);

      expect(result.processingTimeMs).toBeDefined();
      expect(typeof result.processingTimeMs).toBe('number');
    });

    it('should parse JSON from VL response', async () => {
      // Test response with extra text around JSON
      const mockResponse = `Here's my analysis:\n${JSON.stringify({
        issues: [{ type: 'noise', severity: 'high', description: 'Heavy noise detected' }],
        contentType: 'photo',
        recommendedModel: 'nano-banana',
        reasoning: 'Noisy image needs denoising',
        confidence: 0.9,
        alternatives: ['real-esrgan'],
        enhancementPrompt: 'Remove noise while preserving detail',
      })}\nEnd of analysis.`;
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      const result = await analyzer.analyze('base64data', 'image/jpeg', eligibleModels);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('noise');
      expect(result.recommendedModel).toBe('nano-banana');
    });

    it('should handle response with no JSON', async () => {
      mockAnalyzeImage.mockResolvedValue('This image looks fine, no analysis needed.');

      const result = await analyzer.analyze('base64data', 'image/jpeg', eligibleModels);

      // Should fallback since no JSON was found
      expect(result.provider).toBe('fallback');
    });
  });

  describe('result validation', () => {
    it('should adjust recommendedModel if not in eligible list', async () => {
      const mockResponse = JSON.stringify({
        issues: [],
        contentType: 'photo',
        recommendedModel: 'clarity-upscaler', // Not in eligible list
        reasoning: 'Premium model recommended',
        confidence: 0.9,
        alternatives: ['gfpgan', 'real-esrgan'],
        enhancementPrompt: 'Enhance',
      });
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      const result = await analyzer.analyze('base64data', 'image/jpeg', eligibleModels);

      // Should pick first eligible alternative
      expect(result.recommendedModel).toBe('gfpgan');
      expect(result.reasoning).toContain('Adjusted for your subscription tier');
    });

    it('should generate default enhancement prompt if missing', async () => {
      const mockResponse = JSON.stringify({
        issues: [{ type: 'blur', severity: 'high', description: 'Very blurry' }],
        contentType: 'photo',
        recommendedModel: 'real-esrgan',
        reasoning: 'Test',
        confidence: 0.8,
        alternatives: [],
        // No enhancementPrompt
      });
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      const result = await analyzer.analyze('base64data', 'image/jpeg', eligibleModels);

      expect(result.enhancementPrompt).toBeDefined();
      expect(result.enhancementPrompt).toContain('sharpen');
    });
  });

  describe('default result', () => {
    it('should return first eligible model on fallback', async () => {
      mockAnalyzeImage.mockRejectedValue(new Error('API unavailable'));

      const result = await analyzer.analyze('base64data', 'image/jpeg', eligibleModels);

      expect(result.recommendedModel).toBe('real-esrgan');
      expect(result.confidence).toBe(0.5);
      expect(result.provider).toBe('fallback');
    });

    it('should include alternatives from eligible models', async () => {
      mockAnalyzeImage.mockRejectedValue(new Error('API unavailable'));

      const result = await analyzer.analyze('base64data', 'image/jpeg', eligibleModels);

      expect(result.alternatives).toEqual(['gfpgan', 'nano-banana']);
    });
  });
});
