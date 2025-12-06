'use client';

interface IPricingCardSkeletonProps {
  recommended?: boolean;
}

/**
 * Skeleton loading component for pricing cards
 *
 * Used during subscription data fetching to prevent jarring UI changes
 * where "Get Started" buttons suddenly change to "Current Plan" after loading.
 */
export function PricingCardSkeleton({
  recommended = false,
}: IPricingCardSkeletonProps): JSX.Element {
  return (
    <div
      className={`relative bg-white rounded-2xl shadow-lg border-2 animate-pulse ${
        recommended ? 'border-indigo-200' : 'border-slate-200'
      }`}
    >
      {/* Skeleton badge */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-200 text-slate-200 px-8 py-1 rounded-full text-sm font-medium">
        Loading
      </div>

      <div className="p-8">
        {/* Plan name skeleton */}
        <div className="text-center mb-2">
          <div className="h-8 bg-slate-200 rounded mx-auto w-3/4"></div>
        </div>

        {/* Description skeleton */}
        <div className="text-center mb-6">
          <div className="h-4 bg-slate-200 rounded mx-auto w-5/6"></div>
        </div>

        {/* Price skeleton */}
        <div className="text-center my-6">
          <div className="text-4xl font-bold text-slate-200">
            <div className="h-12 bg-slate-200 rounded mx-auto w-1/3"></div>
          </div>
          <div className="text-sm text-slate-200 mt-1">
            <div className="h-4 bg-slate-200 rounded mx-auto w-1/4"></div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200 pt-6 mb-6"></div>

        {/* Features skeleton */}
        <ul className="space-y-3 mb-8">
          {[...Array(4)].map((_, index) => (
            <li key={index} className="flex items-start gap-3">
              <div className="h-5 w-5 bg-slate-200 rounded flex-shrink-0 mt-0.5"></div>
              <div className="h-4 bg-slate-200 rounded flex-1"></div>
            </li>
          ))}
        </ul>

        {/* Button skeleton */}
        <div className="mt-auto">
          <div className="w-full py-3 px-6 rounded-lg bg-slate-200 cursor-not-allowed"></div>
        </div>
      </div>
    </div>
  );
}
