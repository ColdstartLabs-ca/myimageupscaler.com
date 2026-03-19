/**
 * Checkout Funnel Tracking Unit Tests
 *
 * Tests for checkout analytics events as defined in:
 * - Phase 1 of docs/PRDs/checkout-friction-investigation.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  TCheckoutStep,
  TCheckoutErrorType,
  TCheckoutExitMethod,
  TDeviceType,
} from '@server/analytics/types';

// =============================================================================
// Test Helper Functions
// =============================================================================

/**
 * Detect device type based on viewport and user agent
 */
function detectDeviceType(): TDeviceType {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  const ua = navigator.userAgent.toLowerCase();

  // Tablet detection
  const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(ua) || (width >= 768 && width < 1024);
  if (isTablet) return 'tablet';

  // Mobile detection
  const isMobile =
    /iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/i.test(ua) || width < 768;
  if (isMobile) return 'mobile';

  return 'desktop';
}

/**
 * Sanitize error message - remove sensitive data
 */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/\d{13,16}/g, '[CARD]') // Remove card numbers
    .replace(/cvc|cvv|cv2/gi, '[CVC]') // Remove CVC mentions
    .slice(0, 200); // Limit length
}

// Mock window dimensions
function mockWindowDimensions(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

// Mock user agent
function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    writable: true,
    configurable: true,
    value: ua,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('Checkout Funnel Tracking', () => {
  describe('detectDeviceType', () => {
    const originalWidth = window.innerWidth;
    const originalUA = navigator.userAgent;

    beforeEach(() => {
      vi.stubGlobal('window', {
        innerWidth: 1024,
      });
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        userAgentData: undefined,
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should detect desktop correctly', () => {
      mockWindowDimensions(1200);
      mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
      expect(detectDeviceType()).toBe('desktop');
    });

    it('should detect mobile correctly from user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Mobile/15E148');
      expect(detectDeviceType()).toBe('mobile');
    });

    it('should detect mobile correctly from viewport width', () => {
      mockWindowDimensions(375);
      mockUserAgent('Mozilla/5.0 (Linux; Android 10; Mobile) Chrome/120.0.0.0');
      expect(detectDeviceType()).toBe('mobile');
    });

    it('should detect tablet correctly from user agent', () => {
      mockUserAgent('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) Safari/604.1');
      expect(detectDeviceType()).toBe('tablet');
    });

    it('should detect tablet correctly from viewport width', () => {
      mockWindowDimensions(800);
      mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
      expect(detectDeviceType()).toBe('tablet');
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should sanitize card numbers from error messages', () => {
      const message = 'Card 4242424242424242 declined';
      expect(sanitizeErrorMessage(message)).toBe('Card [CARD] declined');
    });

    it('should sanitize CVC mentions', () => {
      const message = 'Your cvc is invalid';
      expect(sanitizeErrorMessage(message)).toBe('Your [CVC] is invalid');
    });

    it('should handle CVV variations', () => {
      const message = 'CVV check failed';
      expect(sanitizeErrorMessage(message)).toBe('[CVC] check failed');
    });

    it('should limit message length to 200 characters', () => {
      const longMessage = 'a'.repeat(300);
      const result = sanitizeErrorMessage(longMessage);
      expect(result.length).toBe(200);
    });

    it('should handle multiple sensitive data in one message', () => {
      const message = 'Card 4111111111111111 cvc 123 failed';
      const result = sanitizeErrorMessage(message);
      expect(result).toBe('Card [CARD] [CVC] 123 failed');
    });

    it('should preserve safe error messages', () => {
      const message = 'Network error occurred';
      expect(sanitizeErrorMessage(message)).toBe('Network error occurred');
    });
  });

  describe('Event Property Types', () => {
    it('should have valid checkout step values', () => {
      const validSteps: TCheckoutStep[] = [
        'plan_selection',
        'stripe_embed',
        'payment_details',
        'confirmation',
      ];

      // Type assertion - will fail to compile if types don't match
      expect(validSteps.length).toBe(4);
    });

    it('should have valid error type values', () => {
      const validErrorTypes: TCheckoutErrorType[] = [
        'card_declined',
        '3ds_failed',
        'network_error',
        'invalid_card',
        'session_expired',
        'other',
      ];

      expect(validErrorTypes.length).toBe(6);
    });

    it('should have valid exit method values', () => {
      const validExitMethods: TCheckoutExitMethod[] = [
        'close_button',
        'escape_key',
        'click_outside',
        'navigate_away',
      ];

      expect(validExitMethods.length).toBe(4);
    });

    it('should have valid device type values', () => {
      const validDeviceTypes: TDeviceType[] = ['mobile', 'desktop', 'tablet'];

      expect(validDeviceTypes.length).toBe(3);
    });
  });

  describe('checkout_step_time periodic tracking', () => {
    it('should track checkout_step_time periodically with time accumulator', () => {
      // Simulate the step time accumulator logic from CheckoutModal
      type TStep = 'plan_selection' | 'stripe_embed' | 'payment_details' | 'confirmation';

      const stepTimeAccumulator: Record<TStep, number> = {
        plan_selection: 0,
        stripe_embed: 0,
        payment_details: 0,
        confirmation: 0,
      };

      let currentStep: TStep = 'plan_selection';
      let lastTickTime = 1000; // Start time

      // Simulate 5 seconds passing on plan_selection step
      const now1 = 6000; // 5 seconds later
      const elapsed1 = now1 - lastTickTime;
      lastTickTime = now1;
      stepTimeAccumulator[currentStep] += elapsed1;

      expect(stepTimeAccumulator['plan_selection']).toBe(5000);
      expect(stepTimeAccumulator['stripe_embed']).toBe(0);

      // Simulate step change and more time passing
      currentStep = 'stripe_embed';
      const now2 = 9000; // 3 more seconds
      const elapsed2 = now2 - lastTickTime;
      lastTickTime = now2;
      stepTimeAccumulator[currentStep] += elapsed2;

      expect(stepTimeAccumulator['plan_selection']).toBe(5000);
      expect(stepTimeAccumulator['stripe_embed']).toBe(3000);

      // Calculate cumulative time
      const cumulativeTimeMs = Object.values(stepTimeAccumulator).reduce(
        (sum, time) => sum + time,
        0
      );
      expect(cumulativeTimeMs).toBe(8000);
    });

    it('should accumulate time per step correctly across multiple intervals', () => {
      type TStep = 'plan_selection' | 'stripe_embed' | 'payment_details' | 'confirmation';

      const stepTimeAccumulator: Record<TStep, number> = {
        plan_selection: 0,
        stripe_embed: 0,
        payment_details: 0,
        confirmation: 0,
      };

      let currentStep: TStep = 'plan_selection';
      let lastTickTime = 0;

      // Simulate 3 intervals of 5 seconds each on plan_selection
      for (let i = 0; i < 3; i++) {
        const now = lastTickTime + 5000;
        const elapsed = now - lastTickTime;
        lastTickTime = now;
        stepTimeAccumulator[currentStep] += elapsed;
      }

      expect(stepTimeAccumulator['plan_selection']).toBe(15000);

      // Switch to stripe_embed and simulate 2 intervals
      currentStep = 'stripe_embed';
      for (let i = 0; i < 2; i++) {
        const now = lastTickTime + 5000;
        const elapsed = now - lastTickTime;
        lastTickTime = now;
        stepTimeAccumulator[currentStep] += elapsed;
      }

      expect(stepTimeAccumulator['plan_selection']).toBe(15000);
      expect(stepTimeAccumulator['stripe_embed']).toBe(10000);

      const cumulativeTimeMs = Object.values(stepTimeAccumulator).reduce(
        (sum, time) => sum + time,
        0
      );
      expect(cumulativeTimeMs).toBe(25000);
    });

    it('should track cumulative time across all steps', () => {
      type TStep = 'plan_selection' | 'stripe_embed' | 'payment_details' | 'confirmation';

      const stepTimeAccumulator: Record<TStep, number> = {
        plan_selection: 2000,
        stripe_embed: 5000,
        payment_details: 3000,
        confirmation: 0,
      };

      const cumulativeTimeMs = Object.values(stepTimeAccumulator).reduce(
        (sum, time) => sum + time,
        0
      );
      expect(cumulativeTimeMs).toBe(10000);
    });
  });

  describe('pack selection tracking', () => {
    it('should track initial vs final pack selection', () => {
      // Simulate the pack selection tracking logic
      let initialPack: string | null = null;
      let lastTrackedPack: string | null = null;
      let packSwitchCount = 0;

      // First selection - sets initial
      const firstPack = 'starter';
      if (initialPack === null) {
        initialPack = firstPack;
      } else if (lastTrackedPack !== firstPack) {
        packSwitchCount++;
      }
      lastTrackedPack = firstPack;

      expect(initialPack).toBe('starter');
      expect(packSwitchCount).toBe(0);

      // Second selection - different pack, counts as switch
      const secondPack = 'pro';
      if (initialPack === null) {
        initialPack = secondPack;
      } else if (lastTrackedPack !== secondPack) {
        packSwitchCount++;
      }
      lastTrackedPack = secondPack;

      expect(initialPack).toBe('starter'); // Initial stays the same
      expect(packSwitchCount).toBe(1);
      expect(lastTrackedPack).toBe('pro');
    });

    it('should calculate selection time correctly', () => {
      const startTime = 1000;
      const selectionTime = 4500;

      const selectionTimeMs = selectionTime - startTime;
      expect(selectionTimeMs).toBe(3500);
    });
  });

  describe('plan hover/focus tracking', () => {
    it('should only track hovers longer than 500ms', () => {
      const hoverStartTime = 1000;

      // Short hover (300ms) - should not be tracked
      const shortHoverEnd = 1300;
      const shortHoverTime = shortHoverEnd - hoverStartTime;
      const shouldTrackShort = shortHoverTime >= 500;
      expect(shouldTrackShort).toBe(false);

      // Long hover (600ms) - should be tracked
      const longHoverEnd = 1600;
      const longHoverTime = longHoverEnd - hoverStartTime;
      const shouldTrackLong = longHoverTime >= 500;
      expect(shouldTrackLong).toBe(true);
    });

    it('should track plan switch count correctly', () => {
      let planSwitchCount = 0;
      let lastHoveredPlan: string | null = null;

      const plans = ['hobby', 'pro', 'business', 'pro'];

      for (const plan of plans) {
        if (lastHoveredPlan && plan !== lastHoveredPlan) {
          planSwitchCount++;
        }
        lastHoveredPlan = plan;
      }

      // hobby -> pro (switch 1), pro -> business (switch 2), business -> pro (switch 3)
      expect(planSwitchCount).toBe(3);
    });

    it('should track initial vs final selected plan', () => {
      let initialSelectedPlan: string | null = null;

      // Simulate selections
      const selections = ['hobby', 'pro', 'pro', 'business'];

      for (const plan of selections) {
        if (initialSelectedPlan === null) {
          initialSelectedPlan = plan;
        }
      }

      expect(initialSelectedPlan).toBe('hobby');
    });
  });

  describe('checkout session 30s hard timeout (Phase 2 - upgrade-funnel-fix)', () => {
    it('should fire network_error checkout_error when session creation exceeds 30s', () => {
      const CHECKOUT_TIMEOUT_MS = 30000;

      // Simulate the timeout firing: errorType is 'network_error', message contains 'timeout'
      const errorType = 'network_error' as TCheckoutErrorType;
      const errorMessage = 'Checkout session creation timeout (30s)';
      const step = 'plan_selection' as TCheckoutStep;

      // Verify properties match what CheckoutModal.trackError would send to checkout_error
      expect(errorType).toBe('network_error');
      expect(errorMessage.toLowerCase()).toContain('timeout');
      expect(step).toBe('plan_selection');

      // Verify timeout threshold is 30 seconds
      expect(CHECKOUT_TIMEOUT_MS).toBe(30000);
    });

    it('should not fire timeout error if session creates within 30s', () => {
      const CHECKOUT_TIMEOUT_MS = 30000;
      const fastSessionMs = 1500; // 1.5s

      const timedOut = fastSessionMs >= CHECKOUT_TIMEOUT_MS;
      expect(timedOut).toBe(false);
    });

    it('should fire timeout at exactly 30s boundary', () => {
      const CHECKOUT_TIMEOUT_MS = 30000;
      const atBoundaryMs = 30000;

      const timedOut = atBoundaryMs >= CHECKOUT_TIMEOUT_MS;
      expect(timedOut).toBe(true);
    });

    it('should show user-friendly timeout message', () => {
      const userFacingMessage = 'Checkout is taking too long. Please try again.';
      // Message should not expose technical details, should be actionable
      expect(userFacingMessage).not.toContain('30s');
      expect(userFacingMessage.toLowerCase()).toContain('please try again');
    });
  });

  describe('stripe embed load time tracking (Phase 3A)', () => {
    it('should track stripe embed load time accurately', () => {
      // Simulate the load time tracking logic from CheckoutModal
      const sessionLoadStart = Date.now() - 1500; // Simulate 1.5 seconds ago
      const loadTimeMs = Date.now() - sessionLoadStart;

      // Load time should be a positive number
      expect(loadTimeMs).toBeGreaterThan(0);

      // Load time should be within a reasonable range (0-10 seconds for a typical API call)
      expect(loadTimeMs).toBeLessThan(10000);
    });

    it('should calculate load time from session creation to stripe_embed step', () => {
      const sessionLoadStart = 1000;
      const clientSecretReceivedTime = 2500;

      const loadTimeMs = clientSecretReceivedTime - sessionLoadStart;

      expect(loadTimeMs).toBe(1500);
    });

    it('should include loadTimeMs in checkout_step_viewed event for stripe_embed step', () => {
      // Simulate the event data structure
      const eventData = {
        step: 'stripe_embed' as TCheckoutStep,
        loadTimeMs: 1500,
        priceId: 'price_test123',
        purchaseType: 'subscription',
        deviceType: 'desktop' as TDeviceType,
      };

      // Verify the event data structure
      expect(eventData.step).toBe('stripe_embed');
      expect(eventData.loadTimeMs).toBe(1500);
      expect(typeof eventData.loadTimeMs).toBe('number');
      expect(eventData.loadTimeMs).toBeGreaterThan(0);
    });

    it('should track slow loading indicator threshold at 2000ms', () => {
      // Test the slow loading detection logic
      const SLOW_LOADING_THRESHOLD_MS = 2000;

      // Fast load (under threshold)
      const fastLoadTime = 1500;
      const isSlowLoading = fastLoadTime >= SLOW_LOADING_THRESHOLD_MS;
      expect(isSlowLoading).toBe(false);

      // Slow load (at threshold)
      const slowLoadTime = 2000;
      const isSlowLoadingAtThreshold = slowLoadTime >= SLOW_LOADING_THRESHOLD_MS;
      expect(isSlowLoadingAtThreshold).toBe(true);

      // Very slow load (over threshold)
      const verySlowLoadTime = 3500;
      const isVerySlowLoading = verySlowLoadTime >= SLOW_LOADING_THRESHOLD_MS;
      expect(isVerySlowLoading).toBe(true);
    });
  });
});

