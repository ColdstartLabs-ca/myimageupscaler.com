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
        const models: Record<
          string,
          { id: string; capabilities: string[]; creditMultiplier: number }
        > = {
          'real-esrgan': {
            id: 'real-esrgan',
            capabilities: ['upscale'],
            creditMultiplier: 1,
          },
          gfpgan: {
            id: 'gfpgan',
            capabilities: ['upscale', 'face-restoration'],
            creditMultiplier: 2,
          },
          'nano-banana': {
            id: 'nano-banana',
            capabilities: ['upscale', 'text-preservation'],
            creditMultiplier: 2,
          },
          'clarity-upscaler': {
            id: 'clarity-upscaler',
            capabilities: ['upscale', 'face-restoration'],
            creditMultiplier: 4,
          },
          'nano-banana-pro': {
            id: 'nano-banana-pro',
            capabilities: ['upscale', 'damage-repair'],
            creditMultiplier: 8,
          },
          'flux-2-pro': {
            id: 'flux-2-pro',
            capabilities: ['face-restoration'],
            creditMultiplier: 5,
          },
          'qwen-image-edit': {
            id: 'qwen-image-edit',
            capabilities: ['enhance'],
            creditMultiplier: 3,
          },
          seedream: {
            id: 'seedream',
            capabilities: ['enhance'],
            creditMultiplier: 3,
          },
          'realesrgan-anime': {
            id: 'realesrgan-anime',
            capabilities: ['upscale'],
            creditMultiplier: 2,
          },
        };
        return models[id] || null;
      },
    }),
  },
}));

import { LLMImageAnalyzer, buildAnalysisPrompt } from '@server/services/llm-image-analyzer';
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

