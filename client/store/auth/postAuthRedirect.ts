/**
 * Handles post-authentication redirects.
 * This module separates redirect logic from the auth store.
 */

const CHECKOUT_PATHS = ['/checkout', '/success'];

/**
 * Checks if the current path is checkout-related.
 */
function isCheckoutPath(pathname: string): boolean {
  return CHECKOUT_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Handles URL-based checkout redirect (checkout_price query param).
 * Returns true if redirecting to Stripe.
 */
async function handleUrlCheckoutRedirect(): Promise<boolean> {
  const urlParams = new URLSearchParams(window.location.search);
  const checkoutPriceId = urlParams.get('checkout_price');

  if (!checkoutPriceId) {
    return false;
  }

  // Clean up URL params
  urlParams.delete('checkout_price');
  const cleanUrl = urlParams.toString()
    ? `${window.location.pathname}?${urlParams.toString()}`
    : window.location.pathname;
  window.history.replaceState({}, '', cleanUrl);

  // Redirect to Stripe checkout
  try {
    const { StripeService } = await import('@client/services/stripeService');
    await StripeService.redirectToCheckout(checkoutPriceId, {
      successUrl: `${window.location.origin}/success`,
      cancelUrl: window.location.href,
    });
    return true;
  } catch (error) {
    console.error('Error processing checkout:', error);
    window.location.href = '/dashboard';
    return true; // Still returning true since we're redirecting
  }
}

/**
 * Handles pending checkout from the checkout store.
 * Returns true if there's a pending checkout being processed.
 */
async function handlePendingCheckout(): Promise<boolean> {
  const { useCheckoutStore } = await import('../checkoutStore');
  return useCheckoutStore.getState().processPendingCheckout();
}

/**
 * Handles stored redirect URL (e.g., from checkout page).
 * Returns true if redirecting.
 */
function handleStoredRedirect(): boolean {
  const storedRedirect = localStorage.getItem('post_auth_redirect');
  if (storedRedirect && !window.location.pathname.startsWith('/dashboard')) {
    localStorage.removeItem('post_auth_redirect');
    window.location.href = storedRedirect;
    return true;
  }
  return false;
}

/**
 * Main handler for post-authentication redirects.
 * Call this after a successful sign-in event.
 */
export async function handlePostAuthRedirect(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Check for pending checkout from store
  if (await handlePendingCheckout()) {
    return;
  }

  // 2. Check for URL-based checkout redirect
  if (await handleUrlCheckoutRedirect()) {
    return;
  }

  // 3. Check for stored redirect URL
  if (handleStoredRedirect()) {
    return;
  }

  // 4. Default: redirect to dashboard if not on checkout-related or dashboard pages
  const currentPath = window.location.pathname;
  if (!isCheckoutPath(currentPath) && !currentPath.startsWith('/dashboard')) {
    window.location.href = '/dashboard';
  }
}
