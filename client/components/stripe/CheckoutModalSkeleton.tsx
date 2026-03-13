'use client';

/**
 * CheckoutModalSkeleton Component
 *
 * A loading skeleton that matches the CheckoutModal dimensions to reduce perceived load time.
 * Displayed while the Stripe checkout session is being created.
 *
 * Part of Phase 3A - Stripe Embed Load Time Optimization
 * Target: Stripe embed load time < 2 seconds
 */

interface ICheckoutModalSkeletonProps {
  /** Whether to show the "Secure checkout" message */
  showSecureMessage?: boolean;
}

export function CheckoutModalSkeleton({
  showSecureMessage = true,
}: ICheckoutModalSkeletonProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 min-h-[600px]">
      {/* Spinner */}
      <div className="relative mb-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
      </div>

      {/* Loading text */}
      <p className="text-muted-foreground text-lg mb-4">Loading checkout...</p>

      {/* Secure checkout message with trust indicators */}
      {showSecureMessage && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span>Secure checkout powered by Stripe</span>
        </div>
      )}

      {/* Skeleton form placeholders */}
      <div className="w-full max-w-md mt-8 space-y-4">
        {/* Email field skeleton */}
        <div className="space-y-2">
          <div className="h-4 bg-surface-light rounded w-20"></div>
          <div className="h-10 bg-surface-light rounded w-full"></div>
        </div>

        {/* Card field skeleton */}
        <div className="space-y-2">
          <div className="h-4 bg-surface-light rounded w-24"></div>
          <div className="h-10 bg-surface-light rounded w-full"></div>
        </div>

        {/* Expiry and CVC row skeleton */}
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-surface-light rounded w-16"></div>
            <div className="h-10 bg-surface-light rounded w-full"></div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-surface-light rounded w-12"></div>
            <div className="h-10 bg-surface-light rounded w-full"></div>
          </div>
        </div>

        {/* Pay button skeleton */}
        <div className="h-12 bg-surface-light rounded-lg w-full mt-6"></div>
      </div>
    </div>
  );
}
