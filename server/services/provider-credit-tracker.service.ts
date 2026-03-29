/**
 * Provider Credit Tracker Service
 *
 * Tracks AI and email provider usage for free tier limits and enables auto-switching
 * when providers hit their free tier limits.
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type {
  IProviderFreeTier,
  IProviderUsage,
  IEmailProviderUsage,
} from '@shared/types/provider-adapter.types';
import { AIProvider, EmailProvider } from '@shared/types/provider-adapter.types';
import { serverEnv } from '@shared/config/env';

dayjs.extend(utc);

/**
 * Default free tier limits for AI providers
 */
const AI_PROVIDER_FREE_TIERS: Record<AIProvider, IProviderFreeTier> = {
  [AIProvider.REPLICATE]: {
    dailyRequests: 0, // Pay-as-you-go, no free tier
    monthlyCredits: 0,
    hardLimit: false,
    resetTimezone: 'UTC',
  },
  [AIProvider.GEMINI]: {
    dailyRequests: 500, // 500 free requests per day
    monthlyCredits: 15000, // ~500/day * 30 days
    hardLimit: true,
    resetTimezone: 'UTC',
  },
  [AIProvider.STABILITY_AI]: {
    dailyRequests: 0, // TBD
    monthlyCredits: 0,
    hardLimit: false,
    resetTimezone: 'UTC',
  },
  [AIProvider.OPENAI]: {
    dailyRequests: 0, // TBD
    monthlyCredits: 0,
    hardLimit: false,
    resetTimezone: 'UTC',
  },
};

/**
 * Default free tier limits for email providers
 */
const EMAIL_PROVIDER_FREE_TIERS: Record<EmailProvider, IProviderFreeTier> = {
  [EmailProvider.BREVO]: {
    dailyRequests: 300, // 300 free emails/day
    monthlyCredits: 9000, // ~300/day * 30 days
    hardLimit: true,
    resetTimezone: 'UTC',
  },
  [EmailProvider.RESEND]: {
    dailyRequests: 100, // 3,000 free emails/month (~100/day)
    monthlyCredits: 3000,
    hardLimit: true,
    resetTimezone: 'UTC',
  },
};

/**
 * Service for tracking provider usage and managing free tier limits
 * Supports both AI and email providers
 */
export class ProviderCreditTracker {
  /**
   * Check if provider is available (within free tier limits)
   */
  async isProviderAvailable(provider: AIProvider | EmailProvider): Promise<boolean> {
    const limits = this.getProviderLimits(provider);

    // If no limits defined, provider is always available
    if (limits.dailyRequests === 0 && limits.monthlyCredits === 0) {
      return true;
    }

    // Check current usage
    const usage = await this.getProviderUsage(provider);
    const now = dayjs.utc();
    const today = now.format('YYYY-MM-DD');
    const currentMonth = now.format('YYYY-MM');

    // Parse reset timestamps and extract date/month for comparison
    const lastResetDate = dayjs.utc(usage.lastDailyReset).format('YYYY-MM-DD');
    const lastMonthlyResetMonth = dayjs.utc(usage.lastMonthlyReset).format('YYYY-MM');

    // Check if we need to reset daily counters
    if (lastResetDate !== today) {
      await this.resetDailyCounters(provider);
      usage.todayRequests = 0;
    }

    // Check if we need to reset monthly counters
    if (lastMonthlyResetMonth !== currentMonth) {
      await this.resetMonthlyCounters(provider);
      usage.monthCredits = 0;
    }

    // Check daily limit
    if (limits.dailyRequests > 0 && usage.todayRequests >= limits.dailyRequests) {
      return false;
    }

    // Check monthly limit
    if (limits.monthlyCredits > 0 && usage.monthCredits >= limits.monthlyCredits) {
      return false;
    }

    return true;
  }

  /**
   * Check if provider is an email provider
   */
  private isEmailProvider(provider: AIProvider | EmailProvider): provider is EmailProvider {
    return Object.values(EmailProvider).includes(provider as EmailProvider);
  }

