/**
 * Checkout Funnel Analyzer
 *
 * Utility for analyzing checkout funnel metrics from Amplitude analytics.
 * Phase 2 of checkout friction investigation.
 *
 * @see docs/PRDs/checkout-friction-investigation.md
 */

import { serverEnv } from '@shared/config/env';
import { createLogger } from '@server/monitoring/logger';
import type {
  TCheckoutStep,
  TCheckoutErrorType,
  TCheckoutExitMethod,
  TDeviceType,
} from '@server/analytics/types';

const logger = createLogger(new Request('https://internal/analytics'), 'checkout-funnel-analyzer');

// =============================================================================
// Types
// =============================================================================

export interface ICheckoutFunnelMetrics {
  period: { start: Date; end: Date };
  totalCheckoutStarts: number;
  stepCompletionRates: Record<string, number>; // % reaching each step
  averageTimePerStep: Record<string, number>; // ms
  abandonmentRateByStep: Record<string, number>;
  errorRateByType: Record<string, number>;
  mobileVsDesktop: {
    mobile: { completionRate: number; avgTimeMs: number };
    desktop: { completionRate: number; avgTimeMs: number };
  };
  topExitMethods: Array<{ method: string; count: number; percentage: number }>;
}

interface IAmplitudeEvent {
  event_type: string;
  time: number;
  event_properties: Record<string, unknown>;
  user_properties?: Record<string, unknown>;
  device_id?: string;
  user_id?: string;
}

interface IAmplitudeSegmentationResponse {
  data: {
    series: Array<Array<number | null>>;
    seriesLabels: string[];
    xValues: string[];
  } | null;
  error?: string;
}

interface IAmplitudeEventsResponse {
  events: IAmplitudeEvent[];
  total: number;
  error?: string;
}

type TCheckoutEventName =
  | 'checkout_started'
  | 'checkout_step_viewed'
  | 'checkout_step_time'
  | 'checkout_completed'
  | 'checkout_error'
  | 'checkout_exit_intent';

// =============================================================================
// Amplitude API Helpers
// =============================================================================

const AMPLITUDE_API_BASE = 'https://api.amplitude.com';

/**
 * Query Amplitude Events API for checkout-related events
 */
