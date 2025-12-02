/**
 * SEO Module - Programmatic SEO Infrastructure
 * Centralized exports for keyword management, mapping, tracking, and routing
 */

// Types
export type {
  IKeyword,
  IKeywordTier,
  IKeywordIntent,
  IKeywordPageMapping,
  IPageTemplate,
} from './types';

// pSEO Page Types
export type {
  IBasePSEOPage,
  IToolPage,
  IFormatPage,
  IScalePage,
  IUseCasePage,
  IComparisonPage,
  IAlternativePage,
  IGuidePage,
  IFreePage,
  PSEOPage,
  IFeature,
  IUseCase,
  IBenefit,
  IHowItWorksStep,
  IFAQ,
  ISolution,
  IResult,
  IProduct,
  IComparisonCriteria,
  IAlternative,
  IGuideStep,
  IPSEODataFile,
} from './pseo-types';

// Keyword Mappings
export {
  keywordPageMappings,
  getPageMappingByUrl,
  getPageMappingByKeyword,
  getPagesByCategory,
  getP0Pages,
  getPagesByTier,
} from './keyword-mappings';

// Keyword Tiers
export { keywordTiers, getTierByVolume, getTierInfo } from './keyword-tiers';

// Tracking
export {
  KeywordTracker,
  reviewCadence,
  type IKeywordTracking,
  type IKeywordPerformance,
  type IReviewTask,
} from './tracking';

// URL Utilities
export {
  generateCanonicalUrl,
  generateCategoryUrl,
  validateSlug,
  generateSlug,
  isValidCategory,
  getCategoryDisplayName,
  getCategoryDescription,
  PSEO_CATEGORIES,
  type PSEOCategory,
} from './url-utils';

// Data Loaders
export {
  getAllToolSlugs,
  getToolData,
  getAllTools,
  getAllFormatSlugs,
  getFormatData,
  getAllFormats,
  getAllComparisonSlugs,
  getComparisonData,
  getAllComparisons,
  getAllUseCaseSlugs,
  getUseCaseData,
  getAllUseCases,
  getAllGuideSlugs,
  getGuideData,
  getAllGuides,
  getAllAlternativeSlugs,
  getAlternativeData,
  getAllAlternatives,
  getAllScaleSlugs,
  getScaleData,
  getAllScales,
  getAllFreeSlugs,
  getFreeData,
  getAllFreeTools,
  getAllPSEOPages,
} from './data-loader';
