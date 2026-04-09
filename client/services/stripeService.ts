import type {
  ICheckoutSessionRequest,
  ICheckoutSessionResponse,
  ISubscription,
  IUserProfile,
} from '@/shared/types/stripe.types';
import type {
  ICheckoutRescueOffer,
  ICheckoutRescueOfferRequest,
  ICheckoutRescueOfferResponse,
} from '@shared/types/checkout-offer';
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
  engagementDiscountApplied?: boolean;
  checkoutOfferApplied?: boolean;
}

const SESSION_CACHE_TTL_MS = 60000; // 1 minute TTL for checkout sessions
const checkoutSessionCache = new Map<string, ICachedCheckoutSession>();

/**
 * Generate a cache key for checkout sessions
 */
function serializeMetadata(metadata?: Record<string, string>): string {
  if (!metadata) return 'no-metadata';

  const entries = Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return 'no-metadata';

  return entries.map(([key, value]) => `${key}=${value}`).join('&');
}

function getCacheKey(
  priceId: string,
  uiMode: 'hosted' | 'embedded',
  options?: {
    successUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, string>;
    offerToken?: string;
  }
): string {
  return [
    priceId,
    uiMode,
    options?.offerToken || 'standard',
    options?.successUrl || 'default-success',
    options?.cancelUrl || 'default-cancel',
    serializeMetadata(options?.metadata),
  ].join(':');
}

/**
 * Get a cached checkout session if still valid
 */
function getCachedSession(
  priceId: string,
  uiMode: 'hosted' | 'embedded',
  options?: {
    successUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, string>;
    offerToken?: string;
  }
): ICachedCheckoutSession | null {
  const key = getCacheKey(priceId, uiMode, options);
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
  options:
    | {
        successUrl?: string;
        cancelUrl?: string;
        metadata?: Record<string, string>;
        offerToken?: string;
      }
    | undefined,
  session: ICheckoutSessionResponse
): void {
  const key = getCacheKey(priceId, uiMode, options);
  checkoutSessionCache.set(key, {
    clientSecret: session.clientSecret || '',
    priceId,
    timestamp: Date.now(),
    sessionId: session.sessionId,
    url: session.url,
    engagementDiscountApplied: session.engagementDiscountApplied,
    checkoutOfferApplied: session.checkoutOfferApplied,
  });
}

/**
 * Clear the checkout session cache (call on successful purchase or error)
 */
export function clearCheckoutSessionCache(): void {
  checkoutSessionCache.clear();
}

// =============================================================================
// Stripe.js Preloading (Phase 3A - Checkout Friction Optimization)
// =============================================================================

let stripePreloaded = false;

/**
 * Preload Stripe.js to reduce checkout embed load time
 * Call this on pages where checkout is likely (e.g., billing page, dashboard)
 *
 * This reduces the embed load time by ~500ms by loading the Stripe.js
 * script before the user clicks checkout.
 */
export function preloadStripe(): void {
  // Only run in browser
  if (typeof window === 'undefined') return;

  // Only preload once
  if (stripePreloaded) return;

  // Check if already loaded by another mechanism
  if (document.querySelector('script[src*="js.stripe.com"]')) {
    stripePreloaded = true;
    return;
  }

  // Create and inject the script
  const script = document.createElement('script');
  script.src = 'https://js.stripe.com/v3/';
  script.async = true;
  script.onload = () => {
    stripePreloaded = true;
  };
  script.onerror = () => {
    // Reset on error so we can try again
    stripePreloaded = false;
  };

  document.head.appendChild(script);
}

/**
 * Check if Stripe.js has been preloaded
 */
export function isStripePreloaded(): boolean {
  return stripePreloaded;
}

/**
 * Internal method to create checkout session
 */
async function createCheckoutSessionInternal(
  priceId: string,
  options?: {
    successUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, string>;
    uiMode?: 'hosted' | 'embedded';
    offerToken?: string;
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
    offerToken: options?.offerToken,
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
      offerToken?: string;
    }
  ): Promise<ICheckoutSessionResponse> {
    const uiMode = options?.uiMode || 'hosted';

    // Check cache for embedded mode (used by modal for faster display)
    if (uiMode === 'embedded') {
      const cached = getCachedSession(priceId, uiMode, options);
      if (cached) {
        // Return cached session data
        return {
          clientSecret: cached.clientSecret,
          sessionId: cached.sessionId,
          url: cached.url,
          engagementDiscountApplied: cached.engagementDiscountApplied,
          checkoutOfferApplied: cached.checkoutOfferApplied,
        };
      }
    }

    // Create new session
    const response = await createCheckoutSessionInternal(priceId, options);

    // Cache for future use if embedded mode
    if (uiMode === 'embedded' && response.clientSecret) {
      cacheSession(priceId, uiMode, options, response);
    }

    return response;
  }

  static async createCheckoutRescueOffer(priceId: string): Promise<ICheckoutRescueOffer> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('User not authenticated');
    }

    const request: ICheckoutRescueOfferRequest = { priceId };

    const response = await fetch('/api/checkout/offer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(request),
    });

    const responseJson = (await response.json()) as
      | ICheckoutRescueOfferResponse
      | { success: false; error?: string };

    if (!response.ok || !responseJson.success) {
      throw new Error(
        'error' in responseJson ? responseJson.error || 'Failed to create rescue offer' : ''
      );
    }

    return responseJson.data;
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
