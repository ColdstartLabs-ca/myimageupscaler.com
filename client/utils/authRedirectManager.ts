/**
 * Unified Auth Redirect Manager
 *
 * This module provides a centralized way to handle authentication redirects
 * across different entry points (OAuth, email confirmation, guarded routes).
 *
 * The goal is to preserve user intent through the authentication flow.
 */

interface IRedirectIntent {
  /** Where the user was trying to go before auth */
  returnTo?: string;
  /** What action they were attempting (e.g., 'checkout', 'access_dashboard') */
  action?: string;
  /** Additional context for the action (e.g., priceId for checkout) */
  context?: Record<string, unknown>;
  /** When the intent was stored (for expiration) */
  timestamp: number;
}

const REDIRECT_STORAGE_KEY = 'auth_redirect_intent';
const INTENT_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Stores auth intent before redirecting to authentication
 */
export function setAuthIntent(intent: Omit<IRedirectIntent, 'timestamp'>): void {
  if (typeof window === 'undefined') return;

  const fullIntent: IRedirectIntent = {
    ...intent,
    timestamp: Date.now(),
  };

  localStorage.setItem(REDIRECT_STORAGE_KEY, JSON.stringify(fullIntent));
}

/**
 * Retrieves and clears stored auth intent
 */
export function getAndClearAuthIntent(): IRedirectIntent | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(REDIRECT_STORAGE_KEY);
  if (!stored) return null;

  try {
    const intent: IRedirectIntent = JSON.parse(stored);

    // Check if intent has expired
    if (Date.now() - intent.timestamp > INTENT_EXPIRY_MS) {
      localStorage.removeItem(REDIRECT_STORAGE_KEY);
      return null;
    }

    // Clear the intent after retrieving
    localStorage.removeItem(REDIRECT_STORAGE_KEY);
    return intent;
  } catch (error) {
    console.error('Error parsing auth intent:', error);
    localStorage.removeItem(REDIRECT_STORAGE_KEY);
    return null;
  }
}

/**
 * Gets the redirect URL for OAuth providers
 * Encodes the returnTo parameter in the redirectTo URL
 */
export function getOAuthRedirectUrl(returnTo?: string): string {
  const baseUrl = `${window.location.origin}/auth/callback`;

  if (!returnTo) {
    return baseUrl;
  }

  // Encode the returnTo URL as a query parameter
  const url = new URL(baseUrl);
  url.searchParams.set('returnTo', returnTo);
  return url.toString();
}

/**
 * Handles the final redirect after successful authentication
 * This should be called after any auth flow (OAuth, email confirmation, etc.)
 */
export async function handleAuthRedirect(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Get any stored intent
  const intent = getAndClearAuthIntent();

  // Handle checkout action from context
  if (intent?.action === 'checkout' && typeof intent.context?.priceId === 'string') {
    const { StripeService } = await import('@client/services/stripeService');
    try {
      await StripeService.redirectToCheckout(intent.context.priceId, {
        successUrl: `${window.location.origin}/success`,
        cancelUrl: `${window.location.origin}/pricing`,
      });
      return;
    } catch (error) {
      console.error('Error redirecting to checkout:', error);
      // Fall through to dashboard redirect
    }
  }

  // Handle explicit returnTo
  if (intent?.returnTo) {
    // Validate the URL is safe
    const url = new URL(intent.returnTo, window.location.origin);
    if (url.origin === window.location.origin) {
      window.location.href = intent.returnTo;
      return;
    }
  }

  // Check for pending checkout in the store (backward compatibility)
  const { useCheckoutStore } = await import('@client/store/checkoutStore');
  if (useCheckoutStore.getState().processPendingCheckout()) {
    return;
  }

  // Default: redirect to dashboard
  window.location.href = '/dashboard';
}

/**
 * Prepares auth redirect from a specific entry point
 */
export function prepareAuthRedirect(
  action: string,
  options: {
    returnTo?: string;
    context?: Record<string, unknown>;
  } = {}
): void {
  setAuthIntent({
    action,
    returnTo: options.returnTo || window.location.pathname + window.location.search,
    context: options.context,
  });
}