  /**
   * Increment provider usage after processing
   */
  async incrementUsage(
    provider: AIProvider | EmailProvider,
    requests: number = 1,
    credits: number = 0
  ): Promise<{
    success: boolean;
    dailyRemaining: number | null;
    monthlyRemaining: number | null;
    error?: string;
  }> {
    try {
      // Use separate RPC for email vs AI providers
      const rpcName = this.isEmailProvider(provider)
        ? 'increment_email_provider_usage'
        : 'increment_provider_usage';

      const { data, error } = await supabaseAdmin.rpc(rpcName, {
        p_provider: provider as string,
        p_requests: requests,
        p_credits: credits,
      });

      if (error) {
        console.error(`Failed to increment usage for ${provider}:`, error);
        return {
          success: false,
          dailyRemaining: null,
          monthlyRemaining: null,
          error: error.message,
        };
      }

      return {
        success: data?.[0]?.success ?? false,
        dailyRemaining: data?.[0]?.daily_requests_remaining ?? null,
        monthlyRemaining: data?.[0]?.monthly_credits_remaining ?? null,
      };
    } catch (error) {
      console.error(`Error incrementing usage for ${provider}:`, error);
      return {
        success: false,
        dailyRemaining: null,
        monthlyRemaining: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current provider usage statistics
   */
  async getProviderUsage(
    provider: AIProvider | EmailProvider
  ): Promise<IProviderUsage | IEmailProviderUsage> {
    try {
      // Use separate RPC for email vs AI providers
      const rpcName = this.isEmailProvider(provider)
        ? 'get_or_create_email_provider_usage'
        : 'get_or_create_provider_usage';

      const { data, error } = await supabaseAdmin.rpc(rpcName, {
        p_provider: provider as string,
      });

      if (error || !data || data.length === 0) {
        // Return default usage if record doesn't exist
        return this.getDefaultUsage(provider);
      }

      const record = data[0];
      return {
        provider,
        todayRequests: record.daily_requests || 0,
        monthCredits: record.monthly_credits || 0,
        lastDailyReset: record.last_daily_reset || dayjs.utc().toISOString(),
        lastMonthlyReset: record.last_monthly_reset || dayjs.utc().toISOString(),
        totalRequests: 0, // Would need to aggregate all-time data
        totalCredits: 0,
      };
    } catch (error) {
      console.error(`Error getting usage for ${provider}:`, error);
      return this.getDefaultUsage(provider);
    }
  }

  /**
   * Reset daily counters for a provider
   */
  async resetDailyCounters(provider: AIProvider | EmailProvider): Promise<void> {
    try {
      const now = dayjs.utc();
      const today = now.format('YYYY-MM-DD');

      // Use separate table for email vs AI providers
      const tableName = this.isEmailProvider(provider) ? 'email_provider_usage' : 'provider_usage';

      const { error } = await supabaseAdmin
        .from(tableName)
        .update({
          daily_requests: 0,
          last_daily_reset: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('provider', provider as string)
        .eq('date', today);

      if (error) {
        console.error(`Failed to reset daily counters for ${provider}:`, error);
      }
    } catch (error) {
      console.error(`Error resetting daily counters for ${provider}:`, error);
    }
  }

  /**
   * Reset monthly counters for a provider
   */
  async resetMonthlyCounters(provider: AIProvider | EmailProvider): Promise<void> {
    try {
      const now = dayjs.utc();
      const month = now.format('YYYY-MM');

      // Use separate table for email vs AI providers
      const tableName = this.isEmailProvider(provider) ? 'email_provider_usage' : 'provider_usage';

      const { error } = await supabaseAdmin
        .from(tableName)
        .update({
          monthly_credits: 0,
          last_monthly_reset: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('provider', provider as string)
        .eq('month', month);

      if (error) {
        console.error(`Failed to reset monthly counters for ${provider}:`, error);
      }
    } catch (error) {
      console.error(`Error resetting monthly counters for ${provider}:`, error);
    }
  }

  /**
   * Get free tier limits for a provider
   */
  getProviderLimits(provider: AIProvider | EmailProvider): IProviderFreeTier {
    // Check if it's an AI provider
    if (Object.values(AIProvider).includes(provider as AIProvider)) {
      return AI_PROVIDER_FREE_TIERS[provider as AIProvider];
    }
    // Check if it's an email provider
    if (Object.values(EmailProvider).includes(provider as EmailProvider)) {
      return EMAIL_PROVIDER_FREE_TIERS[provider as EmailProvider];
    }
    // Default: no limits
    return {
      dailyRequests: 0,
      monthlyCredits: 0,
      hardLimit: false,
      resetTimezone: 'UTC',
    };
  }

  /**
   * Get usage summary for all providers
   */
  async getAllProvidersUsage(): Promise<Record<AIProvider, IProviderUsage>> {
    const providers = Object.values(AIProvider);
    const usagePromises = providers.map(async provider => ({
      provider,
      usage: await this.getProviderUsage(provider),
    }));

    const results = await Promise.all(usagePromises);

    return results.reduce(
      (acc, { provider, usage }) => {
        acc[provider] = usage as IProviderUsage;
        return acc;
      },
      {} as Record<AIProvider, IProviderUsage>
    );
  }

  /**
   * Get default usage object for a provider
   */
  private getDefaultUsage(
    provider: AIProvider | EmailProvider
  ): IProviderUsage | IEmailProviderUsage {
    const today = dayjs.utc().format('YYYY-MM-DD');

    // Check if it's an AI provider
    if (Object.values(AIProvider).includes(provider as AIProvider)) {
      return {
        provider: provider as AIProvider,
        todayRequests: 0,
        monthCredits: 0,
        lastDailyReset: today,
        lastMonthlyReset: today,
        totalRequests: 0,
        totalCredits: 0,
      } as IProviderUsage;
    }

    // Email provider
    return {
      provider: provider as EmailProvider,
      todayRequests: 0,
      monthCredits: 0,
      lastDailyReset: today,
      lastMonthlyReset: today,
      totalRequests: 0,
      totalCredits: 0,
    } as IEmailProviderUsage;
  }

  /**
   * Log provider usage to console (for debugging/monitoring)
   */
  logProviderUsage(provider: AIProvider | EmailProvider): void {
    // Skip verbose logging in development
    if (serverEnv.ENV === 'development') {
      console.log(`[ProviderTracker] Skipped usage log in development: ${provider}`);
      return;
    }

    this.getProviderUsage(provider).then(usage => {
      const limits = this.getProviderLimits(provider);
      console.log(`[ProviderTracker] ${provider}:`, {
        daily: `${usage.todayRequests}/${limits.dailyRequests || '∞'}`,
        monthly: `${usage.monthCredits}/${limits.monthlyCredits || '∞'}`,
        available: limits.dailyRequests > 0 || limits.monthlyCredits > 0,
      });
    });
  }
}

// Singleton instance
let trackerInstance: ProviderCreditTracker | null = null;

export function getProviderCreditTracker(): ProviderCreditTracker {
  if (!trackerInstance) {
    trackerInstance = new ProviderCreditTracker();
  }
  return trackerInstance;
}
