/**
 * Privacy-safe contracts for the three core product telemetry events owned by
 * the image-processing and account-setup flows.
 *
 * This module is intentionally dependency-free so the same normalizer can be
 * used by server routes and browser-owned processing helpers. It accepts
 * internal input, but returns only the bounded event properties declared here.
 */

export const CORE_EVENT_NAMES = ['account_created', 'image_upscaled', 'processing_failed'] as const;

export type TCoreEventName = (typeof CORE_EVENT_NAMES)[number];

export type TAccountCreatedMethod = 'email' | 'google' | 'facebook' | 'azure' | 'unknown';

export type TImageMimeFamily =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'heic'
  | 'avif'
  | 'gif'
  | 'tiff'
  | 'bmp'
  | 'other'
  | 'unknown';

export type TFileSizeBucket = '<1MB' | '1-5MB' | '5-10MB' | '10-25MB' | '25MB+' | 'unknown';

export type TProcessingProvider = 'replicate' | 'gemini' | 'fallback' | 'unknown';

export type TProcessingErrorType =
  | 'safety'
  | 'validation'
  | 'image_too_large'
  | 'timeout'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_authentication'
  | 'provider_billing'
  | 'insufficient_credits'
  | 'batch_limit'
  | 'account_setup'
  | 'no_output'
  | 'processing_failed'
  | 'internal'
  | 'unknown';

export type TProcessingReason =
  | 'safety_filter'
  | 'invalid_input'
  | 'image_too_large'
  | 'timeout'
  | 'rate_limit'
  | 'provider_unavailable'
  | 'provider_authentication'
  | 'provider_billing'
  | 'insufficient_credits'
  | 'batch_limit'
  | 'account_setup'
  | 'no_output'
  | 'processing_failed'
  | 'internal_error'
  | 'unknown';

export interface IAccountCreatedEventInput {
  method?: unknown;
  pricingRegion?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  attributionAvailable?: unknown;
}

export interface IAccountCreatedEventProperties {
  method: TAccountCreatedMethod;
  pricingRegion: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  attributionAvailable: boolean;
}

export interface IImageUpscaledEventInput {
  qualityTier?: unknown;
  scaleFactor?: unknown;
  inputWidth?: unknown;
  inputHeight?: unknown;
  outputWidth?: unknown;
  outputHeight?: unknown;
  fileType?: unknown;
  fileSizeBytes?: unknown;
  fileSizeBucket?: unknown;
  durationMs?: unknown;
}

export interface IImageUpscaledEventProperties {
  qualityTier: string;
  scaleFactor: number | null;
  inputWidth: number | null;
  inputHeight: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  fileType: TImageMimeFamily;
  fileSizeBucket: TFileSizeBucket;
  durationMs: number | null;
}

export interface IProcessingFailedEventInput {
  errorType?: unknown;
  reason?: unknown;
  provider?: unknown;
  model?: unknown;
  qualityTier?: unknown;
  retryable?: unknown;
  durationMs?: unknown;
  requestId?: unknown;
}

export interface IProcessingFailedEventProperties {
  errorType: TProcessingErrorType;
  reason: TProcessingReason;
  provider: TProcessingProvider;
  model: string;
  qualityTier: string;
  retryable: boolean;
  durationMs: number | null;
  requestId: string;
}

export interface ICoreEventPropertiesMap {
  account_created: IAccountCreatedEventProperties;
  image_upscaled: IImageUpscaledEventProperties;
  processing_failed: IProcessingFailedEventProperties;
}

const MAX_UTM_LENGTH = 100;
const MAX_DIMENSION = 100_000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_MODEL_LENGTH = 96;
const MAX_REQUEST_ID_LENGTH = 128;
const MEGABYTE = 1024 * 1024;

const SAFE_UTM_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SAFE_MODEL_PATTERN = /^[a-z0-9][a-z0-9._:@/-]*$/;
const SAFE_REQUEST_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeSafeToken(
  value: unknown,
  options: { maxLength: number; pattern: RegExp }
): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase().normalize('NFKC').replace(/\s+/g, '_');
  const hasControlCharacter = [...normalized].some(character => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (
    !normalized ||
    normalized.length > options.maxLength ||
    normalized.includes('://') ||
    hasControlCharacter ||
    !options.pattern.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function normalizeUtm(value: unknown): string | null {
  return normalizeSafeToken(value, { maxLength: MAX_UTM_LENGTH, pattern: SAFE_UTM_PATTERN });
}

function normalizeDimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  return value > 0 && value <= MAX_DIMENSION ? value : null;
}

function normalizeDuration(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_DURATION_MS) return null;
  return Math.round(value);
}

function normalizeScale(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return [1, 2, 4, 8].includes(value) ? value : null;
}

