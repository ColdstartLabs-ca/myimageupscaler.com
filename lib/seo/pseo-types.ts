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
  ctaText: string;
  ctaUrl: string;
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
  dimensions?: string;
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
  criteria: IComparisonCriteria[];
  verdict?: string;
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
  | IFreePage;

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
  pricing: string;
  rating?: number;
  pros: string[];
  cons: string[];
}

export interface IComparisonCriteria {
  criterion: string;
  pixelperfect: string;
  competitor?: string;
  winner?: 'pixelperfect' | 'competitor' | 'tie';
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
