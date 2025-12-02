import { supabase } from '@server/supabase/supabaseClient';
import type {
  ICheckoutSessionRequest,
  ICheckoutSessionResponse,
  IUserProfile,
  ISubscription,
  IPrice,
  IProduct,
} from '@shared/types/stripe';

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
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
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

    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();

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
      .single();

    if (error) {
      // No active subscription
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

    return response.json();
  }

  /**
   * Redirect to Stripe Customer Portal
   */
  static async redirectToPortal(): Promise<void> {
    const { url } = await this.createPortalSession();
    window.location.href = url;
  }
}
