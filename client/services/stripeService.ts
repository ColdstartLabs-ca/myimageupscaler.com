import type {
  ICheckoutSessionRequest,
  ICheckoutSessionResponse,
  ISubscription,
  IUserProfile,
} from '@/shared/types/stripe.types';
import { supabase } from '@server/supabase/supabaseClient';

interface ICreditTransaction {
  id: string;
  amount: number;
  type: 'purchase' | 'subscription' | 'usage' | 'refund' | 'bonus';
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

interface ICreditHistoryResponse {
  transactions: ICreditTransaction[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

interface ISubscriptionPreviewResponse {
  proration: {
    amount_due: number;
    currency: string;
    period_start: string;
    period_end: string;
  };
  is_downgrade: boolean;
  effective_date?: string;
}

interface ISubscriptionChangeResponse {
  subscription_id: string;
  status: string;
  new_price_id: string;
  effective_immediately: boolean;
  current_period_start: string;
  current_period_end: string;
}

// =============================================================================
// Session Cache for Optimistic Loading (Phase 3A)
// =============================================================================

interface ICachedCheckoutSession {
  clientSecret: string;
  priceId: string;
  timestamp: number;
  sessionId: string;
  url: string;
}

const SESSION_CACHE_TTL_MS = 60000; // 1 minute TTL for checkout sessions
const checkoutSessionCache = new Map<string, ICachedCheckoutSession>();

/**
 * Generate a cache key for checkout sessions
 */
function getCacheKey(priceId: string, uiMode: 'hosted' | 'embedded'): string {
  return `${priceId}:${uiMode}`;
}

/**
 * Get a cached checkout session if still valid
 */
function getCachedSession(
  priceId: string,
  uiMode: 'hosted' | 'embedded'
): ICachedCheckoutSession | null {
  const key = getCacheKey(priceId, uiMode);
  const cached = checkoutSessionCache.get(key);

  if (!cached) return null;

  // Check if cache entry is still valid
  if (Date.now() - cached.timestamp > SESSION_CACHE_TTL_MS) {
    checkoutSessionCache.delete(key);
    return null;
  }

  return cached;
}

/**
 * Cache a checkout session
 */
function cacheSession(
  priceId: string,
  uiMode: 'hosted' | 'embedded',
  session: ICheckoutSessionResponse
): void {
  const key = getCacheKey(priceId, uiMode);
  checkoutSessionCache.set(key, {
    clientSecret: session.clientSecret || '',
    priceId,
    timestamp: Date.now(),
    sessionId: session.sessionId,
    url: session.url,
  });
}

/**
 * Clear the checkout session cache (call on successful purchase or error)
 */
export function clearCheckoutSessionCache(): void {
  checkoutSessionCache.clear();
}

/**
 * Preload a checkout session for faster modal display
 * Call this on hover/focus of upgrade buttons for optimistic UI loading
 *
 * @param priceId - The Stripe Price ID
 * @param uiMode - The UI mode for checkout
 * @returns Promise that resolves when preloading is complete (or fails silently)
 */
export async function preloadCheckoutSession(
  priceId: string,
  uiMode: 'hosted' | 'embedded' = 'embedded'
): Promise<void> {
  // Check if we already have a valid cached session
  const cached = getCachedSession(priceId, uiMode);
  if (cached) {
    return;
  }

  try {
    // Create session in background - use internal method to avoid circular dependency
    const session = await createCheckoutSessionInternal(priceId, { uiMode });
    cacheSession(priceId, uiMode, session);
  } catch {
    // Silently fail - the actual checkout will retry
  }
}

/**
 * Internal method to create checkout session (used by preload)
 */
async function createCheckoutSessionInternal(
  priceId: string,
  options?: {
    successUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, string>;
    uiMode?: 'hosted' | 'embedded';
  }
): Promise<ICheckoutSessionResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('User not authenticated');
  }

