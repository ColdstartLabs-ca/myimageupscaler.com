# Technical Debt Report - December 2, 2025

## Executive Summary

This report outlines technical debt and code smells identified in critical areas of the PixelPerfect codebase. The focus was on high-impact areas: Payment Processing, Core Image Processing Logic, Authentication, and Navigation. Addressing these issues will improve system stability, maintainability, and user experience.

## 1. Payment Processing (Critical)

**File:** `client/components/stripe/CheckoutModal.tsx`

### Issues

- **Module-Level Side Effects**: `getStripePromise()` is called at the module scope. If environment variables are missing (e.g., during CI/CD or build time), this causes immediate console errors even if the component isn't mounted.
- **Race Conditions**: The `useEffect` hook triggering `createCheckoutSession` lacks a cleanup function. Rapid changes to `priceId` could result in multiple API calls and race conditions where a stale response overwrites the correct state.
- **Hardcoded Layout Values**: The modal uses hardcoded pixel values (`min-h-[600px]`) which may cause overflow or layout issues on smaller screens.
- **Inline Assets**: Large SVG icons are defined inline, cluttering the component code.

### Recommendations

- **Refactor Initialization**: Move Stripe initialization into a custom hook or a lazy-loaded singleton service.
- **Fix Race Conditions**: Implement an `abortController` or a simple `isMounted` check in the `useEffect` cleanup to ignore stale responses.
- **Responsive Design**: Replace hardcoded pixel heights with responsive classes (e.g., `min-h-[50vh]`) or relative units.
- **Component Extraction**: Extract icons to shared UI components or use `lucide-react`.

## 2. Core Logic & Queue Management (High)

**File:** `client/hooks/pixelperfect/useBatchQueue.ts`

### Issues

- **Race Condition in Batch Processing**: In `processBatch`, the list of items to process is captured at the start of the function. If a user removes an item from the UI while the batch is running, the loop continues to process the removed item, wasting resources and potentially causing errors when updating state for a non-existent item.
- **Weak ID Generation**: Uses `Math.random()` for generating item IDs, which is not collision-resistant.
- **"God Hook" Pattern**: The hook manages too many responsibilities: queue state, active item selection, file handling, and processing logic. This makes it hard to test and maintain.

### Recommendations

- **State Verification**: In the processing loop, verify that the item still exists in the current `queue` ref before initiating the API call.
- **Robust IDs**: Switch to `crypto.randomUUID()` for ID generation.
- **Separation of Concerns**: Split the hook into `useQueueState` (pure state management) and `useQueueProcessor` (business logic).

## 3. Authentication (Medium)

**File:** `client/components/modal/auth/AuthenticationModal.tsx`

### Issues

- **Monolithic Component**: The component handles five different views (Login, Register, Forgot Password, Change Password, Set New Password). This violates the Single Responsibility Principle and makes the file large and difficult to navigate.
- **Code Duplication**: Error handling logic (try/catch blocks, toast notifications) is repeated for every auth action.

### Recommendations

- **Component Splitting**: Extract each view into its own sub-component (e.g., `<LoginView />`, `<RegisterView />`). The `AuthenticationModal` should act only as a router/container.
- **Unified Error Handling**: Create a `handleAuthAction` helper function to standardize error logging and user notifications.

## 4. Navigation & UI (Low)

**File:** `client/components/navigation/NavBar.tsx`

### Issues

- **Unreliable Dropdown Logic**: The dropdown uses `onBlur` with a `setTimeout` to close. This is a "hacky" solution that can be flaky and inaccessible.
- **Incomplete Mobile Menu**: The mobile menu button exists but appears to be non-functional (no state connection).

### Recommendations

- **Robust Interactions**: Use a click-outside hook or a primitive from a UI library (like Radix UI or Headless UI) for the dropdown.
- **Mobile Implementation**: Implement the mobile menu state and drawer/overlay.

## 5. Billing Page Subscription Query (Fixed)

**File:** `server/stripe/stripeService.ts`

### Issue (RESOLVED)

- **`.single()` Causing 406 Errors**: The `getActiveSubscription()` method used `.single()` on the Supabase query, which returns HTTP 406 when zero rows match. This caused the billing page to fail silently and always display "Free Plan" even after successful payments.

### Resolution Applied

- Changed `.single()` to `.maybeSingle()` which properly returns `null` when no rows match instead of throwing an error.
- Added console logging for debugging subscription fetch errors.

### Related Issues Found

- **Missing Database Migration**: The `subscriptions` table migration had not been applied to the remote Supabase instance. This was applied as part of the fix.
- **Stripe CLI Webhook Issue**: The `yarn dev` script exports environment variables in a subshell, preventing the Stripe CLI from receiving the `STRIPE_SECRET_KEY`. Users should ensure the Stripe CLI is running with valid API keys for webhook forwarding during development.

## Prioritized Action Plan

1.  **Refactor `CheckoutModal.tsx`**: Critical for revenue reliability.
2.  **Fix `useBatchQueue.ts`**: Essential for the core product value proposition (batch processing).
3.  **Refactor `AuthenticationModal.tsx`**: Improves code maintainability.
4.  **Fix `NavBar.tsx`**: Improves general UX.
