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
 * Before/after image configuration for pSEO pages
 * Allows pages to specify unique before/after images for their content
 */
export interface IBeforeAfterImages {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
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
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
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
export interface IFormatCharacteristic {
  title: string;
  description: string;
}

export interface IFormatBestPractice {
  title: string;
  description: string;
}

export interface IFormatPage extends IBasePSEOPage {
  category: 'formats';
  formatName: string;
  extension: string;
  description: string;
  characteristics: IFormatCharacteristic[];
  useCases: IUseCase[];
  bestPractices: IFormatBestPractice[];
  faq: IFAQ[];
  relatedFormats: string[];
  relatedGuides: string[];
  beforeAfterImages?: IBeforeAfterImages;
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
  // Optional enhanced content fields
  howItWorks?: IHowItWorksStep[];
  comparisonTable?: IComparisonTable;
  technicalDetails?: Array<{ title: string; description: string }>;
  beforeAfterImages?: IBeforeAfterImages;
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
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
  beforeAfterImages?: IBeforeAfterImages;
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
  beforeAfterImages?: IBeforeAfterImages;
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
  // Phase 8: Content expansion fields
  detailedDescription?: string;
  technicalDetails?: string;
  bestPractices?: string[];
  comparisonNotes?: string;
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
  // Phase 8: Content expansion fields
  detailedDescription?: string;
  technicalDetails?: string;
  comparisonNotes?: string;
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
  // Phase 8: Content expansion fields
  detailedDescription?: string;
  technicalDetails?: string;
  bestPractices?: string[];
  comparisonNotes?: string;
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
  // Phase 8: Content expansion fields
  detailedDescription?: string;
  technicalDetails?: string;
  bestPractices?: string[];
  comparisonNotes?: string;
}

/**
 * Photo restoration page data structure
 * For pages like /photo-restoration/restore-old-photos, /photo-restoration/fix-faded-prints
 */
export interface IPhotoRestorationPage extends IBasePSEOPage {
  category: 'photo-restoration';
  restorationType: string;
  description: string;
  challenges: string[];
  solutions: string[];
  techniques: string[];
  features: IFeature[];
  useCases: IUseCase[];
  benefits: IBenefit[];
  howItWorks: IHowItWorksStep[];
  beforeAfterExamples?: IBeforeAfterExample[];
  tips: string[];
  faq: IFAQ[];
  relatedRestorations: string[];
  relatedTools: string[];
  ctaText: string;
  ctaUrl: string;
}

/**
 * Camera RAW page data structure
 * For pages like /camera-raw/canon-raw-upscaler, /camera-raw/nikon-nef-enhancement
 */
export interface ICameraRawPage extends IBasePSEOPage {
  category: 'camera-raw';
  cameraBrand: string;
  rawFormat: string;
  description: string;
  rawChallenges: string[];
  solutions: string[];
  features: IFeature[];
  useCases: IUseCase[];
  benefits: IBenefit[];
  howItWorks: IHowItWorksStep[];
  bestPractices: string[];
  tips: string[];
  faq: IFAQ[];
  relatedRawFormats: string[];
  relatedTools: string[];
  ctaText: string;
  ctaUrl: string;
}

/**
 * Industry insights page data structure
 * For pages like /industry-insights/real-estate-photo-enhancement, /industry-insights/ecommerce-product-photos
 */
export interface IIndustryInsightPage extends IBasePSEOPage {
  category: 'industry-insights';
  industry: string;
  description: string;
  problem: {
    title: string;
    description: string;
  };
  solution: {
    title: string;
    description: string;
  };
  applications: IUseCase[];
  caseStudies: Array<{
    title: string;
    scenario: string;
    solution: string;
    results: string;
  }>;
  techniques: Array<{
    name: string;
    description: string;
  }>;
  bestPractices: string[];
  faq: IFAQ[];
  relatedTools: string[];
  relatedPages: string[];
  ctaText: string;
  ctaUrl: string;
}

/**
 * Device optimization page data structure
 * For pages like /device-optimization/mobile-image-optimization, /device-optimization/desktop-image-performance
 */
export interface IDeviceOptimizationPage extends IBasePSEOPage {
  category: 'device-optimization';
  platform: 'Mobile' | 'Desktop' | 'Smart TV' | 'Tablet' | 'Wearable';
  description: string;
  challenges: Array<{
    challenge: string;
    description: string;
  }>;
  optimizations: Array<{
    technique: string;
    description: string;
    implementation?: string;
  }>;
  bestPractices: string[];
  commonMistakes: string[];
  faq: IFAQ[];
  relatedTools: string[];
  relatedPages: string[];
  ctaText: string;
  ctaUrl: string;
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
  | IDeviceUseCasePage
  | IPhotoRestorationPage
  | ICameraRawPage
  | IIndustryInsightPage
  | IDeviceOptimizationPage;

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

/**
 * Comparison table for pSEO pages
 */
export interface IComparisonTable {
  title?: string;
  description?: string;
  headers: string[];
  rows: Record<string, string | number | boolean>[];
}
