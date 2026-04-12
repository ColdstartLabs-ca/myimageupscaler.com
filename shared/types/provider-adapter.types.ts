/**
 * Provider Adapter Types
 *
 * Defines the adapter pattern for AI and email providers with:
 * - Provider credit tracking (free tier limits)
 * - Auto-switching when limits are reached
 * - Fallback provider support
 */

import type {
  IImageProcessor,
  IProcessImageOptions,
  IImageProcessorResult,
} from '@server/services/image-processor.interface';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';

/**
 * Supported AI providers
 */
export enum AIProvider {
  REPLICATE = 'replicate',
  GEMINI = 'gemini',
  STABILITY_AI = 'stability_ai', // Future
  OPENAI = 'openai', // Future
}

/**
 * Supported email providers
 */
export enum EmailProvider {
  BREVO = 'brevo',
  RESEND = 'resend',
}

/**
 * Provider tier/pricing model
 */
export enum ProviderTier {
  FREE = 'free',
  PAID = 'paid',
  HYBRID = 'hybrid', // Free with paid overage
}

/**
 * Provider free tier limits
 * Number of free requests/credits per time period
 */
export interface IProviderFreeTier {
  /** Daily request limit */
  dailyRequests: number;
  /** Monthly credit/minute limit */
  monthlyCredits: number;
  /** Whether limits are hard (reject) or soft (charge) */
  hardLimit: boolean;
  /** Reset timezone (UTC) */
  resetTimezone: string;
}

/**
 * Provider usage statistics for tracking
 */
export interface IProviderUsage {
  provider: AIProvider;
  /** Requests used today */
  todayRequests: number;
  /** Credits used this month */
  monthCredits: number;
  /** Last reset timestamp */
  lastDailyReset: string;
  /** Last monthly reset timestamp */
  lastMonthlyReset: string;
  /** Total requests all time */
  totalRequests: number;
  /** Total credits all time */
  totalCredits: number;
}

/**
 * Provider configuration
 */
export interface IProviderConfig {
  provider: AIProvider;
  tier: ProviderTier;
  /** Priority for selection (lower = higher priority) */
  priority: number;
  /** Free tier limits (if applicable) */
  freeTier?: IProviderFreeTier;
  /** Whether provider is currently enabled */
  enabled: boolean;
  /** Provider-specific models supported */
  supportedModels: string[];
  /** Fallback provider if this one fails or hits limits */
  fallbackProvider?: AIProvider;
}

/**
 * Provider adapter interface
 * Wraps IImageProcessor with credit tracking and auto-switching
 */
export interface IProviderAdapter {
  /** Process image with automatic credit tracking and provider switching */
  processImage(
    userId: string,
    input: IUpscaleInput,
    options?: IProcessImageOptions
  ): Promise<IImageProcessorResult>;

  /** Get current provider config */
  getConfig(): IProviderConfig;

  /** Get provider usage statistics */
  getUsage(): Promise<IProviderUsage>;

  /** Check if provider is available (within limits) */
  isAvailable(): Promise<boolean>;

  /** Reset daily/monthly counters */
  resetCounters(period: 'daily' | 'monthly'): Promise<void>;

  /** Get underlying processor */
  getProcessor(): IImageProcessor;

  /** Get provider name */
  getProviderName(): string;
}

/**
 * Provider selection context
 */
export interface IProviderSelectionContext {
  userId: string;
  requestedModel?: string;
  useCase?: string;
  subscriptionTier?: string;
  userCredits?: number;
}

/**
 * Provider manager interface
 * Manages multiple providers with auto-switching
 */
export interface IProviderManager {
  /** Get best available provider for the request */
  getProvider(context: IProviderSelectionContext): Promise<IProviderAdapter>;

  /** Process image with automatic provider selection */
  processImage(
    userId: string,
    input: IUpscaleInput,
    options?: IProcessImageOptions
  ): Promise<IImageProcessorResult>;

  /** Register a new provider adapter */
  registerProvider(adapter: IProviderAdapter): void;

  /** Get all registered providers */
  getAllProviders(): IProviderAdapter[];

  /** Get provider by type name */
  getProviderByType(provider: AIProvider): IProviderAdapter | undefined;

  /** Update provider configuration */
  updateProviderConfig(provider: AIProvider, config: Partial<IProviderConfig>): void;
}

/**
 * Email provider parameters
 */
export interface ISendEmailParams {
  to: string;
  template: string;
  data: Record<string, unknown>;
  type?: 'transactional' | 'marketing';
  userId?: string;
  /** Optional subject override (uses template default if not provided) */
  subject?: string;
}

/**
 * Email send result
 */
export interface ISendEmailResult {
  success: boolean;
  skipped?: boolean;
  messageId?: string;
  provider?: EmailProvider;
  error?: string;
}

/**
 * Email provider usage statistics
 */
export interface IEmailProviderUsage {
  provider: EmailProvider;
  todayRequests: number;
  monthCredits: number;
  lastDailyReset: string;
  lastMonthlyReset: string;
  totalRequests: number;
  totalCredits: number;
}

/**
 * Email provider configuration
 */
export interface IEmailProviderConfig {
  provider: EmailProvider;
  tier: ProviderTier;
  priority: number;
  enabled: boolean;
  freeTier?: IProviderFreeTier;
  fallbackProvider?: EmailProvider;
}

/**
 * Email provider adapter interface
 * Provides a unified interface for sending emails across different providers
 */
export interface IEmailProviderAdapter {
  /** Send email with automatic provider switching on failure */
  send(params: ISendEmailParams): Promise<ISendEmailResult>;

  /** Get current provider config */
  getConfig(): IEmailProviderConfig;

  /** Get provider usage statistics */
  getUsage(): Promise<IEmailProviderUsage>;

  /** Check if provider is available (within limits) */
  isAvailable(): Promise<boolean>;

  /** Reset daily/monthly counters */
  resetCounters(period: 'daily' | 'monthly'): Promise<void>;

  /** Get provider name */
  getProviderName(): string;
}

/**
 * Email provider manager interface
 * Manages multiple email providers with auto-switching
 */
export interface IEmailProviderManager {
  /** Get best available email provider */
  getProvider(context?: {
    userId?: string;
    type?: 'transactional' | 'marketing';
  }): Promise<IEmailProviderAdapter>;

  /** Send email with automatic provider selection and fallback */
  send(params: ISendEmailParams): Promise<ISendEmailResult>;

  /** Register a new email provider adapter */
  registerProvider(adapter: IEmailProviderAdapter): void;

  /** Get all registered providers */
  getAllProviders(): IEmailProviderAdapter[];

  /** Get provider by type */
  getProviderByType(provider: EmailProvider): IEmailProviderAdapter | undefined;

  /** Update provider configuration */
  updateProviderConfig(provider: EmailProvider, config: Partial<IEmailProviderConfig>): void;
}
