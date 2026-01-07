/**
 * pSEO Page Type Definitions
 * Data structures for programmatic SEO pages
 */

import { PSEOCategory } from './url-utils';

/**
 * Base interface for all pSEO pages
 */
export interface IBasePSEOPage {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  ogImage?: string;
  lastUpdated: string;
}

/**
 * Tool page data structure
 */
export interface IToolPage extends IBasePSEOPage {
  category: 'tools';
  toolName: string;
  description: string;
  features: IFeature[];
  useCases: IUseCase[];
  benefits: IBenefit[];
  howItWorks: IHowItWorksStep[];
  faq: IFAQ[];
  relatedTools: string[];
  relatedGuides: string[];
  relatedBlogPosts?: string[];
  ctaText: string;
  ctaUrl: string;
  // Interactive tool fields (optional)
  isInteractive?: boolean;
  toolComponent?: string; // Component name to render
  toolConfig?: IToolConfig; // Configuration passed to tool component
  maxFileSizeMB?: number;
  acceptedFormats?: string[];
}

/**
 * Tool component configuration
 */
export interface IToolConfig {
  // FormatConverter config
  defaultTargetFormat?: 'jpeg' | 'png' | 'webp';
  acceptedInputFormats?: string[];
  availableOutputFormats?: ('jpeg' | 'png' | 'webp')[];
  // ImageResizer config
  defaultWidth?: number;
  defaultHeight?: number;
  lockDimensions?: boolean;
  presetFilter?: string;
  // ImageCompressor config
  defaultQuality?: number;
}

/**
 * Format page data structure
 */
export interface IFormatPage extends IBasePSEOPage {
  category: 'formats';
  formatName: string;
  extension: string;
  description: string;
  characteristics: string[];
  useCases: IUseCase[];
  bestPractices: string[];
  faq: IFAQ[];
  relatedFormats: string[];
  relatedGuides: string[];
}

/**
 * Scale page data structure
 */
export interface IScalePage extends IBasePSEOPage {
  category: 'scale';
  resolution: string;
  description: string;
  dimensions?: {
    width: number;
    height: number;
    aspectRatio?: string;
  };
  useCases: IUseCase[];
  benefits: IBenefit[];
  faq: IFAQ[];
  relatedScales: string[];
  relatedGuides: string[];
}

/**
 * Use case page data structure
 */
export interface IUseCasePage extends IBasePSEOPage {
  category: 'use-cases';
  industry: string;
  description: string;
  challenges: string[];
  solutions: ISolution[];
  results: IResult[];
  faq: IFAQ[];
  relatedTools: string[];
  relatedGuides: string[];
}

/**
 * Comparison page data structure
 */
export interface IComparisonPage extends IBasePSEOPage {
  category: 'compare';
  comparisonType: 'vs' | 'best-of' | 'category';
  products?: IProduct[];
  criteria?: IComparisonCriteria[];
  verdict?: {
    summary: string;
    winner?: string;
    reason?: string;
  };
  faq: IFAQ[];
  relatedComparisons: string[];
}

/**
 * Alternative page data structure
 */
export interface IAlternativePage extends IBasePSEOPage {
  category: 'alternatives';
  originalTool: string;
  description: string;
  alternatives: IAlternative[];
  comparisonCriteria: string[];
  faq: IFAQ[];
  relatedAlternatives: string[];
}

/**
 * Guide page data structure
 */
export interface IGuidePage extends IBasePSEOPage {
  category: 'guides';
  guideType: 'how-to' | 'tutorial' | 'best-practices' | 'explainer';
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime?: string;
  steps: IGuideStep[];
  tips: string[];
  faq: IFAQ[];
  relatedGuides: string[];
  relatedTools: string[];
}

/**
 * Free tool page data structure
 */
export interface IFreePage extends IBasePSEOPage {
  category: 'free';
  toolName: string;
  description: string;
  features: IFeature[];
  limitations: string[];
  upgradePoints: string[];
  faq: IFAQ[];
  relatedFree: string[];
  upgradePath: string;
}

/**
 * Bulk tool page data structure
 */
export interface IBulkToolPage extends IBasePSEOPage {
  category: 'bulk-tools';
  toolName: string;
  toolComponent: string;
  description: string;
  maxFiles: number;
  acceptedFormats: string[];
  features: IFeature[];
  useCases: IUseCase[];
  benefits: IBenefit[];
  howItWorks: IHowItWorksStep[];
  faq: IFAQ[];
  limitations: string[];
  outputFormat: 'zip' | 'individual';
  relatedTools: string[];
  relatedGuides: string[];
  ctaText: string;
  ctaUrl: string;
}

/**
 * Platform page data structure
 * For pages like /platforms/midjourney-upscaler, /platforms/stable-diffusion-upscaler
 */
export interface IPlatformPage extends IBasePSEOPage {
  category: 'platforms';
  platformName: string;
  platformType: 'ai-generator' | 'design-tool' | 'photo-editor';
  description: string;
  benefits: IBenefit[];
  integration: string[];
  useCases: IUseCase[];
  workflowSteps: string[];
  faq: IFAQ[];
  relatedPlatforms: string[];
  relatedTools: string[];
}