function normalizeQualityTier(value: unknown): string {
  return normalizeSafeToken(value, { maxLength: 64, pattern: SAFE_UTM_PATTERN }) ?? 'unknown';
}

export function normalizeModel(value: unknown): string {
  if (typeof value !== 'string' || /\s/.test(value)) return 'unknown';
  return (
    normalizeSafeToken(value, { maxLength: MAX_MODEL_LENGTH, pattern: SAFE_MODEL_PATTERN }) ??
    'unknown'
  );
}

export function normalizeRequestId(value: unknown): string {
  if (typeof value !== 'string' || /\s/.test(value)) return 'unknown';
  return (
    normalizeSafeToken(value, {
      maxLength: MAX_REQUEST_ID_LENGTH,
      pattern: SAFE_REQUEST_ID_PATTERN,
    }) ?? 'unknown'
  );
}

export function normalizeProvider(value: unknown): TProcessingProvider {
  const normalized = normalizeSafeToken(value, { maxLength: 32, pattern: SAFE_UTM_PATTERN });
  if (!normalized) return 'unknown';

  if (normalized === 'replicate') return 'replicate';
  if (normalized === 'gemini') return 'gemini';
  if (normalized === 'fallback') return 'fallback';
  return 'unknown';
}

function normalizedFailureInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

export function normalizeErrorType(value: unknown): TProcessingErrorType {
  const normalized = normalizedFailureInput(value);

  if (normalized.includes('safety')) return 'safety';
  if (
    normalized.includes('invalid_input') ||
    normalized.includes('invalid_base64') ||
    normalized.includes('validation') ||
    normalized.includes('dimension')
  ) {
    return 'validation';
  }
  if (normalized.includes('image_too_large') || normalized.includes('file_size')) {
    return 'image_too_large';
  }
  if (normalized.includes('timeout')) return 'timeout';
  if (normalized.includes('rate_limit')) return 'rate_limited';
  if (normalized.includes('authentication')) return 'provider_authentication';
  if (normalized.includes('billing') || normalized.includes('provider_402')) {
    return 'provider_billing';
  }
  if (normalized.includes('provider_unavailable') || normalized.includes('circuit')) {
    return 'provider_unavailable';
  }
  if (normalized.includes('insufficient_credit') || normalized.includes('free_limit')) {
    return 'insufficient_credits';
  }
  if (normalized.includes('batch_limit')) return 'batch_limit';
  if (normalized.includes('account_setup')) return 'account_setup';
  if (normalized.includes('no_output')) return 'no_output';
  if (normalized.includes('processing_failed') || normalized.includes('ai_generation')) {
    return 'processing_failed';
  }
  if (normalized.includes('unexpected') || normalized.includes('internal')) return 'internal';
  return 'unknown';
}

export function normalizeReason(value: unknown, errorType?: unknown): TProcessingReason {
  const normalized = normalizedFailureInput(value);
  const source = normalized || normalizedFailureInput(errorType);

  if (source.includes('safety')) return 'safety_filter';
  if (
    source.includes('invalid_input') ||
    source.includes('invalid_base64') ||
    source.includes('validation') ||
    source.includes('dimension')
  ) {
    return 'invalid_input';
  }
  if (source.includes('image_too_large') || source.includes('file_size')) {
    return 'image_too_large';
  }
  if (source.includes('timeout')) return 'timeout';
  if (source.includes('rate_limit')) return 'rate_limit';
  if (source.includes('authentication')) return 'provider_authentication';
  if (source.includes('billing') || source.includes('provider_402')) return 'provider_billing';
  if (source.includes('provider_unavailable') || source.includes('circuit')) {
    return 'provider_unavailable';
  }
  if (source.includes('insufficient_credit') || source.includes('free_limit')) {
    return 'insufficient_credits';
  }
  if (source.includes('batch_limit')) return 'batch_limit';
  if (source.includes('account_setup')) return 'account_setup';
  if (source.includes('no_output')) return 'no_output';
  if (source.includes('processing_failed') || source.includes('ai_generation')) {
    return 'processing_failed';
  }
  if (source.includes('unexpected') || source.includes('internal')) return 'internal_error';
  return 'unknown';
}

function defaultRetryable(errorType: TProcessingErrorType): boolean {
  return [
    'timeout',
    'rate_limited',
    'provider_unavailable',
    'provider_authentication',
    'provider_billing',
    'no_output',
    'processing_failed',
    'internal',
    'unknown',
  ].includes(errorType);
}

export function normalizeRetryable(value: unknown, errorType: TProcessingErrorType): boolean {
  return typeof value === 'boolean' ? value : defaultRetryable(errorType);
}

