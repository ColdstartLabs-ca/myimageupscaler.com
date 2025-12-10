# Auth Redirect System Documentation

## Overview

The authentication redirect system has been refactored to provide a unified, predictable experience across all authentication flows. This ensures users return to where they started after completing authentication.

## Problem Solved

Previously, the auth system had fragmented redirect logic:

- Pricing CTAs used in-memory state
- PricingCard used localStorage with different key
- Google OAuth always redirected to `/dashboard`
- Email confirmation always redirected to `/dashboard`
- Dashboard guard silently bounced users to `/` without explanation

## Solution Architecture

### Core Components

#### 1. Auth Redirect Manager (`client/utils/authRedirectManager.ts`)

A centralized utility that manages authentication intent across all flows:

```typescript
interface IRedirectIntent {
  returnTo?: string; // Where the user was trying to go
  action?: string; // What they were doing (e.g., 'checkout')
  context?: Record<any>; // Additional context (e.g., priceId)
  timestamp: number; // For expiry (30 minutes)
}
```

Key functions:

- `setAuthIntent()` - Stores authentication intent
- `getAndClearAuthIntent()` - Retrieves and clears intent
- `getOAuthRedirectUrl()` - Builds OAuth redirect URL with returnTo
- `handleAuthRedirect()` - Processes redirect after successful auth
- `prepareAuthRedirect()` - Convenience wrapper for setting intent

#### 2. Updated Post-Auth Handler

The `handlePostAuthRedirect()` now delegates to the unified redirect manager, ensuring consistent behavior across all auth flows.

### Entry Point Updates

#### 1. Pricing Page (`client/components/pixelperfect/Pricing.tsx`)

```typescript
// Before: setPendingCheckout(tier.priceId)
// After:
prepareAuthRedirect('checkout', {
  returnTo: window.location.pathname,
  context: { priceId: tier.priceId, planName: tier.name },
});
```

#### 2. Pricing Cards (`client/components/stripe/PricingCard.tsx`)

```typescript
// Before: localStorage.setItem('post_auth_redirect', checkoutUrl)
// After:
prepareAuthRedirect('checkout', {
  returnTo: checkoutUrl,
  context: { priceId, planName: name },
});
```

#### 3. Google OAuth (`client/hooks/useGoogleSignIn.ts`)

```typescript
// Before: redirectTo: `${window.location.origin}/dashboard`
// After:
const signIn = async (returnTo?: string) => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getOAuthRedirectUrl(returnTo),
      // ...
    },
  });
};
```

#### 4. Email Confirmation (`app/auth/confirm/page.tsx`)

```typescript
// Before: router.push('/dashboard')
// After:
setTimeout(async () => {
  await handleAuthRedirect();
}, 1500);
```

#### 5. Dashboard Guard (`middleware.ts`)

```typescript
// Before: Silent redirect to '/'
// After:
if (!user && pathname.startsWith('/dashboard')) {
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.searchParams.set('login', '1');
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}
```

#### 6. Landing Page (`client/components/pages/HomePageClient.tsx`)

```typescript
// Handles login=1 from middleware
useEffect(() => {
  const loginRequired = searchParams.get('login');
  const nextUrl = searchParams.get('next');

  if (loginRequired === '1' && nextUrl) {
    prepareAuthRedirect('dashboard_access', { returnTo: nextUrl });
    showToast({
      message: 'Please sign in to access the dashboard',
      type: 'info',
    });
    openAuthModal('login');
  }
}, [searchParams]);
```

## Flow Examples

### 1. Pricing Page Checkout

1. User clicks "Buy Pro Plan" on pricing page
2. `prepareAuthRedirect('checkout', { context: { priceId: 'price_123' } })` stores intent
3. Auth modal opens
4. User signs in with Google OAuth
5. OAuth redirects to `/auth/callback?returnTo=/pricing`
6. Auth handler calls `handleAuthRedirect()`
7. Detects checkout intent → redirects to Stripe

### 2. Direct Dashboard Access

1. User navigates to `/dashboard/settings`
2. Middleware redirects to `/?login=1&next=/dashboard/settings`
3. Landing page detects parameters, shows toast, opens auth modal
4. User signs in with email/password
5. Auth handler redirects to `/dashboard/settings`

### 3. Email Confirmation

1. User signs up from blog post with `?next=/blog/post-123`
2. Email confirmation link includes this parameter
3. After confirming email, user returns to the blog post

## Security Considerations

1. **URL Validation**: The redirect manager validates that returnTo URLs are on the same origin
2. **Intent Expiry**: Auth intents expire after 30 minutes
3. **Context Safety**: All context is serialized/deserialized safely
4. **No Open Redirects**: Only relative URLs or same-origin URLs are allowed

## Testing the Implementation

### Manual Testing Checklist

- [ ] Pricing page → Google OAuth → Returns to pricing → Opens checkout
- [ ] Pricing card → Email auth → Returns to pricing → Opens checkout
- [ ] Direct dashboard → Bounce → Login → Returns to intended page
- [ ] Email confirmation → Returns to original page (if specified)
- [ ] Auth intent expires after 30 minutes
- [ ] Toast appears when dashboard requires login

### E2E Test Scenarios

```typescript
// Example test: Pricing checkout flow
test('pricing checkout flow preserves intent through OAuth', async ({ page }) => {
  await page.goto('/pricing');
  await page.click('[data-testid="pro-plan-button"]');
  await page.click('[data-testid="google-sign-in"]');
  // Complete OAuth flow in test environment
  await expect(page).toHaveURL('/checkout');
});
```

## Migration Guide

For developers adding new authentication entry points:

1. **Before showing auth**: Call `prepareAuthRedirect(action, options)`
2. **OAuth buttons**: Pass returnTo parameter to sign-in functions
3. **After successful auth**: The handler will automatically redirect correctly

## Backward Compatibility

The system maintains backward compatibility:

- Old `post_auth_redirect` localStorage entries still work
- Checkout store integration remains functional
- No breaking changes to existing APIs

## Files Modified

- `client/utils/authRedirectManager.ts` - New unified redirect manager
- `client/store/auth/postAuthRedirect.ts` - Updated to use unified handler
- `client/hooks/useGoogleSignIn.ts` - Accepts returnTo parameter
- `client/components/pixelperfect/Pricing.tsx` - Uses prepareAuthRedirect
- `client/components/stripe/PricingCard.tsx` - Uses prepareAuthRedirect
- `app/auth/confirm/page.tsx` - Uses unified redirect handler
- `app/auth/callback/page.tsx` - New OAuth callback handler
- `middleware.ts` - User-friendly dashboard guard
- `client/components/pages/HomePageClient.tsx` - Handles login prompts
- `client/components/form/GoogleSignInButton.tsx` - Passes returnTo to OAuth
