import type { ModelId } from '@/shared/types/coreflow.types';

export type IssueType =
  | 'blur'
  | 'noise'
  | 'compression'
  | 'damage'
  | 'low_resolution'
  | 'faces'
  | 'text';
export type IssueSeverity = 'low' | 'medium' | 'high';
export type ContentType = 'photo' | 'portrait' | 'document' | 'vintage' | 'product' | 'artwork';
export type AnalysisProvider = 'replicate' | 'gemini' | 'fallback';

export interface IDetectedIssue {
  type: IssueType;
  severity: IssueSeverity;
  description: string;
}

export interface ILLMAnalysisResult {
  issues: IDetectedIssue[];
  contentType: ContentType;
  recommendedModel: ModelId;
  reasoning: string;
  confidence: number;
  alternatives: ModelId[];
  /** Prompt to pass to enhancement model describing what to fix */
  enhancementPrompt: string;
  /** Which provider was used */
  provider: AnalysisProvider;
  processingTimeMs?: number;
}

export interface ILLMAnalysisConfig {
  maxImageSizeBytes?: number; // Default: 4MB
  timeoutMs?: number; // Default: 10000
}