describe('buildAnalysisPrompt', () => {
  it('should build prompt with upscalers and enhancers sections', () => {
    const eligibleModels: ModelId[] = ['real-esrgan', 'seedream'];
    const prompt = buildAnalysisPrompt(eligibleModels);

    expect(prompt).toContain('UPSCALING MODELS');
    expect(prompt).toContain('ENHANCEMENT-ONLY MODELS');
    expect(prompt).toContain('real-esrgan (1x credits)');
    expect(prompt).toContain('seedream (3x credits)');
  });

  it('should only include upscalers section when no enhancers', () => {
    const eligibleModels: ModelId[] = ['real-esrgan', 'gfpgan'];
    const prompt = buildAnalysisPrompt(eligibleModels);

    expect(prompt).toContain('UPSCALING MODELS');
    expect(prompt).toContain('real-esrgan (1x credits)');
    expect(prompt).toContain('gfpgan (2x credits)');
    expect(prompt).not.toContain('ENHANCEMENT-ONLY MODELS');
  });

  it('should only include enhancers section when no upscalers', () => {
    const eligibleModels: ModelId[] = ['flux-2-pro'];
    const prompt = buildAnalysisPrompt(eligibleModels);

    expect(prompt).toContain('ENHANCEMENT-ONLY MODELS');
    expect(prompt).toContain('flux-2-pro (5x credits)');
    expect(prompt).not.toContain('UPSCALING MODELS');
  });

  it('should include all known model descriptions', () => {
    const eligibleModels: ModelId[] = [
      'real-esrgan',
      'gfpgan',
      'nano-banana',
      'clarity-upscaler',
      'nano-banana-pro',
      'flux-2-pro',
      'qwen-image-edit',
      'seedream',
      'realesrgan-anime',
    ];
    const prompt = buildAnalysisPrompt(eligibleModels);

    expect(prompt).toContain('real-esrgan (1x credits): Fast general upscaler');
    expect(prompt).toContain('gfpgan (2x credits): Face restoration + upscaling');
    expect(prompt).toContain('nano-banana (2x credits): Text/logo preserving upscaler');
    expect(prompt).toContain('clarity-upscaler (4x credits): Premium face restoration');
    expect(prompt).toContain('nano-banana-pro (8x credits): Premium all-purpose upscaler');
    expect(prompt).toContain('flux-2-pro (5x credits): Premium face enhancement (NO upscaling)');
    expect(prompt).toContain('qwen-image-edit (3x credits): AI enhancement (NO upscaling)');
    expect(prompt).toContain('seedream (3x credits): AI enhancement (NO upscaling)');
    expect(prompt).toContain('realesrgan-anime (2x credits): Anime/illustration upscaler');
  });

  it('should use fallback description for unknown models', () => {
    const eligibleModels: ModelId[] = ['real-esrgan' as ModelId];
    const prompt = buildAnalysisPrompt(eligibleModels);

    expect(prompt).toContain('real-esrgan (1x credits)');
  });

  it('should include analysis rules section', () => {
    const prompt = buildAnalysisPrompt(['real-esrgan']);

    expect(prompt).toContain('ANALYSIS RULES');
    expect(prompt).toContain('Detect content type');
    expect(prompt).toContain('Identify quality issues');
    expect(prompt).toContain('Match the best model');
  });

  it('should include JSON response format', () => {
    const prompt = buildAnalysisPrompt(['real-esrgan']);

    expect(prompt).toContain('Respond with ONLY valid JSON');
    expect(prompt).toContain('"issues"');
    expect(prompt).toContain('"contentType"');
    expect(prompt).toContain('"recommendedModel"');
    expect(prompt).toContain('"reasoning"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"alternatives"');
    expect(prompt).toContain('"enhancementPrompt"');
  });

  it('should include all issue types', () => {
    const prompt = buildAnalysisPrompt(['real-esrgan']);

    expect(prompt).toContain('ISSUE TYPES');
    expect(prompt).toContain('- blur:');
    expect(prompt).toContain('- noise:');
    expect(prompt).toContain('- compression:');
    expect(prompt).toContain('- damage:');
    expect(prompt).toContain('- low_resolution:');
    expect(prompt).toContain('- faces:');
    expect(prompt).toContain('- text:');
  });

  it('should include valid models list', () => {
    const eligibleModels: ModelId[] = ['real-esrgan', 'gfpgan', 'nano-banana'];
    const prompt = buildAnalysisPrompt(eligibleModels);

    expect(prompt).toContain('VALID MODELS: real-esrgan, gfpgan, nano-banana');
  });

  it('should include enhancementPrompt guidelines', () => {
    const prompt = buildAnalysisPrompt(['real-esrgan']);

    expect(prompt).toContain('enhancementPrompt GUIDELINES');
    expect(prompt).toContain('Be specific about what to fix');
    expect(prompt).toContain('Mention specific areas if relevant');
    expect(prompt).toContain('Keep natural');
  });

  it('should include content type options', () => {
    const prompt = buildAnalysisPrompt(['real-esrgan']);

    expect(prompt).toContain(
      '"contentType": "photo|portrait|document|vintage|product|artwork|anime"'
    );
  });

  it('should handle empty eligible models list', () => {
    const prompt = buildAnalysisPrompt([]);

    expect(prompt).toContain('ANALYSIS RULES');
    expect(prompt).toContain('VALID MODELS: ');
  });
});