/**
 * Content-type specific upscaling page
 * For pages like /content/upscale-old-family-photos, /content/upscale-digital-art
 */
export interface IContentTypePage extends IBasePSEOPage {
  category: 'content';
  contentType: string;
  contentDescription: string;
  targetAudience: string[];
  commonChallenges: string[];
  features: IFeature[];
  useCases: IUseCase[];
  benefits: IBenefit[];
  howItWorks: IHowItWorksStep[];
  beforeAfterExamples?: IBeforeAfterExample[];
  tips: string[];
  faq: IFAQ[];
  relatedContent: string[];
  relatedTools: string[];
  ctaText: string;
  ctaUrl: string;
}

/**
 * AI Feature page data structure
 * For pages like /ai-features/ai-face-restoration, /ai-features/ai-portrait-enhancer
 */
export interface IAIFeaturePage extends IBasePSEOPage {
  category: 'ai-features';
  featureName: string;
  featureType: 'enhancement' | 'restoration' | 'correction' | 'generation';
  technology: string;
  description: string;
  capabilities: string[];
  features: IFeature[];
  useCases: IUseCase[];
  benefits: IBenefit[];
  howItWorks: IHowItWorksStep[];
  limitations: string[];
  isInteractive?: boolean;
  toolComponent?: string;
  faq: IFAQ[];
  relatedFeatures: string[];
  relatedTools: string[];
  ctaText: string;
  ctaUrl: string;
}

/**
 * Before/after example for content-type pages
 */
export interface IBeforeAfterExample {
  title: string;
  description: string;
  beforeImage?: string;
  afterImage?: string;
  improvement: string;
}

/**
 * Format × Scale multiplier page
 * For pages like /format-scale/jpeg-upscale-2x, /format-scale/webp-upscale-4x
 */
export interface IFormatScalePage extends IBasePSEOPage {
  category: 'format-scale';
  format: string;
  scaleFactor: string;
  formatDescription: string;
  scaleExpectations: string;
  useCases: IUseCase[];
  benefits: IBenefit[];
  bestPractices: string[];
  tips: string[];
  faq: IFAQ[];
  relatedFormats: string[];
  relatedScales: string[];
}

/**
 * Platform × Format multiplier page
 * For pages like /platform-format/midjourney-upscaler-png, /platform-format/sd-upscaler-webp
 */
export interface IPlatformFormatPage extends IBasePSEOPage {
  category: 'platform-format';
  platform: string;
  format: string;
  platformDescription: string;
  formatDescription: string;
  platformSettings: string;
  exportTips: string[];
  workflowTips: string[];
  benefits: IBenefit[];
  useCases: IUseCase[];
  faq: IFAQ[];
  relatedPlatforms: string[];
  relatedFormats: string[];
}

/**
 * Device × Use Case multiplier page
 * For pages like /device-use/mobile-social-media-upscaler, /device-use/desktop-professional-upscaler
 */
export interface IDeviceUseCasePage extends IBasePSEOPage {
  category: 'device-use';
  device: 'mobile' | 'desktop' | 'tablet';
  useCase: string;
  deviceDescription: string;
  useCaseDescription: string;
  deviceConstraints: string[];
  useCaseBenefits: string[];
  tips: string[];
  faq: IFAQ[];
  relatedDevices: string[];
  relatedUseCases: string[];
}

/**
 * Union type for all pSEO pages
 */
export type PSEOPage =
  | IToolPage
  | IFormatPage
  | IScalePage
  | IUseCasePage
  | IComparisonPage
  | IAlternativePage
  | IGuidePage
  | IFreePage
  | IBulkToolPage
  | IPlatformPage
  | IContentTypePage
  | IAIFeaturePage
  | IFormatScalePage
  | IPlatformFormatPage
  | IDeviceUseCasePage;

/**
 * Supporting interfaces
 */
export interface IFeature {
  title: string;
  description: string;
  icon?: string;
}

export interface IUseCase {
  title: string;
  description: string;
  example?: string;
}

export interface IBenefit {
  title: string;
  description: string;
  metric?: string;
}

export interface IHowItWorksStep {
  step: number;
  title: string;
  description: string;
}

export interface IFAQ {
  question: string;
  answer: string;
}

export interface ISolution {
  problem: string;
  solution: string;
  tool?: string;
}

export interface IResult {
  metric: string;
  improvement: string;
  description: string;
}

export interface IProduct {
  name: string;
  pricing?: string;
  rating?: number;
  tagline?: string;
  description?: string;
  isRecommended?: boolean;
  features?: Record<string, string | boolean | number>;
  pros?: string[];
  cons?: string[];
}

export interface IComparisonCriteria {
  name: string;
  key: string;
  criterion?: string;
  myimageupscaler?: string;
  competitor?: string;
  winner?: 'myimageupscaler' | 'competitor' | 'tie';
}

export interface IAlternative {
  name: string;
  description: string;
  pricing: string;
  bestFor: string;
  link?: string;
}

export interface IGuideStep {
  step: number;
  title: string;
  content: string;
  image?: string;
  tip?: string;
}

/**
 * Data file response structure
 */
export interface IPSEODataFile<T extends PSEOPage> {
  category: PSEOCategory;
  pages: T[];
  meta: {
    totalPages: number;
    lastUpdated: string;
  };
}
