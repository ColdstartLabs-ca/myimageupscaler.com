import type { ModelId } from '@/shared/types/coreflow.types';
import type { ILLMAnalysisResult } from './llm-image-analyzer.types';
import { OpenRouterService } from './openrouter.service';
import { buildAnalysisPrompt } from './internal/prompt-builder';
import { DEFAULT_ENHANCEMENT_PROMPT, ISSUE_TYPE_PROMPTS } from './internal/prompt-constants';

export { buildAnalysisPrompt };

export class LLMImageAnalyzer {
  private openRouter: OpenRouterService;

  constructor() {
    this.openRouter = new OpenRouterService();
  }

  /**
   * Analyze an image and optionally recommend a model
   * @param base64Image - Base64 encoded image data
   * @param mimeType - MIME type of the image
   * @param eligibleModels - List of models the user can use
   * @param suggestTier - When true (default), AI recommends a model. When false, AI only provides enhancement suggestions.
   */
  async analyze(
    base64Image: string,
    mimeType: string,
    eligibleModels: ModelId[],
    suggestTier: boolean = true
  ): Promise<ILLMAnalysisResult> {
    const startTime = Date.now();
    const dataUrl = this.formatDataUrl(base64Image, mimeType);

    try {
      const result = await this.analyzeWithOpenRouter(dataUrl, eligibleModels, suggestTier);
      return {
        ...result,
        provider: 'openrouter',
        processingTimeMs: Date.now() - startTime,
      };
    } catch {
      console.error('OpenRouter analysis failed, using default fallback');
      return {
        ...this.getDefaultResult(eligibleModels, suggestTier),
        provider: 'fallback',
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  private formatDataUrl(base64Image: string, mimeType: string): string {
    return base64Image.startsWith('data:') ? base64Image : `data:${mimeType};base64,${base64Image}`;
  }

  private async analyzeWithOpenRouter(
    imageDataUrl: string,
    eligibleModels: ModelId[],
    suggestTier: boolean
  ): Promise<Omit<ILLMAnalysisResult, 'provider' | 'processingTimeMs'>> {
    const prompt = buildAnalysisPrompt(eligibleModels, suggestTier);
    console.log('[LLM Analyzer] OpenRouter prompt (suggestTier=%s):', suggestTier, prompt);

    const responseText = await this.openRouter.analyzeImage(imageDataUrl, prompt);
    console.log('[LLM Analyzer] OpenRouter response:', responseText);

    const result = this.parseJsonResponse(responseText, suggestTier);
    return this.validateAndAdjustResult(result, eligibleModels, suggestTier);
  }

  private parseJsonResponse(responseText: string, suggestTier: boolean): ILLMAnalysisResult {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in OpenRouter response');
    }
    const parsed = JSON.parse(jsonMatch[0]);

    // When suggestTier is false, the AI response won't include model recommendation fields
    // Set placeholder values that won't be used
    if (!suggestTier) {
      return {
        ...parsed,
        // Use placeholder values - these won't be used when suggestTier is false
        recommendedModel: 'real-esrgan' as ModelId,
        reasoning: 'Enhancement-only analysis (user selected their own model)',
        alternatives: [],
      };
    }

    return parsed;
  }

  private validateAndAdjustResult(
    result: ILLMAnalysisResult,
    eligibleModels: ModelId[],
    suggestTier: boolean
  ): ILLMAnalysisResult {
    // Only validate/adjust model recommendation when we're suggesting a tier
    if (suggestTier && !eligibleModels.includes(result.recommendedModel)) {
      result.recommendedModel = this.findBestEligibleModel(result, eligibleModels);
      result.reasoning += ' (Adjusted for your subscription tier)';
    }

    if (!result.enhancementPrompt) {
      result.enhancementPrompt = this.generateEnhancementPrompt(result);
    }

    return result;
  }

  private findBestEligibleModel(result: ILLMAnalysisResult, eligible: ModelId[]): ModelId {
    return result.alternatives?.find(alt => eligible.includes(alt)) ?? eligible[0] ?? 'real-esrgan';
  }

  private generateEnhancementPrompt(result: ILLMAnalysisResult): string {
    const fixes = result.issues
      .filter(i => i.severity !== 'low')
      .map(i => ISSUE_TYPE_PROMPTS[i.type as keyof typeof ISSUE_TYPE_PROMPTS] ?? i.description);

    return fixes.length > 0 ? `Enhance image: ${fixes.join(', ')}` : DEFAULT_ENHANCEMENT_PROMPT;
  }

  private getDefaultResult(
    eligible: ModelId[],
    suggestTier: boolean
  ): Omit<ILLMAnalysisResult, 'provider' | 'processingTimeMs'> {
    return {
      issues: [],
      contentType: 'photo',
      // Use placeholder when not suggesting tier - this value won't be used
      recommendedModel: suggestTier ? (eligible[0] ?? 'real-esrgan') : 'real-esrgan',
      reasoning: suggestTier
        ? 'Standard upscaling selected (analysis unavailable).'
        : 'Enhancement-only analysis (user selected their own model)',
      confidence: 0.5,
      alternatives: suggestTier ? eligible.slice(1, 3) : [],
      enhancementPrompt: DEFAULT_ENHANCEMENT_PROMPT,
    };
  }
}
