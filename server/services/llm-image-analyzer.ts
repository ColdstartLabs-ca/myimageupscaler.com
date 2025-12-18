import Replicate from 'replicate';
import { serverEnv } from '@shared/config/env';
import { ModelRegistry } from './model-registry';
import type { ILLMAnalysisResult } from './llm-image-analyzer.types';
import type { ModelId } from '@shared/types/pixelperfect';
import { withRetry, isRateLimitError } from '@server/utils/retry';

/**
 * Build the analysis prompt dynamically based on eligible models
 * This ensures the VL model only recommends from available models
 */
function buildAnalysisPrompt(eligibleModelIds: ModelId[]): string {
  const registry = ModelRegistry.getInstance();

  // Build model descriptions dynamically from registry
  const modelDescriptions = eligibleModelIds
    .map(id => {
      const model = registry.getModel(id);
      if (!model) return null;

      // Generate use-case description based on capabilities
      const capabilities = model.capabilities;
      let useCase = '';

      if (capabilities.includes('face-restoration')) {
        useCase =
          'Face restoration specialist. Best for portraits, old family photos, images with faces.';
      } else if (capabilities.includes('text-preservation')) {
        useCase = 'Text and logo preservation. Best for documents, screenshots, images with text.';
      } else if (capabilities.includes('damage-repair') && model.creditMultiplier >= 8) {
        useCase =
          'Premium heavy restoration. Best for severely damaged, very old, or heavily degraded images.';
      } else if (capabilities.includes('enhance') && model.creditMultiplier >= 4) {
        useCase =
          'High-quality upscaling with detail enhancement. Best for photos with moderate noise.';
      } else {
        useCase = 'Fast general upscaling. Best for clean images needing higher resolution.';
      }

      return `- ${id}: ${useCase}`;
    })
    .filter(Boolean)
    .join('\n');

  const modelIdList = eligibleModelIds.join('|');

  return `You are an image quality analyst for a photo restoration service. Analyze this image and determine what improvements it needs.

Available restoration models:
${modelDescriptions}

Analyze the image and respond with ONLY valid JSON (no markdown, no explanation):
{
  "issues": [{ "type": "blur|noise|compression|damage|low_resolution|faces|text", "severity": "low|medium|high", "description": "..." }],
  "contentType": "photo|portrait|document|vintage|product|artwork",
  "recommendedModel": "${modelIdList}",
  "reasoning": "Brief explanation",
  "confidence": 0.0-1.0,
  "alternatives": ["model-id", ...],
  "enhancementPrompt": "Specific instructions for the enhancement model, e.g., 'Restore facial details, reduce film grain, fix scratches on upper left'"
}

The enhancementPrompt should be a detailed instruction for the restoration model describing exactly what to fix.
Prioritize accuracy over complexity - if a simple upscale will suffice, recommend the basic upscaler.
IMPORTANT: Only recommend models from the available list above.`;
}

export class LLMImageAnalyzer {
  private replicate: Replicate;

  constructor() {
    this.replicate = new Replicate({ auth: serverEnv.REPLICATE_API_TOKEN });
  }

  async analyze(
    base64Image: string,
    mimeType: string,
    eligibleModels: ModelId[]
  ): Promise<ILLMAnalysisResult> {
    const startTime = Date.now();
    // Support both raw base64 and data URLs
    const dataUrl = base64Image.startsWith('data:')
      ? base64Image
      : `data:${mimeType};base64,${base64Image}`;

    // Try Replicate (Qwen3-VL)
    try {
      const result = await this.analyzeWithReplicate(dataUrl, eligibleModels);
      return {
        ...result,
        provider: 'replicate',
        processingTimeMs: Date.now() - startTime,
      };
    } catch (replicateError) {
      console.error('Replicate analysis failed, using default fallback:', replicateError);
      return {
        ...this.getDefaultResult(eligibleModels),
        provider: 'fallback',
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  private async analyzeWithReplicate(
    imageDataUrl: string,
    eligibleModels: ModelId[]
  ): Promise<Omit<ILLMAnalysisResult, 'provider' | 'processingTimeMs'>> {
    // Build prompt dynamically based on eligible models
    const prompt = buildAnalysisPrompt(eligibleModels);

    console.log('[LLM Analyzer] Replicate prompt:', prompt);

    // Run with retry for rate limits
    const output = await withRetry(
      () =>
        this.replicate.run(serverEnv.QWEN_VL_MODEL_VERSION as `${string}/${string}:${string}`, {
          input: {
            image: imageDataUrl,
            prompt,
            max_tokens: 1024,
            temperature: 0.2,
          },
        }),
      {
        shouldRetry: err => isRateLimitError(err.message),
        onRetry: (attempt, delayMs) => {
          console.log(
            `[LLM Analyzer] Rate limited, retrying in ${delayMs}ms (attempt ${attempt}/3)`
          );
        },
      }
    );

    // Qwen returns text, parse JSON from response
    const responseText = Array.isArray(output) ? output.join('') : String(output);
    console.log('[LLM Analyzer] Replicate response:', responseText);

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Replicate response');
    }

    const result = JSON.parse(jsonMatch[0]) as ILLMAnalysisResult;
    return this.validateAndAdjustResult(result, eligibleModels);
  }

  private validateAndAdjustResult(
    result: ILLMAnalysisResult,
    eligibleModels: ModelId[]
  ): Omit<ILLMAnalysisResult, 'provider' | 'processingTimeMs'> {
    // Validate recommended model is eligible for user's tier
    if (!eligibleModels.includes(result.recommendedModel)) {
      result.recommendedModel = this.findBestEligibleModel(result, eligibleModels);
      result.reasoning += ' (Adjusted for your subscription tier)';
    }

    // Ensure enhancementPrompt exists
    if (!result.enhancementPrompt) {
      result.enhancementPrompt = this.generateDefaultEnhancementPrompt(result);
    }

    return result;
  }

  private findBestEligibleModel(result: ILLMAnalysisResult, eligible: ModelId[]): ModelId {
    for (const alt of result.alternatives || []) {
      if (eligible.includes(alt)) return alt;
    }
    return eligible[0] || 'real-esrgan';
  }

  private generateDefaultEnhancementPrompt(result: ILLMAnalysisResult): string {
    const fixes = result.issues
      .filter(i => i.severity !== 'low')
      .map(i => {
        switch (i.type) {
          case 'blur':
            return 'sharpen and restore detail';
          case 'noise':
            return 'reduce noise while preserving detail';
          case 'damage':
            return 'repair damaged areas';
          case 'faces':
            return 'restore facial features';
          case 'compression':
            return 'remove compression artifacts';
          default:
            return i.description;
        }
      });

    return fixes.length > 0
      ? `Enhance image: ${fixes.join(', ')}`
      : 'Upscale and enhance image quality';
  }

  private getDefaultResult(
    eligible: ModelId[]
  ): Omit<ILLMAnalysisResult, 'provider' | 'processingTimeMs'> {
    return {
      issues: [],
      contentType: 'photo',
      recommendedModel: eligible[0] || 'real-esrgan',
      reasoning: 'Standard upscaling selected (analysis unavailable).',
      confidence: 0.5,
      alternatives: eligible.slice(1, 3),
      enhancementPrompt: 'Upscale and enhance image quality',
    };
  }
}
