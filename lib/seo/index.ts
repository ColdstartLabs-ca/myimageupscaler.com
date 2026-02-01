/**
 * SEO Module - Programmatic SEO Infrastructure
 * Centralized exports for keyword management, mapping, tracking, and routing
 * Phase 5: Added hreflang generator exports
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

// Schema Generators
export {
  generateToolSchema,
  generateComparisonSchema,
  generateGuideSchema,
  generateUseCaseSchema,
  generateAlternativeSchema,
  generateHomepageSchema,
} from './schema-generator';

// Meta Tag Patterns and Validation
export {
  META_PATTERNS,
  validateMeta,
  getMetaLengthRanges,
  type IMetaPattern,
  type IMetaValidation,
} from './meta-generator';

// Metadata Factory
export { generateMetadata, generateCategoryMetadata } from './metadata-factory';

// Hreflang Generator (Phase 5)
export {
  generateHreflangAlternates,
  generatePSEOHreflangAlternates,
  getLocalizedPath,
  formatHreflangForMetadata,
  getCanonicalUrl as getHreflangCanonicalUrl,
  validateHreflangAlternates,
  getOpenGraphLocale,
  getOpenGraphMetadata,
} from './hreflang-generator';

// Localization Config (Phase 5)
export {
  LOCALIZED_CATEGORIES,
  ENGLISH_ONLY_CATEGORIES,
  ALL_CATEGORIES,
  isCategoryLocalized,
  isCategoryEnglishOnly,
  getEnglishOnlyCategories,
  getLocalizedCategories,
  shouldShowEnglishOnlyBanner,
  getEnglishPath,
  LOCALIZATION_STATUS,
} from './localization-config';

// IndexNow (Task 26 - SEO Audit)
export {
  submitUrl,
  submitBatch,
  submitFromCSV,
  getSubmissionStatus,
  generateIndexNowKey,
  validateIndexNowKey,
  getKeyFileContent,
  type IIndexNowPayload,
} from './indexnow';

// Re-export types from indexnow
export type { IIndexNowResult, IIndexNowStatus, IIndexNowBatchOptions } from './indexnow';

// Localized Data Loaders (Phase 5)
export type { ILocalizedDataResult } from './data-loader';
export {
  getToolDataWithLocale,
  getFormatDataWithLocale,
  getComparisonDataWithLocale,
  getAlternativeDataWithLocale,
  getPlatformDataWithLocale,
  getGuideDataWithLocale,
  getUseCaseDataWithLocale,
  getScaleDataWithLocale,
  getFreeDataWithLocale,
  getFormatScaleDataWithLocale,
  getPlatformFormatDataWithLocale,
  getDeviceUseDataWithLocale,
} from './data-loader';
