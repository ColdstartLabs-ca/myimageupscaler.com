type AnalyticsClient = (typeof import('@client/analytics'))['analytics'];

let analyticsPromise: Promise<AnalyticsClient> | null = null;

/** Load the analytics client only after a page effect or user interaction needs it. */
export function loadAnalytics(): Promise<AnalyticsClient> {
  if (!analyticsPromise) {
    analyticsPromise = import('@client/analytics').then(({ analytics }) => analytics);
  }

  return analyticsPromise;
}