  const request: ICheckoutSessionRequest = {
    priceId,
    successUrl: options?.successUrl,
    cancelUrl: options?.cancelUrl,
    metadata: options?.metadata,
    uiMode: options?.uiMode,
  };

  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorResponse = await response.json();
    const errorMessage =
      typeof errorResponse.error === 'string'
        ? errorResponse.error
        : errorResponse.error?.message || 'Failed to create checkout session';
    const error = new Error(errorMessage);
    // Attach error code for specific handling
    (error as Error & { code?: string }).code = errorResponse.error?.code;
    throw error;
  }

  const responseJson = await response.json();

  // Handle both wrapped and unwrapped response formats
  if (responseJson.success && responseJson.data) {
    return responseJson.data as ICheckoutSessionResponse;
  } else {
    return responseJson as ICheckoutSessionResponse;
  }
}

/**
 * Frontend service for Stripe operations
 * All methods interact with the backend API routes or Supabase
 */
export class StripeService {
  /**
   * Create a Stripe Checkout Session
   * Uses cache for embedded mode to enable optimistic loading
   *
   * @param priceId - The Stripe Price ID
   * @param options - Additional options for the checkout session
   * @returns The checkout session data (URL for hosted, clientSecret for embedded)
   */
  static async createCheckoutSession(
    priceId: string,
    options?: {
      successUrl?: string;
      cancelUrl?: string;
      metadata?: Record<string, string>;
      uiMode?: 'hosted' | 'embedded';
    }
  ): Promise<ICheckoutSessionResponse> {
    const uiMode = options?.uiMode || 'hosted';

    // Check cache for embedded mode (used by modal for faster display)
    if (uiMode === 'embedded') {
      const cached = getCachedSession(priceId, uiMode);
      if (cached) {
        // Return cached session data
        return {
          clientSecret: cached.clientSecret,
          sessionId: cached.sessionId,
          url: cached.url,
        };
      }
    }

    // Create new session
    const response = await createCheckoutSessionInternal(priceId, options);

    // Cache for future use if embedded mode
    if (uiMode === 'embedded' && response.clientSecret) {
      cacheSession(priceId, uiMode, response);
    }

    return response;
  }

  /**
   * Redirect to Stripe Checkout
   * @param priceId - The Stripe Price ID
   * @param options - Additional options for the checkout session
   */
  static async redirectToCheckout(
    priceId: string,
    options?: {
      successUrl?: string;
      cancelUrl?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<void> {
    try {
      const { url } = await this.createCheckoutSession(priceId, options);

      if (!url) {
        throw new Error('Failed to generate checkout URL');
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        throw new Error('Invalid checkout URL generated');
      }

      window.location.href = url;
    } catch (error) {
      // Re-throw with more context for the component to handle
      if (error instanceof Error && error.message.includes('User not authenticated')) {
        throw error; // Let auth errors bubble up
      }

      // Wrap other errors with more context
      if (error instanceof Error) {
        throw new Error(`Checkout failed: ${error.message}`);
      }

      throw new Error('Failed to initiate checkout');
    }
  }

  /**
   * Purchase credits with a credit pack
   * @param packKey - The key of the credit pack (e.g., 'small', 'medium', 'large')
   * @param options - Additional options for the checkout session
   * @returns The checkout session data (URL and sessionId)
   */
  static async purchaseCredits(
    packKey: string,
    options?: {
      uiMode?: 'hosted' | 'embedded';
      successUrl?: string;
      cancelUrl?: string;
    }
  ): Promise<{ url: string; sessionId: string; clientSecret?: string }> {
    // Dynamic import to avoid importing server-only config on client
    const { getCreditPackByKey } = await import('@shared/config/subscription.utils');

    const pack = getCreditPackByKey(packKey);
    if (!pack) {
      throw new Error(`Invalid credit pack: ${packKey}`);
    }

    const response = await this.createCheckoutSession(pack.stripePriceId!, {
      uiMode: options?.uiMode || 'hosted',
      successUrl: options?.successUrl,
      cancelUrl: options?.cancelUrl,
    });

    return {
      url: response.url,
      sessionId: response.sessionId,
      clientSecret: response.clientSecret,
    };
  }

  /**
   * Get the current user's profile
   * @returns The user's profile with credits and subscription info
   */
  static async getUserProfile(): Promise<IUserProfile | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    return data;
  }

  /**
   * Get the user's active subscription
   * @returns The user's active subscription or null
   */
  static async getActiveSubscription(): Promise<ISubscription | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching subscription:', error);
      return null;
    }

