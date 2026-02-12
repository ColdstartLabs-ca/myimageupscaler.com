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
 * Use Case page data structure
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
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
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
 * Platform × Format multiplier page data structure
 */
export interface IPlatformFormatPage extends IBasePSEOPage {
  category: 'platform-format';
  platform: string;
  format: string;
  platformDescription: string;
  formatExpectations: string[];
  useCases: IUseCase[];
  benefits: IBenefit[];
  workflowTips: string[];
  features: IFeature[];
  faq: IFAQ[];
  relatedFormats: string[];
  relatedPlatforms: string[];
  // Phase 8: Content expansion fields
  detailedDescription?: string;
  technicalDetails?: string;
  comparisonNotes?: string;
}

/**
 * Platform × Format multiplier page data structure
 */
export interface IFormatScalePage extends IBasePSEOPage {
  category: 'format-scale';
  format: string;
  scaleFactor: string;
  scaleExpectations: string;
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
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}

/**
 * Device × Use Case multiplier page data structure
 */
export interface IDeviceUseCasePage extends IBasePSEOPage {
  category: 'device-use';
  device: 'mobile' | 'desktop' | 'tablet';
  useCase: string;
  useCaseDescription: string;
  commonChallenges: string[];
  solutions: ISolution[];
  results: IResult[];
  faq: IFAQ[];
  relatedDevices: string[];
  benefits: IBenefit[];
  tips: string[];
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}

/**
 * Photo restoration page data structure
 */
export interface IPhotoRestorationPage extends IBasePSEOPage {
  category: 'photo-restoration';
  restorationType: string;
  description: string;
  challenges: string[];
  solutions: ISolution[];
  features: IFeature[];
  faq: IFAQ[];
  relatedRestorations: string[];
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}

/**
 * Industry insights page data structure
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
  caseStudies?: Array<{
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
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}

/**
 * Expanded comparisons page data structure
 */
export interface IComparisonsExpandedPage extends IBasePSEOPage {
  category: 'comparisons-expanded';
  comparisonType: 'vs' | 'best-of' | 'category';
  description: string;
  testResults?: Array<{
    metric: string;
    result: string;
    details: string;
  }>;
  recommendations: string[];
  faq: IFAQ[];
  relatedComparisons: string[];
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}

/**
 * Expanded personas (user types) page data structure
 */
export interface IPersonasExpandedPage extends IBasePSEOPage {
  category: 'personas-expanded';
  persona: string;
  industry: string;
  audience: string;
  painPoints: string[];
  solutions: ISolution[];
  features: IFeature[];
  faq: IFAQ[];
  relatedTools: string[];
  relatedGuides: string[];
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}

/**
 * Expanded use cases page data structure
 */
export interface IUseCasesExpandedPage extends IBasePSEOPage {
  category: 'use-cases-expanded';
  industry: string;
  useCase: string;
  targetAudience: string;
  challenges: string[];
  solutions: ISolution[];
  results: IResult[];
  faq: IFAQ[];
  relatedTools: string[];
  relatedGuides: string[];
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}

/**
 * Bulk tool page data structure
 */
export interface IBulkToolPage extends IBasePSEOPage {
  category: 'bulk-tools';
  toolName: string;
  description: string;
  features: IFeature[];
  useCases: IUseCase[];
  benefits: IBenefit[];
  upgradePoints: string[];
  faq: IFAQ[];
  limitations: string[];
  howItWorks: IHowItWorksStep[];
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
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
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}

/**
 * Platform page data structure
 */
export interface IPlatformPage extends IBasePSEOPage {
  category: 'platforms';
  platformName: string;
  platform: string;
  platformType: 'ai-generator' | 'design-tool' | 'photo-editor';
  description: string;
  benefits: IBenefit[];
  integration: string[];
  useCases: IUseCase[];
  workflowTips: string[];
  features: IFeature[];
  faq: IFAQ[];
  relatedPlatforms: string[];
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  technicalDetails?: string;
  comparisonNotes?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}

/**
 * Content-type specific upscaling page data structure
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
  // Phase 8: Content expansion fields
  uniqueIntro?: string;
  expandedDescription?: string;
  pageSpecificDetails?: string;
  // Custom before/after slider images (optional)
  beforeAfterImages?: IBeforeAfterImages;
}
