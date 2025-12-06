import { supabase } from '@server/supabase/supabaseClient';
import type {
  ICheckoutSessionRequest,
  ICheckoutSessionResponse,
  IUserProfile,
  ISubscription,
  IPrice,
  IProduct,
} from '@shared/types/stripe';

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

/**
 * Frontend service for Stripe operations
 * All methods interact with the backend API routes or Supabase
 */
export class StripeService {
  /**
   * Create a Stripe Checkout Session
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
    const { url } = await this.createCheckoutSession(priceId, options);
    window.location.href = url;
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

    const response = await this.createCheckoutSession(pack.stripePriceId, {
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

    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();

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
   * Get all available prices with their products
   * @returns List of prices with product details
   */
  static async getAvailablePrices(): Promise<(IPrice & { product: IProduct })[]> {
    const { data, error } = await supabase
      .from('prices')
      .select(
        `
        *,
        product:products(*)
      `
      )
      .eq('active', true)
      .order('unit_amount', { ascending: true });

    if (error) {
      console.error('Error fetching prices:', error);
      return [];
    }

    return data as (IPrice & { product: IProduct })[];
  }

  /**
   * Get prices filtered by type (one_time or recurring)
   * @param type - The price type to filter by
   * @returns List of prices of the specified type
   */
  static async getPricesByType(
    type: 'one_time' | 'recurring'
  ): Promise<(IPrice & { product: IProduct })[]> {
    const { data, error } = await supabase
      .from('prices')
      .select(
        `
        *,
        product:products(*)
      `
      )
      .eq('active', true)
      .eq('type', type)
      .order('unit_amount', { ascending: true });

    if (error) {
      console.error('Error fetching prices:', error);
      return [];
    }

    return data as (IPrice & { product: IProduct })[];
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