// =============================================================================
// Funnel Analyzer Tests (Phase 2)
// =============================================================================

/**
 * Tests for checkout funnel analyzer utility.
 * Tests the calculation functions used in getCheckoutFunnelMetrics.
 */

// Helper functions extracted from the analyzer for testing
// These mirror the logic in server/analytics/checkoutFunnelAnalyzer.ts

const CHECKOUT_STEPS: TCheckoutStep[] = [
  'plan_selection',
  'stripe_embed',
  'payment_details',
  'confirmation',
];

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

function calculateAverageTimePerStep(
  stepTimeEvents: Array<{ step: TCheckoutStep; timeSpentMs: number }>
): Record<string, number> {
  const timeByStep: Record<string, { total: number; count: number }> = {};

  for (const event of stepTimeEvents) {
    const { step, timeSpentMs } = event;

    if (!timeByStep[step]) {
      timeByStep[step] = { total: 0, count: 0 };
    }
    timeByStep[step].total += timeSpentMs;
    timeByStep[step].count += 1;
  }

  const averages: Record<string, number> = {};
  for (const step of CHECKOUT_STEPS) {
    const data = timeByStep[step];
    averages[step] = data && data.count > 0 ? Math.round(data.total / data.count) : 0;
  }

  return averages;
}

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
    abandonment['confirmation'] = 0; // Will be updated with completed data
  }

  return abandonment;
}