export function normalizeMimeFamily(value: unknown): TImageMimeFamily {
  if (typeof value !== 'string') return 'unknown';

  const normalized = value.trim().toLowerCase().split(';', 1)[0];
  const familyByMime: Record<string, TImageMimeFamily> = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heic',
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/tiff': 'tiff',
    'image/bmp': 'bmp',
  };

  if (familyByMime[normalized]) return familyByMime[normalized];
  if (normalized.startsWith('image/')) return 'other';
  return 'unknown';
}

export function normalizeFileSizeBucket(value: unknown): TFileSizeBucket {
  if (
    value === '<1MB' ||
    value === '1-5MB' ||
    value === '5-10MB' ||
    value === '10-25MB' ||
    value === '25MB+'
  ) {
    return value;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'unknown';
  if (value < MEGABYTE) return '<1MB';
  if (value <= 5 * MEGABYTE) return '1-5MB';
  if (value <= 10 * MEGABYTE) return '5-10MB';
  if (value <= 25 * MEGABYTE) return '10-25MB';
  return '25MB+';
}

/** Estimate bytes from a base64/data URL without returning the raw size. */
export function estimateBase64ByteLength(value: unknown): number | null {
  if (typeof value !== 'string') return null;

  const commaIndex = value.indexOf(',');
  const base64 = (commaIndex >= 0 ? value.slice(commaIndex + 1) : value)
    .replace(/\s/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  if (!base64 || !/^[a-z0-9+/]*={0,2}$/i.test(base64)) return null;

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function normalizeAccountCreatedProperties(
  input: IAccountCreatedEventInput | unknown
): IAccountCreatedEventProperties {
  const source = asRecord(input);
  const method = source.method;
  const normalizedMethod: TAccountCreatedMethod =
    method === 'email' || method === 'google' || method === 'facebook' || method === 'azure'
      ? method
      : 'unknown';
  const utmSource = normalizeUtm(source.utmSource);
  const utmMedium = normalizeUtm(source.utmMedium);
  const utmCampaign = normalizeUtm(source.utmCampaign);

  return {
    method: normalizedMethod,
    pricingRegion: normalizeUtm(source.pricingRegion),
    utmSource,
    utmMedium,
    utmCampaign,
    attributionAvailable:
      typeof source.attributionAvailable === 'boolean'
        ? source.attributionAvailable
        : Boolean(utmSource || utmMedium || utmCampaign),
  };
}

export function normalizeImageUpscaledProperties(
  input: IImageUpscaledEventInput | unknown
): IImageUpscaledEventProperties {
  const source = asRecord(input);
  const inputRecord = asRecord(source.inputDimensions);
  const outputRecord = asRecord(source.outputDimensions);
  const fileSizeBucket =
    normalizeFileSizeBucket(source.fileSizeBucket) !== 'unknown'
      ? normalizeFileSizeBucket(source.fileSizeBucket)
      : normalizeFileSizeBucket(
          source.fileSizeBytes ?? source.fileSize ?? estimateBase64ByteLength(source.imageData)
        );

  return {
    qualityTier: normalizeQualityTier(source.qualityTier),
    scaleFactor: normalizeScale(source.scaleFactor),
    inputWidth: normalizeDimension(source.inputWidth ?? inputRecord.width),
    inputHeight: normalizeDimension(source.inputHeight ?? inputRecord.height),
    outputWidth: normalizeDimension(source.outputWidth ?? outputRecord.width),
    outputHeight: normalizeDimension(source.outputHeight ?? outputRecord.height),
    fileType: normalizeMimeFamily(source.fileType),
    fileSizeBucket,
    durationMs: normalizeDuration(source.durationMs),
  };
}

export function normalizeProcessingFailedProperties(
  input: IProcessingFailedEventInput | unknown
): IProcessingFailedEventProperties {
  const source = asRecord(input);
  const errorType = normalizeErrorType(source.errorType ?? source.reason);

  return {
    errorType,
    reason: normalizeReason(source.reason, source.errorType),
    provider: normalizeProvider(source.provider),
    model: normalizeModel(source.model),
    qualityTier: normalizeQualityTier(source.qualityTier),
    retryable: normalizeRetryable(source.retryable, errorType),
    durationMs: normalizeDuration(source.durationMs),
    requestId: normalizeRequestId(source.requestId),
  };
}

export function normalizeCoreEventProperties<T extends TCoreEventName>(
  eventName: T,
  input: unknown
): ICoreEventPropertiesMap[T] {
  switch (eventName) {
    case 'account_created':
      return normalizeAccountCreatedProperties(input) as ICoreEventPropertiesMap[T];
    case 'image_upscaled':
      return normalizeImageUpscaledProperties(input) as ICoreEventPropertiesMap[T];
    case 'processing_failed':
      return normalizeProcessingFailedProperties(input) as ICoreEventPropertiesMap[T];
  }
}

/** Short alias for callers that treat the contract as a single normalizer. */
export const normalizeCoreEvent = normalizeCoreEventProperties;