describe('generateDefaultEnhancementPrompt (via LLMImageAnalyzer)', () => {
  const eligibleModels: ModelId[] = ['real-esrgan'];

  it('should generate prompt for blur issue', async () => {
    const mockResponse = JSON.stringify({
      issues: [{ type: 'blur', severity: 'high', description: 'Very blurry image' }],
      contentType: 'photo',
      recommendedModel: 'real-esrgan',
      reasoning: 'Test',
      confidence: 0.8,
      alternatives: [],
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.enhancementPrompt).toContain('sharpen and restore detail');
  });

  it('should generate prompt for noise issue', async () => {
    const mockResponse = JSON.stringify({
      issues: [{ type: 'noise', severity: 'high', description: 'Noisy image' }],
      contentType: 'photo',
      recommendedModel: 'real-esrgan',
      reasoning: 'Test',
      confidence: 0.8,
      alternatives: [],
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.enhancementPrompt).toContain('reduce noise while preserving detail');
  });

  it('should generate prompt for damage issue', async () => {
    const mockResponse = JSON.stringify({
      issues: [{ type: 'damage', severity: 'high', description: 'Scratched photo' }],
      contentType: 'photo',
      recommendedModel: 'real-esrgan',
      reasoning: 'Test',
      confidence: 0.8,
      alternatives: [],
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.enhancementPrompt).toContain('repair damaged areas');
  });

  it('should generate prompt for faces issue', async () => {
    const mockResponse = JSON.stringify({
      issues: [{ type: 'faces', severity: 'high', description: 'Faces need restoration' }],
      contentType: 'portrait',
      recommendedModel: 'gfpgan',
      reasoning: 'Test',
      confidence: 0.8,
      alternatives: [],
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.enhancementPrompt).toContain('restore facial features');
  });

  it('should generate prompt for compression issue', async () => {
    const mockResponse = JSON.stringify({
      issues: [{ type: 'compression', severity: 'high', description: 'JPEG artifacts' }],
      contentType: 'photo',
      recommendedModel: 'real-esrgan',
      reasoning: 'Test',
      confidence: 0.8,
      alternatives: [],
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.enhancementPrompt).toContain('remove compression artifacts');
  });

  it('should use description for unknown issue types', async () => {
    const mockResponse = JSON.stringify({
      issues: [{ type: 'low_resolution', severity: 'high', description: 'Image is too small' }],
      contentType: 'photo',
      recommendedModel: 'real-esrgan',
      reasoning: 'Test',
      confidence: 0.8,
      alternatives: [],
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.enhancementPrompt).toContain('Image is too small');
  });

  it('should combine multiple high severity issues', async () => {
    const mockResponse = JSON.stringify({
      issues: [
        { type: 'blur', severity: 'high', description: 'Blurry' },
        { type: 'noise', severity: 'high', description: 'Noisy' },
      ],
      contentType: 'photo',
      recommendedModel: 'real-esrgan',
      reasoning: 'Test',
      confidence: 0.8,
      alternatives: [],
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.enhancementPrompt).toContain('sharpen and restore detail');
    expect(result.enhancementPrompt).toContain('reduce noise while preserving detail');
  });

  it('should ignore low severity issues when generating prompt', async () => {
    const mockResponse = JSON.stringify({
      issues: [{ type: 'blur', severity: 'low', description: 'Slightly blurry' }],
      contentType: 'photo',
      recommendedModel: 'real-esrgan',
      reasoning: 'Test',
      confidence: 0.8,
      alternatives: [],
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.enhancementPrompt).toBe('Upscale and enhance image quality');
  });

  it('should use default prompt when no high severity issues exist', async () => {
    const mockResponse = JSON.stringify({
      issues: [],
      contentType: 'photo',
      recommendedModel: 'real-esrgan',
      reasoning: 'Test',
      confidence: 0.8,
      alternatives: [],
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.enhancementPrompt).toBe('Upscale and enhance image quality');
  });
});

describe('findBestEligibleModel edge cases (via LLMImageAnalyzer)', () => {
  const eligibleModels: ModelId[] = ['real-esrgan', 'gfpgan'];

  it('should use first eligible model when no alternatives match', async () => {
    const mockResponse = JSON.stringify({
      issues: [],
      contentType: 'photo',
      recommendedModel: 'clarity-upscaler', // Not eligible
      reasoning: 'Premium model',
      confidence: 0.8,
      alternatives: ['nano-banana-pro', 'flux-2-pro'], // Also not eligible
      enhancementPrompt: 'Enhance',
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.recommendedModel).toBe('real-esrgan');
  });

  it('should handle empty alternatives array', async () => {
    const mockResponse = JSON.stringify({
      issues: [],
      contentType: 'photo',
      recommendedModel: 'clarity-upscaler', // Not eligible
      reasoning: 'Premium model',
      confidence: 0.8,
      alternatives: [],
      enhancementPrompt: 'Enhance',
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.recommendedModel).toBe('real-esrgan');
  });
});

describe('validateAndAdjustResult edge cases (via LLMImageAnalyzer)', () => {
  const eligibleModels: ModelId[] = ['real-esrgan', 'gfpgan'];

  it('should handle result with missing alternatives', async () => {
    const mockResponse = JSON.stringify({
      issues: [],
      contentType: 'photo',
      recommendedModel: 'real-esrgan',
      reasoning: 'Test',
      confidence: 0.8,
      // No alternatives field
      enhancementPrompt: 'Enhance',
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.recommendedModel).toBe('real-esrgan');
  });

  it('should preserve valid recommendedModel', async () => {
    const mockResponse = JSON.stringify({
      issues: [],
      contentType: 'photo',
      recommendedModel: 'gfpgan', // Eligible
      reasoning: 'Portrait enhancement',
      confidence: 0.9,
      alternatives: ['real-esrgan'],
      enhancementPrompt: 'Enhance',
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.recommendedModel).toBe('gfpgan');
    expect(result.reasoning).not.toContain('Adjusted for your subscription tier');
  });

  it('should add tier adjustment message to reasoning when adjusted', async () => {
    const mockResponse = JSON.stringify({
      issues: [],
      contentType: 'photo',
      recommendedModel: 'clarity-upscaler',
      reasoning: 'Premium quality needed',
      confidence: 0.9,
      alternatives: ['gfpgan'],
      enhancementPrompt: 'Enhance',
    });
    mockAnalyzeImage.mockResolvedValue(mockResponse);

    const result = await new LLMImageAnalyzer().analyze('base64', 'image/jpeg', eligibleModels);

    expect(result.reasoning).toContain('Premium quality needed');
    expect(result.reasoning).toContain('Adjusted for your subscription tier');
  });
});

// =======================================
// Tests for suggestTier parameter (BUG FIX)
// When suggestTier=false, AI should NOT recommend a model
// =======================================
describe('suggestTier parameter', () => {
  const eligibleModels: ModelId[] = ['real-esrgan', 'gfpgan', 'nano-banana'];

  describe('buildAnalysisPrompt with suggestTier', () => {
    it('should include model recommendation in prompt when suggestTier is true (default)', () => {
      const prompt = buildAnalysisPrompt(eligibleModels, true);

      // Should include model sections
      expect(prompt).toContain('UPSCALING MODELS');
      expect(prompt).toContain('VALID MODELS');
      // Should ask for recommendedModel in response format
      expect(prompt).toContain('"recommendedModel"');
      expect(prompt).toContain('"reasoning"');
      expect(prompt).toContain('"alternatives"');
    });

    it('should NOT include model recommendation in prompt when suggestTier is false', () => {
      const prompt = buildAnalysisPrompt(eligibleModels, false);

      // Should NOT include model sections
      expect(prompt).not.toContain('UPSCALING MODELS');
      expect(prompt).not.toContain('ENHANCEMENT-ONLY MODELS');
      expect(prompt).not.toContain('VALID MODELS');
      // Should NOT ask for recommendedModel in response format
      expect(prompt).not.toContain('"recommendedModel"');
      expect(prompt).not.toContain('"reasoning"');
      expect(prompt).not.toContain('"alternatives"');
      // Should indicate user selected their own model
      expect(prompt).toContain('DO NOT recommend a model');
      expect(prompt).toContain('user has already selected');
    });

    it('should still include enhancement analysis in prompt when suggestTier is false', () => {
      const prompt = buildAnalysisPrompt(eligibleModels, false);

      // Should still include issue detection and enhancement prompt
      expect(prompt).toContain('"issues"');
      expect(prompt).toContain('"contentType"');
      expect(prompt).toContain('"confidence"');
      expect(prompt).toContain('"enhancementPrompt"');
      expect(prompt).toContain('ISSUE TYPES');
    });
  });

  describe('LLMImageAnalyzer.analyze with suggestTier', () => {
    it('should use full model recommendation when suggestTier is true (default)', async () => {
      const mockResponse = JSON.stringify({
        issues: [{ type: 'faces', severity: 'high', description: 'Faces detected' }],
        contentType: 'portrait',
        recommendedModel: 'gfpgan',
        reasoning: 'Portrait with faces needs face restoration',
        confidence: 0.9,
        alternatives: ['real-esrgan'],
        enhancementPrompt: 'Restore facial details',
      });
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      const result = await new LLMImageAnalyzer().analyze(
        'base64',
        'image/jpeg',
        eligibleModels,
        true // suggestTier=true
      );

      // Should return AI's model recommendation
      expect(result.recommendedModel).toBe('gfpgan');
      expect(result.reasoning).toBe('Portrait with faces needs face restoration');
      expect(result.alternatives).toEqual(['real-esrgan']);
    });

    it('should NOT use AI model recommendation when suggestTier is false', async () => {
      // AI response without model recommendation (enhancement-only format)
      const mockResponse = JSON.stringify({
        issues: [{ type: 'faces', severity: 'high', description: 'Faces detected' }],
        contentType: 'portrait',
        confidence: 0.9,
        enhancementPrompt: 'Restore facial details and improve clarity',
      });
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      const result = await new LLMImageAnalyzer().analyze(
        'base64',
        'image/jpeg',
        eligibleModels,
        false // suggestTier=false
      );

      // Should have placeholder values for model recommendation (won't be used)
      expect(result.recommendedModel).toBe('real-esrgan'); // Placeholder
      expect(result.reasoning).toContain('Enhancement-only analysis');
      expect(result.alternatives).toEqual([]);
      // Should preserve enhancement data
      expect(result.issues).toHaveLength(1);
      expect(result.contentType).toBe('portrait');
      expect(result.enhancementPrompt).toBe('Restore facial details and improve clarity');
    });

    it('should still detect issues when suggestTier is false', async () => {
      const mockResponse = JSON.stringify({
        issues: [
          { type: 'blur', severity: 'high', description: 'Image is blurry' },
          { type: 'noise', severity: 'medium', description: 'Some noise detected' },
        ],
        contentType: 'photo',
        confidence: 0.85,
        enhancementPrompt: 'Sharpen and reduce noise',
      });
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      const result = await new LLMImageAnalyzer().analyze(
        'base64',
        'image/jpeg',
        eligibleModels,
        false
      );

      // Issues should be preserved for enhancement suggestions
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].type).toBe('blur');
      expect(result.issues[1].type).toBe('noise');
      expect(result.enhancementPrompt).toBe('Sharpen and reduce noise');
    });

    it('should fallback correctly when suggestTier is false and API fails', async () => {
      mockAnalyzeImage.mockRejectedValue(new Error('API error'));

      const result = await new LLMImageAnalyzer().analyze(
        'base64',
        'image/jpeg',
        eligibleModels,
        false
      );

      expect(result.provider).toBe('fallback');
      // Fallback should have placeholder values for recommendation
      expect(result.recommendedModel).toBe('real-esrgan');
      expect(result.reasoning).toContain('Enhancement-only analysis');
      expect(result.alternatives).toEqual([]);
    });
  });

  describe('regression: explicit tier with smart analysis should NOT recommend different model', () => {
    /**
     * BUG FIX TEST: When user selects "Budget Edit" tier with Smart Analysis ON:
     * - The AI should NOT recommend a different model (like "Seedream Edit")
     * - The system should use the user's selected model
     * - The AI should only provide enhancement suggestions
     */
    it('should use enhancement-only prompt when suggestTier is false', async () => {
      // Mock an AI response that would have recommended seedream if asked
      const mockResponse = JSON.stringify({
        issues: [{ type: 'damage', severity: 'high', description: 'Image has artifacts' }],
        contentType: 'photo',
        confidence: 0.9,
        enhancementPrompt: 'Remove artifacts and enhance details',
        // Note: AI response does NOT include recommendedModel when suggestTier=false
      });
      mockAnalyzeImage.mockResolvedValue(mockResponse);

      const result = await new LLMImageAnalyzer().analyze(
        'base64',
        'image/jpeg',
        eligibleModels,
        false // User already selected their tier, don't suggest
      );

      // The prompt should NOT ask for recommendedModel as a JSON field
      // (it's ok if it mentions it in a NOTE saying "don't include")
      const promptArg = mockAnalyzeImage.mock.calls[0][1];
      expect(promptArg).toContain('Enhancement Only Mode');
      expect(promptArg).toContain('DO NOT recommend a model');
      // The JSON response format should NOT have recommendedModel as a required field
      expect(promptArg).not.toContain('"recommendedModel": "model-id-here"');
      // Should NOT include VALID MODELS list (model selection is not needed)
      expect(promptArg).not.toContain('VALID MODELS:');

      // Result should have placeholder recommendation (won't be used by caller)
      expect(result.recommendedModel).toBe('real-esrgan'); // Placeholder
      // But enhancement data should be preserved
      expect(result.enhancementPrompt).toBe('Remove artifacts and enhance details');
      expect(result.issues[0].type).toBe('damage');
    });
  });
});