    return data;
  }

  /**
   * Check if the user has sufficient credits
   * @param requiredAmount - The number of credits required
   * @returns True if the user has sufficient credits
   */
  static async hasSufficientCredits(requiredAmount: number): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const { data, error } = await supabase.rpc('has_sufficient_credits', {
      target_user_id: user.id,
      required_amount: requiredAmount,
    });

    if (error) {
      console.error('Error checking credits:', error);
      return false;
    }

    return data || false;
  }

  /**
   * Decrement user credits (for usage tracking)
   * @param amount - The number of credits to deduct
   * @returns The new credits balance
   */
  static async decrementCredits(amount: number): Promise<number> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase.rpc('decrement_credits', {
      target_user_id: user.id,
      amount,
    });

    if (error) {
      throw new Error(error.message || 'Failed to decrement credits');
    }

    return data;
  }

  /**
   * Create a Stripe Customer Portal session
   * @returns The portal URL to redirect the user to
   */
  static async createPortalSession(): Promise<{ url: string }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch('/api/portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create portal session');
    }

    const result = await response.json();
    return result.data; // Extract { url } from { success, data: { url } }
  }

  /**
   * Redirect to Stripe Customer Portal
   */
  static async redirectToPortal(): Promise<void> {
    const { url } = await this.createPortalSession();
    window.location.href = url;
  }

  /**
   * Get credit history for the current user
   * @param limit - Maximum number of transactions to fetch
   * @param offset - Number of transactions to skip
   * @returns Object with transactions array and pagination info
   */
  static async getCreditHistory(
    limit: number = 50,
    offset: number = 0
  ): Promise<ICreditHistoryResponse> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`/api/credits/history?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch credit history');
    }

    const result = await response.json();
    return result.success ? result.data : result;
  }

  /**
   * Preview subscription change costs
   * @param targetPriceId - The target price ID to change to
   * @returns Preview data with proration information
   */
  static async previewSubscriptionChange(targetPriceId: string): Promise<
    ISubscriptionPreviewResponse & {
      current_plan: {
        name: string;
        price_id: string;
        credits_per_month: number;
      } | null;
      new_plan: {
        name: string;
        price_id: string;
        credits_per_month: number;
      };
      effective_immediately: boolean;
    }
  > {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch('/api/subscription/preview-change', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ targetPriceId }),
    });

    if (!response.ok) {
      const errorResponse = await response.json();
      const errorMessage =
        typeof errorResponse.error === 'string'
          ? errorResponse.error
          : errorResponse.error?.message || 'Failed to preview subscription change';
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const apiData = result.success ? result.data : result;

    // Return API response directly (server already provides all fields)
    return apiData;
  }

  /**
   * Change subscription to a new price tier
   * @param targetPriceId - The target price ID to change to
   * @returns Subscription change result
   */
  static async changeSubscription(targetPriceId: string): Promise<ISubscriptionChangeResponse> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch('/api/subscription/change', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ targetPriceId }),
    });

    if (!response.ok) {
      const errorResponse = await response.json();
      const errorMessage =
        typeof errorResponse.error === 'string'
          ? errorResponse.error
          : errorResponse.error?.message || 'Failed to change subscription';
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result.success ? result.data : result;
  }

  /**
   * Cancel a scheduled subscription change (downgrade)
   * @returns Success message
   */
  static async cancelScheduledChange(): Promise<{ message: string }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch('/api/subscription/cancel-scheduled', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to cancel scheduled change');
    }

    const result = await response.json();
    return result.success ? result.data : result;
  }

  /**
   * Cancel the current subscription (at period end)
   * @param reason - Optional reason for cancellation
   * @returns Cancellation result with period end date
   */
  static async cancelSubscription(reason?: string): Promise<{
    subscription_id: string;
    cancel_at_period_end: boolean;
    current_period_end: number;
  }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch('/api/subscriptions/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to cancel subscription');
    }

    const result = await response.json();
    return result.success ? result.data : result;
  }
}