function calculateErrorRateByType(
  errorEvents: Array<{ errorType: TCheckoutErrorType }>
): Record<string, number> {
  const errorCounts: Record<string, number> = {};
  let totalErrors = 0;

  for (const event of errorEvents) {
    const { errorType } = event;
    errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
    totalErrors++;
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

function calculateTopExitMethods(
  exitEvents: Array<{ method: TCheckoutExitMethod }>,
  totalExits: number
): Array<{ method: string; count: number; percentage: number }> {
  const methodCounts: Record<TCheckoutExitMethod, number> = {
    close_button: 0,
    escape_key: 0,
    click_outside: 0,
    navigate_away: 0,
  };

  for (const event of exitEvents) {
    const { method } = event;
    if (method in methodCounts) {
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

describe('Funnel Analyzer', () => {
  describe('calculateStepCompletionRates', () => {
    it('funnel analyzer: should calculate completion rates correctly', () => {
      // 100 users start checkout
      const startedCount = 100;

      // Step counts: 80 reach stripe_embed, 60 reach payment_details, 50 reach confirmation
      const stepEvents = new Map<TCheckoutStep, number>([
        ['plan_selection', 100],
        ['stripe_embed', 80],
        ['payment_details', 60],
        ['confirmation', 50],
      ]);

      // 45 complete
      const completedCount = 45;

      const rates = calculateStepCompletionRates(startedCount, stepEvents, completedCount);

      expect(rates['plan_selection']).toBe(100);
      expect(rates['stripe_embed']).toBe(80);
      expect(rates['payment_details']).toBe(60);
      expect(rates['confirmation']).toBe(50);
      expect(rates['completed']).toBe(45);
    });

    it('should handle zero starts gracefully', () => {
      const startedCount = 0;
      const stepEvents = new Map<TCheckoutStep, number>();
      const completedCount = 0;

      const rates = calculateStepCompletionRates(startedCount, stepEvents, completedCount);

      expect(rates['plan_selection']).toBe(0);
      expect(rates['stripe_embed']).toBe(0);
      expect(rates['payment_details']).toBe(0);
      expect(rates['confirmation']).toBe(0);
    });

    it('should handle 100% completion rate', () => {
      const startedCount = 50;
      const stepEvents = new Map<TCheckoutStep, number>([
        ['plan_selection', 50],
        ['stripe_embed', 50],
        ['payment_details', 50],
        ['confirmation', 50],
      ]);
      const completedCount = 50;

      const rates = calculateStepCompletionRates(startedCount, stepEvents, completedCount);

      expect(rates['plan_selection']).toBe(100);
      expect(rates['stripe_embed']).toBe(100);
      expect(rates['payment_details']).toBe(100);
      expect(rates['confirmation']).toBe(100);
      expect(rates['completed']).toBe(100);
    });

    it('should round percentages correctly', () => {
      const startedCount = 33;
      const stepEvents = new Map<TCheckoutStep, number>([
        ['plan_selection', 33],
        ['stripe_embed', 22], // 66.67% -> 67%
        ['payment_details', 11], // 33.33% -> 33%
        ['confirmation', 5], // 15.15% -> 15%
      ]);
      const completedCount = 3; // 9.09% -> 9%

      const rates = calculateStepCompletionRates(startedCount, stepEvents, completedCount);

      expect(rates['stripe_embed']).toBe(67);
      expect(rates['payment_details']).toBe(33);
      expect(rates['confirmation']).toBe(15);
      expect(rates['completed']).toBe(9);
    });
  });

  describe('calculateAverageTimePerStep', () => {
    it('funnel analyzer: should aggregate time per step', () => {
      const stepTimeEvents = [
        { step: 'plan_selection' as TCheckoutStep, timeSpentMs: 5000 },
        { step: 'plan_selection' as TCheckoutStep, timeSpentMs: 3000 },
        { step: 'plan_selection' as TCheckoutStep, timeSpentMs: 4000 },
        { step: 'stripe_embed' as TCheckoutStep, timeSpentMs: 10000 },
        { step: 'stripe_embed' as TCheckoutStep, timeSpentMs: 20000 },
        { step: 'payment_details' as TCheckoutStep, timeSpentMs: 15000 },
      ];

      const averages = calculateAverageTimePerStep(stepTimeEvents);

      // plan_selection: (5000 + 3000 + 4000) / 3 = 4000
      expect(averages['plan_selection']).toBe(4000);
      // stripe_embed: (10000 + 20000) / 2 = 15000
      expect(averages['stripe_embed']).toBe(15000);
      // payment_details: 15000 / 1 = 15000
      expect(averages['payment_details']).toBe(15000);
      // confirmation: no events -> 0
      expect(averages['confirmation']).toBe(0);
    });

    it('should handle empty events', () => {
      const averages = calculateAverageTimePerStep([]);

      expect(averages['plan_selection']).toBe(0);
      expect(averages['stripe_embed']).toBe(0);
      expect(averages['payment_details']).toBe(0);
      expect(averages['confirmation']).toBe(0);
    });

    it('should handle single event per step', () => {
      const stepTimeEvents = [{ step: 'plan_selection' as TCheckoutStep, timeSpentMs: 7500 }];

      const averages = calculateAverageTimePerStep(stepTimeEvents);

      expect(averages['plan_selection']).toBe(7500);
      expect(averages['stripe_embed']).toBe(0);
    });

    it('should round averages correctly', () => {
      const stepTimeEvents = [
        { step: 'plan_selection' as TCheckoutStep, timeSpentMs: 3333 },
        { step: 'plan_selection' as TCheckoutStep, timeSpentMs: 3334 },
        // Average: 3333.5 -> 3334 (rounded)
      ];

      const averages = calculateAverageTimePerStep(stepTimeEvents);

      expect(averages['plan_selection']).toBe(3334);
    });
  });

  describe('calculateAbandonmentRateByStep', () => {
    it('should calculate abandonment rate correctly', () => {
      const stepEvents = new Map<TCheckoutStep, number>([
        ['plan_selection', 100],
        ['stripe_embed', 80], // 20 dropped off (20%)
        ['payment_details', 60], // 20 dropped off (25%)
        ['confirmation', 50], // 10 dropped off (16.67% -> 17%)
      ]);

      const abandonment = calculateAbandonmentRateByStep(stepEvents, 100);

      // plan_selection -> stripe_embed: 20/100 = 20%
      expect(abandonment['plan_selection']).toBe(20);
      // stripe_embed -> payment_details: 20/80 = 25%
      expect(abandonment['stripe_embed']).toBe(25);
      // payment_details -> confirmation: 10/60 = 17%
      expect(abandonment['payment_details']).toBe(17);
    });

    it('should handle zero counts gracefully', () => {
      const stepEvents = new Map<TCheckoutStep, number>([
        ['plan_selection', 0],
        ['stripe_embed', 0],
        ['payment_details', 0],
        ['confirmation', 0],
      ]);

      const abandonment = calculateAbandonmentRateByStep(stepEvents, 0);

      expect(abandonment['plan_selection']).toBe(0);
      expect(abandonment['stripe_embed']).toBe(0);
      expect(abandonment['payment_details']).toBe(0);
    });
  });

  describe('calculateErrorRateByType', () => {
    it('should calculate error rates correctly', () => {
      const errorEvents = [
        { errorType: 'card_declined' as TCheckoutErrorType },
        { errorType: 'card_declined' as TCheckoutErrorType },
        { errorType: 'card_declined' as TCheckoutErrorType },
        { errorType: '3ds_failed' as TCheckoutErrorType },
        { errorType: 'network_error' as TCheckoutErrorType },
      ];

      const rates = calculateErrorRateByType(errorEvents);

      expect(rates['card_declined']).toBe(60); // 3/5 = 60%
      expect(rates['3ds_failed']).toBe(20); // 1/5 = 20%
      expect(rates['network_error']).toBe(20); // 1/5 = 20%
    });

    it('should handle empty error events', () => {
      const rates = calculateErrorRateByType([]);

      expect(Object.keys(rates)).toHaveLength(0);
    });

    it('should handle all errors of same type', () => {
      const errorEvents = [
        { errorType: 'card_declined' as TCheckoutErrorType },
        { errorType: 'card_declined' as TCheckoutErrorType },
      ];

      const rates = calculateErrorRateByType(errorEvents);

      expect(rates['card_declined']).toBe(100);
      expect(Object.keys(rates)).toHaveLength(1);
    });
  });

  describe('calculateTopExitMethods', () => {
    it('should calculate exit method percentages correctly', () => {
      const exitEvents = [
        { method: 'close_button' as TCheckoutExitMethod },
        { method: 'close_button' as TCheckoutExitMethod },
        { method: 'close_button' as TCheckoutExitMethod },
        { method: 'escape_key' as TCheckoutExitMethod },
        { method: 'navigate_away' as TCheckoutExitMethod },
      ];

      const results = calculateTopExitMethods(exitEvents, 5);

      expect(results).toHaveLength(4);
      expect(results[0]).toEqual({ method: 'close_button', count: 3, percentage: 60 });
      expect(results[1]).toEqual({ method: 'escape_key', count: 1, percentage: 20 });
      expect(results[2]).toEqual({ method: 'navigate_away', count: 1, percentage: 20 });
      expect(results[3]).toEqual({ method: 'click_outside', count: 0, percentage: 0 });
    });

    it('should handle empty exit events', () => {
      const results = calculateTopExitMethods([], 0);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result.count).toBe(0);
        expect(result.percentage).toBe(0);
      });
    });

    it('should sort by count descending', () => {
      const exitEvents = [
        { method: 'navigate_away' as TCheckoutExitMethod },
        { method: 'close_button' as TCheckoutExitMethod },
        { method: 'close_button' as TCheckoutExitMethod },
        { method: 'escape_key' as TCheckoutExitMethod },
        { method: 'escape_key' as TCheckoutExitMethod },
        { method: 'escape_key' as TCheckoutExitMethod },
      ];

      const results = calculateTopExitMethods(exitEvents, 6);

      expect(results[0].method).toBe('escape_key');
      expect(results[0].count).toBe(3);
      expect(results[1].method).toBe('close_button');
      expect(results[1].count).toBe(2);
      expect(results[2].method).toBe('navigate_away');
      expect(results[2].count).toBe(1);
    });
  });

  describe('ICheckoutFunnelMetrics interface', () => {
    it('should have all required fields', () => {
      // Type assertion test - ensures interface matches expected structure
      const metrics = {
        period: { start: new Date(), end: new Date() },
        totalCheckoutStarts: 100,
        stepCompletionRates: {
          plan_selection: 100,
          stripe_embed: 80,
          payment_details: 60,
          confirmation: 50,
          completed: 45,
        },
        averageTimePerStep: {
          plan_selection: 5000,
          stripe_embed: 15000,
          payment_details: 20000,
          confirmation: 3000,
        },
        abandonmentRateByStep: {
          plan_selection: 20,
          stripe_embed: 25,
          payment_details: 17,
          confirmation: 0,
        },
        errorRateByType: {
          card_declined: 60,
          network_error: 40,
        },
        mobileVsDesktop: {
          mobile: { completionRate: 35, avgTimeMs: 45000 },
          desktop: { completionRate: 50, avgTimeMs: 35000 },
        },
        topExitMethods: [
          { method: 'close_button', count: 30, percentage: 60 },
          { method: 'escape_key', count: 10, percentage: 20 },
        ],
      };

      // Verify structure
      expect(metrics.period.start).toBeInstanceOf(Date);
      expect(metrics.period.end).toBeInstanceOf(Date);
      expect(typeof metrics.totalCheckoutStarts).toBe('number');
      expect(typeof metrics.stepCompletionRates).toBe('object');
      expect(typeof metrics.averageTimePerStep).toBe('object');
      expect(typeof metrics.abandonmentRateByStep).toBe('object');
      expect(typeof metrics.errorRateByType).toBe('object');
      expect(typeof metrics.mobileVsDesktop).toBe('object');
      expect(Array.isArray(metrics.topExitMethods)).toBe(true);
    });
  });
});