async function queryAmplitudeEvents(
  eventType: TCheckoutEventName | TCheckoutEventName[],
  startDate: Date,
  endDate: Date
): Promise<IAmplitudeEvent[]> {
  const apiKey = serverEnv.AMPLITUDE_API_KEY;

  if (!apiKey) {
    logger.error('Amplitude API key not configured');
    return [];
  }

  // Skip actual API calls in test environment
  if (
    serverEnv.ENV === 'test' ||
    apiKey.includes('test') ||
    apiKey.startsWith('test_amplitude_api_key')
  ) {
    return [];
  }

  const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
  const start = startDate.toISOString().split('T')[0];
  const end = endDate.toISOString().split('T')[0];

  try {
    const eventFilter = JSON.stringify(eventTypes.map(e => ({ event_type: e })));
    const response = await fetch(
      `${AMPLITUDE_API_BASE}/2/events/segmentation?api_key=${apiKey}&start=${start}&end=${end}&e=${encodeURIComponent(eventFilter)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Amplitude API request failed', {
        status: response.status,
        error: errorText,
      });
      return [];
    }

    const data = (await response.json()) as IAmplitudeEventsResponse;

    if (data.error) {
      logger.error('Amplitude API returned error', { error: data.error });
      return [];
    }

    return data.events || [];
  } catch (error) {
    logger.error('Failed to query Amplitude events', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Query Amplitude Segmentation API for event counts
 */
async function _queryEventCounts(
  eventType: string,
  startDate: Date,
  endDate: Date,
  groupBy?: string
): Promise<{ counts: number[]; labels: string[] }> {
  const apiKey = serverEnv.AMPLITUDE_API_KEY;

  if (!apiKey) {
    return { counts: [], labels: [] };
  }

  // Skip actual API calls in test environment
  if (
    serverEnv.ENV === 'test' ||
    apiKey.includes('test') ||
    apiKey.startsWith('test_amplitude_api_key')
  ) {
    return { counts: [], labels: [] };
  }

  const start = startDate.toISOString().split('T')[0];
  const end = endDate.toISOString().split('T')[0];

  let url = `${AMPLITUDE_API_BASE}/2/events/segmentation?api_key=${apiKey}&start=${start}&end=${end}&e=${encodeURIComponent(JSON.stringify({ event_type: eventType }))}`;

  if (groupBy) {
    url += `&m=${encodeURIComponent(groupBy)}`;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return { counts: [], labels: [] };
    }

    const data = (await response.json()) as IAmplitudeSegmentationResponse;

    if (data.error || !data.data) {
      return { counts: [], labels: [] };
    }

    const counts = data.data.series[0]?.filter((v): v is number => v !== null) || [];
    const labels = data.data.seriesLabels || [];

    return { counts, labels };
  } catch {
    return { counts: [], labels: [] };
  }
}

// =============================================================================
// Funnel Analysis Functions
// =============================================================================

const CHECKOUT_STEPS: TCheckoutStep[] = [
  'plan_selection',
  'stripe_embed',
  'payment_details',
  'confirmation',
];

/**
 * Calculate step completion rates from raw events
 */
function calculateStepCompletionRates(
  startedCount: number,
  stepEvents: Map<TCheckoutStep, number>,
  completedCount: number
): Record<string, number> {
  const rates: Record<string, number> = {};

  if (startedCount === 0) {
    CHECKOUT_STEPS.forEach(step => {
      rates[step] = 0;
    });
    return rates;
  }

  // First step (plan_selection) should be 100% of starts
  rates['plan_selection'] = 100;

  // Calculate subsequent steps
  for (let i = 1; i < CHECKOUT_STEPS.length; i++) {
    const step = CHECKOUT_STEPS[i];
    const stepCount = stepEvents.get(step) || 0;
    rates[step] = Math.round((stepCount / startedCount) * 100);
  }

  // Final completion rate
  rates['completed'] = Math.round((completedCount / startedCount) * 100);

  return rates;
}

/**
 * Calculate average time per step from checkout_step_time events
 */
function calculateAverageTimePerStep(stepTimeEvents: IAmplitudeEvent[]): Record<string, number> {
  const timeByStep: Record<string, { total: number; count: number }> = {};

  for (const event of stepTimeEvents) {
    const step = event.event_properties?.step as TCheckoutStep | undefined;
    const timeSpent = event.event_properties?.timeSpentMs as number | undefined;

    if (step && typeof timeSpent === 'number') {
      if (!timeByStep[step]) {
        timeByStep[step] = { total: 0, count: 0 };
      }
      timeByStep[step].total += timeSpent;
      timeByStep[step].count += 1;
    }
  }

  const averages: Record<string, number> = {};
  for (const step of CHECKOUT_STEPS) {
    const data = timeByStep[step];
    averages[step] = data && data.count > 0 ? Math.round(data.total / data.count) : 0;
  }

  return averages;
}

/**
 * Calculate abandonment rate by step
 * Abandonment at step N = users who reached step N but did not reach step N+1
 */
function calculateAbandonmentRateByStep(
  stepEvents: Map<TCheckoutStep, number>,
  _startedCount: number
): Record<string, number> {
  const abandonment: Record<string, number> = {};

  for (let i = 0; i < CHECKOUT_STEPS.length - 1; i++) {
    const currentStep = CHECKOUT_STEPS[i];
    const nextStep = CHECKOUT_STEPS[i + 1];

    const currentCount = stepEvents.get(currentStep) || 0;
    const nextCount = stepEvents.get(nextStep) || 0;

    if (currentCount === 0) {
      abandonment[currentStep] = 0;
    } else {
      const droppedOff = currentCount - nextCount;
      abandonment[currentStep] = Math.round((droppedOff / currentCount) * 100);
    }
  }

  // Final step abandonment (reached confirmation but didn't complete)
  const confirmationCount = stepEvents.get('confirmation') || 0;
  if (confirmationCount === 0) {
    abandonment['confirmation'] = 0;
  } else {
    // This is a special case - abandonment at confirmation means they saw it but didn't finish
    abandonment['confirmation'] = 0; // Will be updated with completed data
  }

  return abandonment;
}

/**
 * Calculate error rate by type from checkout_error events
 */
function calculateErrorRateByType(errorEvents: IAmplitudeEvent[]): Record<string, number> {
  const errorCounts: Record<string, number> = {};
  let totalErrors = 0;

  for (const event of errorEvents) {
    const errorType = event.event_properties?.errorType as TCheckoutErrorType | undefined;

    if (errorType) {
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
      totalErrors++;
    }
  }

  // Convert to percentages
  const rates: Record<string, number> = {};
  if (totalErrors > 0) {
    for (const [type, count] of Object.entries(errorCounts)) {
      rates[type] = Math.round((count / totalErrors) * 100);
    }
  }

  return rates;
}

/**
 * Calculate mobile vs desktop metrics
 */
function calculateMobileVsDesktopMetrics(
  events: IAmplitudeEvent[],
  _startedCount: number
): ICheckoutFunnelMetrics['mobileVsDesktop'] {
  const deviceMetrics: Record<
    TDeviceType,
    { starts: number; completions: number; times: number[] }
  > = {
    mobile: { starts: 0, completions: 0, times: [] },
    desktop: { starts: 0, completions: 0, times: [] },
    tablet: { starts: 0, completions: 0, times: [] },
  };

  for (const event of events) {
    const deviceType = (event.event_properties?.deviceType as TDeviceType) || 'desktop';

    if (event.event_type === 'checkout_started') {
      if (deviceType in deviceMetrics) {
        deviceMetrics[deviceType].starts++;
      }
    }

    if (event.event_type === 'checkout_completed') {
      if (deviceType in deviceMetrics) {
        deviceMetrics[deviceType].completions++;
      }
    }

    if (event.event_type === 'checkout_step_time') {
      const timeSpent = event.event_properties?.timeSpentMs as number | undefined;
      if (typeof timeSpent === 'number' && deviceType in deviceMetrics) {
        deviceMetrics[deviceType].times.push(timeSpent);
      }
    }
  }

  // Calculate completion rates and average times
  const calcDeviceStats = (metrics: (typeof deviceMetrics)[TDeviceType]) => {
    const completionRate =
      metrics.starts > 0 ? Math.round((metrics.completions / metrics.starts) * 100) : 0;
    const avgTimeMs =
      metrics.times.length > 0
        ? Math.round(metrics.times.reduce((a, b) => a + b, 0) / metrics.times.length)
        : 0;
    return { completionRate, avgTimeMs };
  };

  return {
    mobile: calcDeviceStats(deviceMetrics.mobile),
    desktop: calcDeviceStats(deviceMetrics.desktop),
  };
}

/**
 * Calculate top exit methods from checkout_exit_intent events
 */
function calculateTopExitMethods(
  exitEvents: IAmplitudeEvent[],
  totalExits: number
): Array<{ method: string; count: number; percentage: number }> {
  const methodCounts: Record<TCheckoutExitMethod, number> = {
    close_button: 0,
    escape_key: 0,
    click_outside: 0,
    navigate_away: 0,
  };

  for (const event of exitEvents) {
    const method = event.event_properties?.method as TCheckoutExitMethod | undefined;
    if (method && method in methodCounts) {
      methodCounts[method]++;
    }
  }

  const results = Object.entries(methodCounts)
    .map(([method, count]) => ({
      method,
      count,
      percentage: totalExits > 0 ? Math.round((count / totalExits) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return results;
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Get checkout funnel metrics for a date range
 *
 * @param startDate - Start of the analysis period
 * @param endDate - End of the analysis period
 * @returns Aggregated checkout funnel metrics
 *
 * @example
 * ```ts
 * import { getCheckoutFunnelMetrics } from '@server/analytics/checkoutFunnelAnalyzer';
 *
 * const metrics = await getCheckoutFunnelMetrics(
 *   new Date('2026-03-01'),
 *   new Date('2026-03-07')
 * );
 *
 * console.log(`Completion rate: ${metrics.stepCompletionRates.completed}%`);
 * console.log(`Top abandonment step: ${Object.keys(metrics.abandonmentRateByStep)[0]}`);
 * ```
 */
export async function getCheckoutFunnelMetrics(
  startDate: Date,
  endDate: Date
): Promise<ICheckoutFunnelMetrics> {
  logger.info('Starting checkout funnel analysis', {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
  });

  // Query all checkout events in parallel
  const [
    startedEvents,
    stepViewedEvents,
    stepTimeEvents,
    completedEvents,
    errorEvents,
    exitEvents,
  ] = await Promise.all([
    queryAmplitudeEvents('checkout_started', startDate, endDate),
    queryAmplitudeEvents('checkout_step_viewed', startDate, endDate),
    queryAmplitudeEvents('checkout_step_time', startDate, endDate),
    queryAmplitudeEvents('checkout_completed', startDate, endDate),
    queryAmplitudeEvents('checkout_error', startDate, endDate),
    queryAmplitudeEvents('checkout_exit_intent', startDate, endDate),
  ]);

  // Combine all events for device analysis
  const allEvents = [
    ...startedEvents,
    ...stepViewedEvents,
    ...stepTimeEvents,
    ...completedEvents,
    ...errorEvents,
    ...exitEvents,
  ];

  // Calculate basic counts
  const totalCheckoutStarts = startedEvents.length;
  const totalCompleted = completedEvents.length;

  // Build step counts from checkout_step_viewed events
  const stepCounts = new Map<TCheckoutStep, number>();
  for (const step of CHECKOUT_STEPS) {
    stepCounts.set(step, 0);
  }

  for (const event of stepViewedEvents) {
    const step = event.event_properties?.step as TCheckoutStep | undefined;
    if (step && stepCounts.has(step)) {
      stepCounts.set(step, (stepCounts.get(step) || 0) + 1);
    }
  }

  // Calculate all metrics
  const stepCompletionRates = calculateStepCompletionRates(
    totalCheckoutStarts,
    stepCounts,
    totalCompleted
  );
  const averageTimePerStep = calculateAverageTimePerStep(stepTimeEvents);
  const abandonmentRateByStep = calculateAbandonmentRateByStep(stepCounts, totalCheckoutStarts);
  const errorRateByType = calculateErrorRateByType(errorEvents);
  const mobileVsDesktop = calculateMobileVsDesktopMetrics(allEvents, totalCheckoutStarts);
  const topExitMethods = calculateTopExitMethods(exitEvents, exitEvents.length);

  const metrics: ICheckoutFunnelMetrics = {
    period: { start: startDate, end: endDate },
    totalCheckoutStarts,
    stepCompletionRates,
    averageTimePerStep,
    abandonmentRateByStep,
    errorRateByType,
    mobileVsDesktop,
    topExitMethods,
  };

  logger.info('Checkout funnel analysis complete', {
    totalStarts: totalCheckoutStarts,
    completionRate: stepCompletionRates.completed,
    topExitMethod: topExitMethods[0]?.method || 'none',
  });

  await logger.flush();

  return metrics;
}

// Re-export types for convenience
export type { TCheckoutStep, TCheckoutErrorType, TCheckoutExitMethod, TDeviceType };
